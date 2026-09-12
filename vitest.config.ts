import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
    resolve: {
        // mirror tsconfig.json "~/*" -> "src/*" so tests can import generator internals
        alias: { "~": srcDir },
    },
    test: {
        include: ["test/**/*.test.ts"],
        environment: "node",
        // golden scenarios spawn a full generation each; give them room
        testTimeout: 120_000,
        hookTimeout: 120_000,
    },
});
