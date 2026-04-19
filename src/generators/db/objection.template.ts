export default function objectionTemplate(options: {
    documentName: string,
    jsonSchemaString: string,
    compilerOptions?: any,
}) {
    const doc = options.documentName;
    const table = doc.toLowerCase();
    const className = `${doc}ObjectionModel`;
    const jsonSchema = options.jsonSchemaString || "{}";

    return `{{headerComment}}
import { Model } from 'objection';
import { createMongooseLikeModel } from '../_utils/objectionShim.gen';

export type ${doc}Document = import("../_types/${doc}.gen").${doc};

export class ${className} extends Model {
    static tableName = "${table}";
    static idColumn = "id";
    static jsonSchema = ${jsonSchema};
}

export const ${doc}Model = createMongooseLikeModel<${doc}Document>(${className});
export default ${doc}Model;
`;
}
