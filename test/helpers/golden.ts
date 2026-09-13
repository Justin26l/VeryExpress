import fs from "node:fs";
import path from "node:path";

import { goldenDir } from "./paths";
import { canonicalizeMetaJson, normalizeContent } from "./normalize";

const FILE_SEPARATOR = "=====";

/** Recursively collect file paths under `root`, sorted for a stable dump. */
function walk(root: string, prefix = ""): string[] {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...walk(path.join(root, entry.name), rel));
        } else {
            files.push(rel);
        }
    }
    return files;
}

/**
 * Serialize a generated tree into one normalized text document.
 *
 * A single file per scenario (rather than a mirrored directory of hundreds of
 * files) keeps golden diffs small and reviewable: a regression shows up as one
 * hunk in one file.
 */
export function dumpTree(outDir: string, workDir: string, scenario: string): string {
    const lines: string[] = [
        `# Golden output — scenario "${scenario}"`,
        "#",
        "# Regenerate with:  npm run test:update",
        "# Not hand-edited. Content is normalized: generator version pinned to",
        "# <version>, absolute temp paths removed.",
        "",
    ];

    for (const rel of walk(outDir)) {
        const absolute = path.join(outDir, rel);
        const raw = fs.readFileSync(absolute, "utf8");
        let normalized = normalizeContent(raw, workDir);
        if (rel === ".vex/meta.json") normalized = canonicalizeMetaJson(normalized);
        lines.push(`${FILE_SEPARATOR} out/${rel} ${FILE_SEPARATOR}`);
        lines.push(normalized.endsWith("\n") ? normalized.trimEnd() : normalized);
        lines.push("");
    }

    return lines.join("\n");
}

export function goldenPath(scenario: string): string {
    return path.join(goldenDir, `${scenario}.txt`);
}

export function readGolden(scenario: string): string {
    return fs.readFileSync(goldenPath(scenario), "utf8");
}

export function writeGolden(scenario: string, content: string): void {
    fs.mkdirSync(goldenDir, { recursive: true });
    fs.writeFileSync(goldenPath(scenario), content, "utf8");
}

export function goldenExists(scenario: string): boolean {
    return fs.existsSync(goldenPath(scenario));
}

/**
 * Describe the first difference between two dumps, so a failure points at the
 * offending file and line instead of dumping a megabyte of diff.
 */
export function describeFirstDiff(actual: string, expected: string): string {
    const a = actual.split("\n");
    const b = expected.split("\n");

    let currentFile = "<unknown>";
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]?.startsWith(`${FILE_SEPARATOR} `)) currentFile = a[i];
        if (a[i] === b[i]) continue;
        return [
            `first difference at file ${currentFile}, line ${i + 1}`,
            `  golden: ${JSON.stringify(b[i] ?? "<missing>")}`,
            `  actual: ${JSON.stringify(a[i] ?? "<missing>")}`,
            `  golden lines: ${b.length}, actual lines: ${a.length}`,
        ].join("\n");
    }
    return "no difference found";
}
