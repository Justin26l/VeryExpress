import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (this file lives in <repo>/test/helpers/). */
export const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** The compiled CLI bundle. Golden tests exercise the real artifact users run. */
export const distEntry = path.join(repoRoot, "dist", "index.js");

export const scenariosDir = path.join(repoRoot, "test", "fixtures", "scenarios");
export const goldenDir = path.join(repoRoot, "test", "golden");
