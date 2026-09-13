import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { distEntry, repoRoot } from "./paths";

/**
 * End-to-end harness: generate a real app, install it, build it, boot it against a
 * real Postgres, and drive it over HTTP.
 *
 * State lives in `test/.e2e/` (gitignored) and is deliberately persistent so repeat
 * runs skip the expensive `npm install`:
 *
 *   test/.e2e/vex.config.json   generation config for the e2e app
 *   test/.e2e/schemas/          schema dir the generator writes into
 *   test/.e2e/app/              the generated app, incl. its own node_modules
 */

export const E2E_ROOT = path.join(repoRoot, "test", ".e2e");
export const APP_DIR = path.join(E2E_ROOT, "app");
export const SCHEMA_DIR = path.join(E2E_ROOT, "schemas");

export const APP_PORT = 3199;
const PG_CONTAINER = "vex-e2e-pg";
const PG_PORT = 55432;
const PG_IMAGE = "postgres:16-alpine";

const E2E_CONFIG = {
    jsonSchemaDir: "./schemas",
    rootDir: "./app",
    dbType: "sql",
    app: {
        enableSwagger: true,
        useUserSchema: true,
        useObjectID: true,
        allowApiCreateUpdate_id: false,
    },
    auth: {
        localAuth: true,
        useHttpOnlyCookieToken: true,
        oauthProviders: { google: false, github: false },
    },
    useRBAC: { roles: ["visitor", "member", "admin"], default: "admin" },
    generator: { commitBeforeGenerate: false },
};

/**
 * Environment for child processes.
 *
 * `npm_config_allow_scripts` is stripped deliberately: npm 11 rejects it outright in
 * project-scoped installs (`EALLOWSCRIPTS`) because it treats an env-provided value
 * as a CLI flag, which the RFC forbids outside global/exec contexts. Removing it
 * makes the harness behave identically on every machine instead of only where that
 * variable happens to be unset.
 */
function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const env = { ...process.env, ...extra };
    delete env.npm_config_allow_scripts;
    return env;
}

function run(command: string, args: string[], cwd: string): string {
    const result = spawnSync(command, args, { cwd, encoding: "utf8", env: cleanEnv() });
    if (result.status !== 0) {
        throw new Error(
            `\`${command} ${args.join(" ")}\` failed in ${cwd} (exit ${result.status})\n` +
            `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
        );
    }
    return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

async function waitFor(
    label: string,
    predicate: () => boolean | Promise<boolean>,
    timeoutMs: number,
    intervalMs = 250,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

/**
 * Regenerate the e2e app with the current compiled generator.
 *
 * Only the generated tree is replaced — `node_modules` is left alone so the
 * expensive install survives across runs.
 */
export function generateApp(): void {
    if (!fs.existsSync(distEntry)) {
        throw new Error(`Compiled generator missing at ${distEntry}. Run "npm run compile" first.`);
    }

    fs.mkdirSync(SCHEMA_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(E2E_ROOT, "vex.config.json"),
        JSON.stringify(E2E_CONFIG, null, 4),
        "utf8",
    );

    run(process.execPath, [distEntry], E2E_ROOT);
}

export function installAppIfNeeded(): void {
    if (fs.existsSync(path.join(APP_DIR, "node_modules"))) return;

    // Dedicated cache inside the harness dir: keeps the install hermetic and avoids
    // depending on a writable global npm cache (which is not a given in sandboxes/CI).
    const cacheDir = process.env.VEX_E2E_NPM_CACHE ?? path.join(E2E_ROOT, ".npm-cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    // `--ignore-scripts` keeps the install deterministic; none of the app's deps need
    // lifecycle scripts to build or run.
    run("npm", [
        "install", "--no-audit", "--no-fund", "--ignore-scripts", "--cache", cacheDir,
    ], APP_DIR);
}

/** tsoa spec + tsc. Produces `src/openapi/swagger.json` and `dist/server.js`. */
export function buildApp(): void {
    run("npx", ["tsoa", "spec-and-routes"], APP_DIR);
    run("npx", ["tsc", "-p", "."], APP_DIR);
    run(process.execPath, ["scripts/build.js"], APP_DIR);
}

function docker(args: string[]): string {
    return run("docker", args, repoRoot);
}

function containerRunning(): boolean {
    const out = spawnSync("docker", ["ps", "--filter", `name=^${PG_CONTAINER}$`, "--format", "{{.Names}}"], {
        encoding: "utf8",
    });
    return (out.stdout ?? "").trim() === PG_CONTAINER;
}

/**
 * Ensure a Postgres is reachable and return its connection URL.
 *
 * Honours `VEX_E2E_DB_URL` when set (CI with a service container); otherwise starts
 * a throwaway Docker container. Reports whether it started one, so the caller can
 * clean up what it created.
 */
export async function ensurePostgres(): Promise<{ url: string; startedByUs: boolean }> {
    const external = process.env.VEX_E2E_DB_URL;
    if (external) return { url: external, startedByUs: false };

    const alreadyRunning = containerRunning();

    if (!alreadyRunning) {
        docker([
            "run", "--rm", "-d",
            "--name", PG_CONTAINER,
            "-p", `${PG_PORT}:5432`,
            "-e", "POSTGRES_PASSWORD=postgres",
            "-e", "POSTGRES_USER=postgres",
            "-e", "POSTGRES_DB=vexdb",
            PG_IMAGE,
        ]);
    }

    await waitFor("postgres readiness", () => {
        const probe = spawnSync(
            "docker",
            ["exec", PG_CONTAINER, "pg_isready", "-U", "postgres"],
            { encoding: "utf8" },
        );
        return probe.status === 0;
    }, 60_000, 500);

    return {
        url: `postgresql://postgres:postgres@localhost:${PG_PORT}/vexdb`,
        // only tear down a container this run created; never someone else's
        startedByUs: !alreadyRunning,
    };
}

export function stopPostgres(): void {
    if (containerRunning()) docker(["rm", "-f", PG_CONTAINER]);
}

export interface RunningApp {
    baseUrl: string;
    stop: () => Promise<void>;
}

/**
 * Boot the generated app as a real server process and wait until it can serve
 * traffic with a live database connection.
 *
 * The app's own readiness signal is the TypeORM connector log line: `/hello`
 * answers before the DataSource is up, so polling it alone would race.
 */
export async function startApp(dbUrl: string): Promise<RunningApp> {
    const child: ChildProcess = spawn(process.execPath, ["dist/server.js"], {
        cwd: APP_DIR,
        env: cleanEnv({
            SQL_URI: dbUrl,
            SQL_SYNCHRONIZE: "true",
            APP_PORT: String(APP_PORT),
            APP_HOST: "http://localhost",
        }),
        stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });

    const baseUrl = `http://localhost:${APP_PORT}`;

    const stop = async (): Promise<void> => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill("SIGTERM");
        await waitFor("app shutdown", () => child.exitCode !== null || child.signalCode !== null, 10_000);
    };

    try {
        await waitFor(
            "app database connection",
            () => output.includes("TypeORM DataSource initialized")
                || output.includes("Failed to initialize TypeORM"),
            90_000,
        );

        if (!output.includes("TypeORM DataSource initialized")) {
            throw new Error(`app never connected to the database. Output:\n${output}`);
        }

        await waitFor("GET /hello", async () => {
            try {
                const res = await fetch(`${baseUrl}/hello`);
                return res.ok;
            } catch {
                return false;
            }
        }, 30_000);
    } catch (error) {
        await stop();
        throw error;
    }

    return { baseUrl, stop };
}

