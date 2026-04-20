import fs from "fs";
import path from "path";

type ManifestEntry = { filename: string; table: string; dependsOn: string[] };

function readManifest(migDir: string): ManifestEntry[] | null {
    const manifestPath = path.join(process.cwd(), migDir, "migrations-manifest.json");
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const content = fs.readFileSync(manifestPath, "utf8");
        return JSON.parse(content) as ManifestEntry[];
    }
    catch (e) {
        return null;
    }
}

function parseMigrationFiles(migDir: string): ManifestEntry[] {
    const dir = path.join(process.cwd(), migDir);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    const entries: ManifestEntry[] = [];
    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(dir, file), "utf8");
            const createMatch = content.match(/createTable\(\s*['"]([^'"]+)['"]/i);
            const table = createMatch ? createMatch[1].toLowerCase() : file.toLowerCase();
            const depends: string[] = [];
            const refRegex = /.inTable\(\s*['\"]([^'\"]+)['\"]\s*\)/g;
            let m;
            while ((m = refRegex.exec(content)) !== null) {
                depends.push((m[1] || "").toLowerCase());
            }
            entries.push({ filename: file, table, dependsOn: Array.from(new Set(depends)) });
        }
        catch (e) {
            // ignore parse errors per-file
        }
    }
    return entries;
}

function topoSort(entries: ManifestEntry[]): { order: string[]; cycle: boolean } {
    const tableToFile = new Map(entries.map((e) => [e.table, e.filename]));
    const filenames = entries.map((e) => e.filename);
    const depsMap = new Map<string, string[]>();
    for (const e of entries) {
        const deps = e.dependsOn.map((d) => tableToFile.get(d)).filter(Boolean) as string[];
        depsMap.set(e.filename, Array.from(new Set(deps)));
    }

    const indegree = new Map<string, number>();
    const adj = new Map<string, Set<string>>();
    for (const fn of filenames) { indegree.set(fn, 0); adj.set(fn, new Set()); }
    for (const [fn, deps] of depsMap.entries()) {
        indegree.set(fn, deps.length);
        for (const dep of deps) {
            if (!adj.has(dep)) adj.set(dep, new Set());
            adj.get(dep)!.add(fn);
        }
    }

    const queue = filenames.filter((fn) => (indegree.get(fn) || 0) === 0);
    const order: string[] = [];
    while (queue.length) {
        const fn = queue.shift()!;
        order.push(fn);
        const neighbors = adj.get(fn) || new Set();
        for (const nb of neighbors) {
            indegree.set(nb, (indegree.get(nb) || 0) - 1);
            if ((indegree.get(nb) || 0) === 0) queue.push(nb);
        }
    }
    if (order.length !== filenames.length) {
        return { order: filenames.sort(), cycle: true };
    }
    return { order, cycle: false };
}

async function resolveMigrationOrder(migDir: string): Promise<string[]> {
    const manual = (process.env.SQL_MIGRATIONS_ORDER || "").trim();
    if (manual) return manual.split(",").map((s) => s.trim()).filter(Boolean);

    const manualFile = process.env.SQL_MIGRATIONS_MANUAL_FILE || "";
    if (manualFile) {
        const p = path.isAbsolute(manualFile) ? manualFile : path.join(process.cwd(), manualFile);
        if (fs.existsSync(p)) {
            try {
                const arr = JSON.parse(fs.readFileSync(p, "utf8"));
                if (Array.isArray(arr)) return arr;
            } catch (e) { /* ignore parse error */ }
        }
    }

    const manifest = readManifest(migDir);
    const entries = manifest && manifest.length ? manifest.map((m: any) => ({ filename: m.filename, table: (m.table || "").toLowerCase(), dependsOn: (m.dependsOn || []).map((d: string) => d.toLowerCase()) })) : parseMigrationFiles(migDir);
    if (!entries.length) return [];
    const { order } = topoSort(entries);
    return order;
}

export default {
    resolveMigrationOrder,
    readManifest,
    parseMigrationFiles,
    topoSort,
};
