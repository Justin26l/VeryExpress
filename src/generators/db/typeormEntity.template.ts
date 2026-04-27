import { DbRelationType } from "../../types/types";

interface ColumnDef {
    name: string;
    tsType: string;
    isPrimary: boolean;
    isUUID?: boolean;
    isGenerated: boolean;
    nullable: boolean;
    maxLength?: number;
    isArray?: boolean;
    isBigInt?: boolean;
    isObject?: boolean;
    hasIndex?: boolean;
}

export interface ManyToOneRelation {
    propertyName: string;
    targetEntity: string;
    importPath: string;
    joinColumnName: string;
    relationType: DbRelationType;
}

export interface OneToManyRelation {
    propertyName: string;
    targetEntity: string;
    importPath: string;
    inversePropertyName: string;
    relationType: DbRelationType;
}

export default function objectionTemplate(options: {
    documentName: string,
    columns: ColumnDef[],
    tableName: string,
    manyToOneRelations?: ManyToOneRelation[],
    oneToManyRelations?: OneToManyRelation[],
    compilerOptions?: unknown,
}) {
    const doc = options.documentName;
    const table = options.tableName;
    const manyToOne = options.manyToOneRelations ?? [];
    const oneToMany = options.oneToManyRelations ?? [];
    const hasRelations = manyToOne.length > 0 || oneToMany.length > 0;
    const hasOneToOne = [...manyToOne, ...oneToMany].some(r => r.relationType === DbRelationType.OneToOne);

    // build dynamic typeorm import
    const typeormImports = ["Entity", "Column", "PrimaryGeneratedColumn"];
    const hasIndexDecorator = options.columns.some(c => c.hasIndex && !c.isArray && !c.isObject);
    if (hasIndexDecorator) typeormImports.push("Index");
    if (hasRelations) typeormImports.push("Relation", "JoinColumn");
    if (manyToOne.some(r => r.relationType === DbRelationType.OneToMany)) typeormImports.push("ManyToOne");
    if (oneToMany.some(r => r.relationType === DbRelationType.OneToMany)) typeormImports.push("OneToMany");
    if (hasOneToOne) typeormImports.push("OneToOne");

    // cross-entity imports (deduplicated)
    const entityImports = [
        ...manyToOne.map(r => `import { ${r.targetEntity} } from "${r.importPath}";`),
        ...oneToMany.map(r => `import { ${r.targetEntity} } from "${r.importPath}";`),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const columnDecorators = options.columns.map(col => {
        const decorators: string[] = [];
        if (col.isPrimary) {
            const pkArg = col.isUUID ? "uuid" : "increment";
            decorators.push(`    @PrimaryGeneratedColumn("${pkArg}")`);
            decorators.push(`    ${col.name}!: ${col.tsType};`);
        } else {
            let colArgs: string;
            if (col.isArray) {
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
            if (col.hasIndex && !col.isArray && !col.isObject) {
                decorators.push("    @Index()");
            }
            decorators.push(`    @Column(${colArgs})`);
            decorators.push(`    ${col.name}${col.nullable ? "?" : "!"}: ${col.tsType};`);
        }
        return decorators.join("\n");
    }).join("\n\n");

    const manyToOneDecorators = manyToOne.map(r => {
        const decorator = r.relationType === DbRelationType.OneToOne ? "@OneToOne" : "@ManyToOne";
        return [
            `    ${decorator}(() => ${r.targetEntity})`,
            `    @JoinColumn({ name: "${r.joinColumnName}" })`,
            `    ${r.propertyName}?: Relation<${r.targetEntity}>;`,
        ].join("\n");
    }).join("\n\n");

    const oneToManyDecorators = oneToMany.map(r => {
        const decorator = r.relationType === DbRelationType.OneToOne ? "@OneToOne" : "@OneToMany";
        const inverse = r.relationType === DbRelationType.OneToOne
            ? `() => ${r.targetEntity}`
            : `() => ${r.targetEntity}, ${r.propertyName.replace("List", "")} => ${r.propertyName.replace("List", "")}.${r.inversePropertyName}`;
        return [
            `    ${decorator}(${inverse})`,
            `    ${r.propertyName}?: Relation<${r.targetEntity}${r.relationType === DbRelationType.OneToMany ? "[]" : ""}>;`,
        ].join("\n");
    }).join("\n\n");

    const relationBlock = [manyToOneDecorators, oneToManyDecorators].filter(Boolean).join("\n\n");

    return `{{headerComment}}
import { ${typeormImports.join(", ")} } from "typeorm";
import { ${doc} } from "./../_types/${doc}.gen";
${entityImports.length ? entityImports.join("\n") + "\n" : ""}
export interface ${doc}Document extends ${doc} {}

@Entity("${table}")
export class ${doc}Entity implements Partial<${doc}Document> {
${columnDecorators}${relationBlock ? "\n\n" + relationBlock : ""}
}
`;
}

