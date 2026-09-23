import { describe, expect, it, vi, beforeEach } from "vitest";

const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn() }));

vi.mock("../../src/utils/logger", () => ({
    default: {
        process: vi.fn(),
        writing: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("../../src/utils", () => ({
    default: {
        common: {
            writeFile: (...args: unknown[]) => writeFile(...args),
        },
        generator: { isShowSoftDeleted: () => false },
        template: { format: (s: string) => s },
    },
}));

import { compile } from "../../src/generators/services/accountStateGuard.generator";
import * as types from "../../src/types/types";

function doc(
    documentName: string,
    properties: { [key: string]: types.jsonSchemaPropsItem },
    required: string[] = [],
): { path: string, schema: types.jsonSchema } {
    return {
        path: `./schemas/${documentName}.json`,
        schema: {
            type: "object",
            "x-documentConfig": { documentName, restApi: { methods: ["get"] } },
            properties,
            required,
        },
    };
}

const identity = (): types.jsonSchemaPropsItem =>
    ({ type: "string", "x-format": types.xFormatType.PrimaryUUID, "x-vexData": types.xVexDataType.UserId, index: true }) as types.jsonSchemaPropsItem;

const marker = (): types.jsonSchemaPropsItem =>
    ({ type: "boolean", default: false, "x-vexData": types.xVexDataType.SoftDelete }) as types.jsonSchemaPropsItem;

function emitted(): string {
    const call = writeFile.mock.calls.at(-1);
    return String(call?.[2] ?? "");
}

async function run(documents: { path: string, schema: types.jsonSchema }[]): Promise<void> {
    await compile({
        documents,
        serviceDir: "./out/src/system/_services",
        compilerOptions: {} as types.compilerOptions,
    });
}

beforeEach(() => {
    writeFile.mockClear();
});

/**
 * The guard's whole reason to exist is that a deleted account's unexpired access token must stop
 * working. Its correctness hinges on reading the marker VALUE rather than relying on the adapter
 * hiding the row — under `app.showSoftDeleted` a visibility-based check would call every tombstone
 * alive.
 */
describe("accountStateGuard generator", () => {
    it("emits a no-op when the identity document declares no marker", async () => {
        await run([doc("Account", { _id: identity(), label: { type: "string" } })]);

        const source = emitted();
        expect(source).toContain("export async function isActiveIdentity");
        expect(source).toContain("return true;");
        expect(source).not.toContain("findOneWithDeleted");
    });

    it("emits a real check when the identity document declares a marker", async () => {
        await run([
            doc("User", { _id: identity(), deleted: marker() }, ["deleted"]),
        ]);

        const source = emitted();
        expect(source).toContain("findOneWithDeleted");
        expect(source).toContain(`const identityField = "_id";`);
        expect(source).toContain(`const softDeleteField = "deleted";`);
    });

    it("reads the marker value, so the answer does not depend on showSoftDeleted", async () => {
        await run([doc("User", { _id: identity(), deleted: marker() }, ["deleted"])]);

        const source = emitted();
        expect(source).toContain("[softDeleteField] !== true");
        // the registry flag may only appear in the explanatory comment, never in executable code
        const code = source
            .split("\n")
            .filter(line => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
            .join("\n");
        expect(code).not.toContain("showSoftDeleted");
    });

    it("ignores a marker on a document that is not the identity source", async () => {
        await run([
            doc("User", { _id: identity() }),
            doc("Job", { _id: { type: "string" } as types.jsonSchemaPropsItem, deleted: marker() }, ["deleted"]),
        ]);

        expect(emitted()).toContain("return true;");
    });

    it("honours a marker whose field is not named \"deleted\"", async () => {
        await run([
            doc("User", { _id: identity(), removed: marker() }, ["removed"]),
        ]);

        expect(emitted()).toContain(`const softDeleteField = "removed";`);
    });
});
