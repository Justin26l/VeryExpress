interface ColumnDef {
    name: string;
    tsType: string;
    isPrimary: boolean;
    isUUID?: boolean;
    isGenerated: boolean;
    nullable: boolean;
    maxLength?: number;
}

export default function objectionTemplate(options: {
    documentName: string,
    columns: ColumnDef[],
    tableName: string,
    compilerOptions?: unknown,
}) {
    const doc = options.documentName;
    const table = options.tableName;

    const columnDecorators = options.columns.map(col => {
        const decorators: string[] = [];
        if (col.isPrimary) {
            const pkArg = col.isUUID ? '"uuid"' : '"increment"';
            decorators.push(`    @PrimaryGeneratedColumn(${pkArg})`);
            decorators.push(`    ${col.name}!: ${col.tsType};`);
        } else {
            const colArgs = col.maxLength ? `{ length: ${col.maxLength}, nullable: ${col.nullable} }` : `{ nullable: ${col.nullable} }`;
            decorators.push(`    @Column(${colArgs})`);
            decorators.push(`    ${col.name}${col.nullable ? "?" : "!"}: ${col.tsType};`);
        }
        return decorators.join("\n");
    }).join("\n\n");

    return `{{headerComment}}
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { ${doc} } from './../_types/${doc}.gen';

export interface ${doc}Document extends ${doc} {}

@Entity("${table}")
export class ${doc}Entity implements Partial<${doc}Document> {
${columnDecorators}
}
`;
}
