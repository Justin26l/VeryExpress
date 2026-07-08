import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";

/**
 * Generates VexFieldRegistry.gen.ts — maps entity class names → list of
 * auto-managed fields and their x-vexData type.
 *
 * The repository adapters read this registry at runtime to inject
 * userId / unix timestamps during create() and update().
 */
export async function compile(options: {
    allSchemas: types.jsonSchema[];
    middlewareDir: string;
}): Promise<void> {
    log.process("Vex Field Registry");

    const VEX_VALUES = [
        types.xVexDataType.UserId,
        types.xVexDataType.UnixTimestampOnCreate,
        types.xVexDataType.UnixTimestampOnUpdate,
    ] as string[];

    const entries: string[] = [];

    for (const schema of options.allSchemas) {
        const documentName = schema["x-documentConfig"].documentName;
        const fields: { field: string; type: string }[] = [];

        for (const [key, prop] of Object.entries(schema.properties ?? {})) {
            const vd = utils.jsonSchema.getXVexData(prop["x-vexData"]);
            if (vd && VEX_VALUES.includes(vd)) {
                fields.push({ field: key, type: vd });
            }
        }

        if (fields.length === 0) continue;

        const fieldEntries = fields.map(
            f => `      { field: "${f.field}", type: "${f.type}" }`
        );
        entries.push(
            `    "${documentName}Entity": [\n${fieldEntries.join(",\n")}\n    ]`
        );
    }

    if (entries.length === 0) return;

    const source = `// {{headerComment}}
export interface VexFieldEntry {
  field: string;
  type: "userId" | "unixTimestampOnCreate" | "unixTimestampOnUpdate";
}

export const entityVexFields: Record<string, VexFieldEntry[]> = {
${entries.join(",\n")}
};
`;

    const outPath = `${options.middlewareDir}/VexFieldRegistry.gen.ts`;
    utils.common.writeFile("Vex Field Registry", outPath, utils.template.format(source));
}