export function readSpec(): any {
    const specPath = path.join(APP_DIR, "src", "openapi", "swagger.json");
    return JSON.parse(fs.readFileSync(specPath, "utf8"));
}

/** Resolve a local `$ref` (`#/components/schemas/X`) against the spec. */
export function resolveRef(spec: any, schema: any): any {
    if (!schema?.$ref) return schema;
    const name = schema.$ref.split("/").pop() as string;
    return spec.components.schemas[name];
}

export const VARIANTS_DIR = path.join(E2E_ROOT, "variants");

export interface CompileResult {
    errors: string[];
    workDir: string;
}

/**
 * Generate an app for one config variant and type-check it.
 *
 * Reuses the main app's installed `node_modules` through a symlink, so checking a
 * variant costs a generation plus a `tsc` run instead of another full install.
 *
 * This is the cheapest guard against a whole class of bug: generated code that
 * references something which does not exist in that configuration. Three such bugs
 * lived in the "RBAC off + auth on" path, which stayed unreachable until empty
 * `useRBAC` stopped aborting generation.
 */
export function compileVariant(name: string, config: Record<string, unknown>): CompileResult {
    const workDir = path.join(VARIANTS_DIR, name);
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(workDir, "schemas"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "vex.config.json"), JSON.stringify(config, null, 4), "utf8");

    run(process.execPath, [distEntry], workDir);

    const appDir = path.join(workDir, "app");
    fs.symlinkSync(path.join(APP_DIR, "node_modules"), path.join(appDir, "node_modules"), "dir");

    // server.ts imports the generated tsoa routes, so the spec step must run first
    run("npx", ["tsoa", "spec-and-routes"], appDir);

    const result = spawnSync("npx", ["tsc", "-p", ".", "--noEmit"], {
        cwd: appDir,
        encoding: "utf8",
        env: cleanEnv(),
    });

    const errors = `${result.stdout ?? ""}${result.stderr ?? ""}`
        .split("\n")
        .filter((line) => line.includes("error TS"));

    return { workDir, errors };
}
