import { DbRelationType } from "./types";

export interface ColumnDef {
    name: string;
    tsType: string;
    dbType: string;
    isPrimary: boolean;
    isGenerated: boolean;
    isIndex?: boolean;
    isUnique?: boolean;
    /** object or array column — @Index() is skipped */
    isNested?: boolean;
    /** PostgreSQL native array column → @Column({ array: true }) */
    isArray?: boolean;
    /** bigint columns: PG driver returns string, transformer coerces to number */
    needsBigintTransformer?: boolean;
    /** minimum >= 0 numeric field → unsigned: true (MySQL only, no-op on PG) */
    unsigned?: boolean;
    nullable: boolean;
    length?: number;
    /** decimal type: total significant digits */
    precision?: number;
    /** decimal type: digits after decimal point */
    scale?: number;
    enumValues?: string[];
    /** auto-generated ENUM type name — prevents TypeORM cross-entity naming conflicts */
    enumName?: string;
    comment?: string;
    /** default column value emitted as @Column({ default }) */
    defaultValue?: unknown;
    /** SQL expression default, e.g. "EXTRACT(EPOCH FROM NOW())::bigint" — emitted as @Column({ default: () => "<expr>" }) */
    defaultRaw?: string;
    /** SQL ON UPDATE expression, e.g. "EXTRACT(EPOCH FROM NOW())::bigint" — emitted as @Column({ onUpdate: "expr" }) */
    onUpdateRaw?: string;
}


/** owning or inverse side of one-to-one / many-to-one */
export interface ManyToOneRelation {
    propertyName: string;
    targetEntity: string;
    targetType: string;
    importPath: string;
    /** present on owning side; omit on inverse side (no @JoinColumn) */
    joinColumnName?: string;
    /** present on inverse side for @OneToOne(() => X, x => x.field) */
    inversePropertyName?: string;
    relationType: DbRelationType;
}

export interface OneToManyRelation {
    propertyName: string;
    targetEntity: string;
    targetType: string;
    importPath: string;
    inversePropertyName: string;
    relationType: DbRelationType;
}
