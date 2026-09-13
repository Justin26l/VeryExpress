import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { distEntry } from "./paths";

export interface GenerationResult {
    /** Isolated temp project the CLI ran in. */
    workDir: string;
    /** `<workDir>/out` — the generated app tree. */
    outDir: string;
    status: number | null;
    stdout: string;
    stderr: string;
}

/**
 * Run one real generation for a scenario, in an isolated temp directory.
 *
 * The compiled `dist/index.js` is spawned as a subprocess rather than imported:
 * it mirrors what a user runs, and it keeps the generator's module-level state
 * (`utils.common` written-files set, loaded `.vex/meta.json`) from leaking
 * between scenarios.
 *
 * The scenario supplies only `vex.config.json`. `src/templates/jsonSchema` is
 * copied into the schema dir by the generator itself, so scenarios exercise the
 * shipped sample schemas unless they add their own under `jsonSchema/`.
 */
export function runGeneration(scenarioDir: string): GenerationResult {
    if (!fs.existsSync(distEntry)) {
        throw new Error(`Compiled generator missing at ${distEntry}. Run "npm run compile" first.`);
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vex-golden-"));

    fs.copyFileSync(
        path.join(scenarioDir, "vex.config.json"),
        path.join(workDir, "vex.config.json"),
    );

    // The CLI exits(1) when jsonSchemaDir is missing, and the generator then
    // fills it from src/templates/jsonSchema. So an empty dir is the baseline.
    const schemaDir = path.join(workDir, "schemas");
    fs.mkdirSync(schemaDir, { recursive: true });

    const scenarioSchemas = path.join(scenarioDir, "jsonSchema");
    if (fs.existsSync(scenarioSchemas)) {
        for (const file of fs.readdirSync(scenarioSchemas)) {
            fs.copyFileSync(path.join(scenarioSchemas, file), path.join(schemaDir, file));
        }
    }

    const result = spawnSync(process.execPath, [distEntry], {
        cwd: workDir,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
    });

    return {
        workDir,
        outDir: path.join(workDir, "out"),
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}
