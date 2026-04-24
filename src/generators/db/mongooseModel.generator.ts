import utils from "../../utils";
import log from "../../utils/logger";
import fs from "fs";
import * as types from "../../types/types";
import path from "path";
import j2m from "json2mongoose";

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

    modelsGen.compileFromFile(
        options.schemaPath,
        `${typeRelPath}/${documentName}.gen`,
        outPath,
        { use_id: true },
    );

    // rename export to match controller expectations (${doc}Entity)
    const content: string = fs.readFileSync(outPath, "utf8");
    const patched = content
        .replace(/export const \w+Model\b/g, `export const ${documentName}Entity`)
        .replace(/mongoose\.model<\w+Document>\("\w+"/g, `mongoose.model<${documentName}Document>("${documentName}"`);
    utils.common.writeFile("Mongoose Model (patch)", outPath, patched);
}

export default { compile };

