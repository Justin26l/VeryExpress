import utils from "../../utils";
import log from "../../utils/logger";
import * as types from "../../types/types";
import path from "path";
import j2m from "json2mongoose";
import { hasReservedDefaults, stripReservedDefaults } from "../../preprocess/auditFields";

const { modelsGen } = j2m;

export async function compile(options: {
    jsonSchema: types.jsonSchema,
    schemaPath: string,
    outDir: string,
    typeDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
    const documentName = options.jsonSchema["x-documentConfig"].documentName;
    log.process(`Mongoose Model : ${documentName}`);

    const typeRelPath = path.relative(options.outDir, options.typeDir).replace(/\\/g, "/");
    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;

    // json2mongoose copies `default` straight into the mongoose schema, where a reserved audit
    // keyword would become a literal string default. Feed it a sanitized copy — the adapter
    // owns the audit values, the declaration stays in the source schema.
    const schema = hasReservedDefaults(options.jsonSchema)
        ? stripReservedDefaults(options.jsonSchema)
        : options.jsonSchema;

    const content: string = modelsGen.json2Mongoose(
        schema as never,
        `${typeRelPath}/${documentName}.gen`,
        { use_id: true } as never,
    );

    // rename export to match controller expectations (${doc}Entity)
    const patched = content
        .replace(/export const \w+Model\b/g, `export const ${documentName}Entity`)
        .replace(/mongoose\.model<\w+Document>\("\w+"/g, `mongoose.model<${documentName}Document>("${documentName}"`);
    utils.common.writeFile("Mongoose Model (patch)", outPath, patched);
}

export default { compile };

