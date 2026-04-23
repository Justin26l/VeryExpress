interface MongooseFieldDef {
    name: string;
    mongooseType: string;
    required: boolean;
    maxLength?: number;
}

export default function mongooseModelTemplate(options: {
    documentName: string;
    fields: MongooseFieldDef[];
}): string {
    const doc = options.documentName;

    const schemaFields = options.fields.map(f => {
        const parts: string[] = [`type: ${f.mongooseType}`];
        if (f.required) parts.push("required: true");
        if (f.maxLength) parts.push(`maxlength: ${f.maxLength}`);
        return `    ${f.name}: { ${parts.join(", ")} },`;
    }).join("\n");

    return `{{headerComment}}
import mongoose, { Schema, Document, Model } from "mongoose";
import { ${doc} } from "./../_types/${doc}.gen";

export interface ${doc}Document extends ${doc}, Document {}

const ${doc}Schema = new Schema<${doc}Document>(
    {
${schemaFields}
    },
    { timestamps: true }
);

export const ${doc}Entity: Model<${doc}Document> = mongoose.model<${doc}Document>("${doc}", ${doc}Schema);
`;
}
