import { DbRelationType } from "./types";

export interface ColumnDef {
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
    isEnum?: boolean;
    enumValues?: string[];
    isIndex?: boolean;
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
