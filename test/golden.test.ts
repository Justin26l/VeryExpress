import fs from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runGeneration } from "./helpers/generate";
import {
    describeFirstDiff,
    dumpTree,
    goldenExists,
    readGolden,
    writeGolden,
} from "./helpers/golden";
import { scenariosDir } from "./helpers/paths";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const KEEP_TMP = process.env.KEEP_TMP === "1";

const scenarios = fs
    .readdirSync(scenariosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const tempDirs: string[] = [];

afterAll(() => {
    if (KEEP_TMP) {
        for (const dir of tempDirs) console.log(`kept temp dir: ${dir}`);
        return;
    }
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe("golden output", () => {
    it("has at least one scenario fixture", () => {
        expect(scenarios.length).toBeGreaterThan(0);
    });

    for (const scenario of scenarios) {
        it(`generates the expected tree for "${scenario}"`, () => {
            const result = runGeneration(path.join(scenariosDir, scenario));
            tempDirs.push(result.workDir);

            expect(
                result.status,
                `generation exited ${result.status}\n${result.stderr}`,
            ).toBe(0);

            expect(
                fs.existsSync(result.outDir),
                `no generated output at ${result.outDir}`,
            ).toBe(true);

            const actual = dumpTree(result.outDir, result.workDir, scenario);

            if (UPDATE) {
                writeGolden(scenario, actual);
                return;
            }

            expect(
                goldenExists(scenario),
                `no golden file for "${scenario}" — run: npm run test:update`,
            ).toBe(true);

            const expected = readGolden(scenario);
            if (actual !== expected) {
                // keep the mismatch on disk so it can be diffed by hand
                const artifact = path.join(result.workDir, "actual.golden.txt");
                fs.writeFileSync(artifact, actual, "utf8");

                expect.fail(
                    `${describeFirstDiff(actual, expected)}\n\n` +
                    `  actual dump: ${artifact}\n` +
                    `  inspect:     diff ${artifact} test/golden/${scenario}.txt\n` +
                    `  regenerate:  npm run test:update`,
                );
            }
        });
    }
});
