import { DbRelationType } from "../../types/types";
import * as typeormModel from "../../types/typeormModel";
import utils from "../../utils";

export default function objectionTemplate(options: {
    documentName: string,
    tableName: string,
    uniqueIndexes?: string[][],
    columns: typeormModel.ColumnDef[],
    manyToOneRelations?: typeormModel.ManyToOneRelation[],
    oneToManyRelations?: typeormModel.OneToManyRelation[],
    oneToOneRelations?: typeormModel.ManyToOneRelation[],
    compilerOptions?: unknown,
}) {
    const doc = options.documentName;
    const table = options.tableName;
    const manyToOne = options.manyToOneRelations ?? [];
    const oneToMany = options.oneToManyRelations ?? [];
    const oneToOne = options.oneToOneRelations ?? [];
    const hasRelations = manyToOne.length > 0 || oneToMany.length > 0 || oneToOne.length > 0;

    // build dynamic typeorm import
    const typeormImports = ["Entity", "Column", "PrimaryGeneratedColumn"];
    const hasUniqueIndexes = options.uniqueIndexes && options.uniqueIndexes.length > 0;
    const hasIndexDecorator = options.columns.some(c => c.isIndex && !c.isArray && !c.isObject);
    
    if (hasUniqueIndexes) typeormImports.push("Unique");
    if (hasIndexDecorator) typeormImports.push("Index");
    if (hasRelations) typeormImports.push("Relation", "JoinColumn");
    if (manyToOne.length > 0) typeormImports.push("ManyToOne");
    if (oneToMany.length > 0) typeormImports.push("OneToMany");
    if (oneToOne.length > 0) typeormImports.push("OneToOne");


    // cross-entity imports (deduplicated)
    const entityImports = [
        ...manyToOne.map(r => `import { ${r.targetEntity}, ${r.targetType} } from "${r.importPath}";`),
        ...oneToMany.map(r => `import { ${r.targetEntity}, ${r.targetType} } from "${r.importPath}";`),
        ...oneToOne.map(r => `import { ${r.targetEntity}, ${r.targetType} } from "${r.importPath}";`),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const uniqueIndexes = options.uniqueIndexes?.map((cols, idx) => {
        const indexName = `unique_${cols.join("_")}`;
        const colList = cols.map(c => `'${c}'`).join(", ");
        return `@Unique('${indexName}', [${colList}])`;
    }) ?? [];

    // enum types are defined in the _types file and re-exported; collect import names
    const enumImports = options.columns
        .filter(col => col.isEnum)
        .map(col => col.tsType);

    const columnDecorators = options.columns.map(col => {
        const decorators: string[] = [];
        if (col.isPrimary) {
            const pkArg = col.isUUID ? "uuid" : "increment";
            decorators.push(`    @PrimaryGeneratedColumn("${pkArg}")`)
            decorators.push(`    ${col.name}!: ${col.tsType};`);
        } else {
            let colArgs: string;
            if (col.isEnum && col.enumValues) {
                // PostgreSQL native ENUM type — use enum object for type safety
                colArgs = `{ type: "enum", enum: ${col.tsType}, nullable: ${col.nullable} }`;
            } else if (col.isArray) {
                colArgs = `{ type: "text", array: true, nullable: ${col.nullable} }`;
            } else if (col.isObject) {
                colArgs = `{ type: "jsonb", nullable: ${col.nullable} }`;
            } else if (col.isBigInt) {
                colArgs = `{ type: "bigint", nullable: ${col.nullable}, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } }`;
            } else if (col.maxLength) {
                colArgs = `{ length: ${col.maxLength}, nullable: ${col.nullable} }`;
            } else {
                colArgs = `{ nullable: ${col.nullable} }`;
            }
            if (col.isIndex && !col.isArray && !col.isObject) {
                decorators.push("    @Index()");
            }
            decorators.push(`    @Column(${colArgs})`);
            decorators.push(`    ${col.name}${col.nullable ? "?" : "!"}: ${col.tsType};`);
        }
        return decorators.join("\n");
    }).join("\n\n");

    const oneToOneDecorators = oneToOne.map(r => {
        const decorator = r.inversePropertyName
            ? `    @OneToOne(() => ${r.targetEntity}, ${utils.common.camelCase(r.targetEntity)} => ${utils.common.camelCase(r.targetEntity)}.${r.inversePropertyName})`
            : `    @OneToOne(() => ${r.targetEntity})`;
        const lines = [decorator];
        if (r.joinColumnName) lines.push(`    @JoinColumn({ name: "${r.joinColumnName}" })`);
        lines.push(`    ${r.propertyName}?: Relation<${r.targetType}>;`);
        return lines.join("\n");
    }).join("\n\n");

    const manyToOneDecorators = manyToOne.map(r => {
        return [
            `    @ManyToOne(() => ${r.targetEntity})`,
            `    @JoinColumn({ name: "${r.joinColumnName}" })`,
            `    ${r.propertyName}?: Relation<${r.targetType}>;`,
        ].join("\n");
    }).join("\n\n");

    const oneToManyDecorators = oneToMany.map(r => {
        return [
            `    @OneToMany(() => ${r.targetEntity}, ${utils.common.camelCase(r.targetEntity)} => ${utils.common.camelCase(r.targetEntity)}.${r.inversePropertyName})`,
            `    ${r.propertyName}?: Relation<${r.targetType}[]>;`,
        ].join("\n");
    }).join("\n\n");

    const relationBlock = [oneToOneDecorators, manyToOneDecorators, oneToManyDecorators].filter(Boolean).join("\n\n");

    const typeImports = [doc, ...enumImports].join(", ");

    return `{{headerComment}}
import { ${typeormImports.join(", ")} } from "typeorm";
import { ${typeImports} } from "./../_types/${doc}.gen";
${entityImports.length ? entityImports.join("\n") + "\n" : ""}

export * from "./../_types/${doc}.gen";

@Entity("${table}")
${uniqueIndexes.join("\n")}
export class ${doc}Entity implements Partial<${doc}> {
${columnDecorators}${relationBlock ? "\n\n" + relationBlock : ""}
}
`;
}

