import knexModelTemplate from "./knexModel.template";
import utils from "../../utils";
import log from "../../utils/logger";
import * as types from "../../types/types";

/**
 * compile jsonschema to a simple Knex-backed model wrapper
 * @param options
 */
export async function compile(options: {
    jsonSchema: types.jsonSchema,
    outDir: string,
    compilerOptions: types.compilerOptions,
}): Promise<void> {
    const schema = options.jsonSchema as types.jsonSchema;
    const documentName = schema["x-documentConfig"].documentName;

    log.process(`Knex Model : ${documentName}`);

    const outPath = `${options.outDir}/${documentName}Model.gen.ts`;
    utils.common.writeFile("Knex Model",
        outPath,
        knexModelTemplate({
            documentName,
            tableName: documentName.toLowerCase(),
            compilerOptions: options.compilerOptions,
        })
    );
}

export default {
    compile,
};
