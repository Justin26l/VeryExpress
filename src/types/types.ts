export interface VexFileMeta {
    lastWriteVersion: string;
    allowOverwrite: boolean;
}

export interface VexMeta {
    lastGeneratedVersion?: string;
    files: { [relPath: string]: VexFileMeta };
}

export interface compilerOptions {
    jsonSchemaDir: string,
    openapiDir: string,
    rootDir: string,
    srcDir: string,
    sysDir: string,

    generator: {
        commitBeforeGenerate: boolean;
    },
    // database target type: 'sql' (TypeORM/PostgreSQL) or 'mongo' (Mongoose/MongoDB)
    dbType?: "sql" | "mongo",

    app: {
        enableSwagger: boolean,
        useUserSchema: boolean,
        allowApiCreateUpdate_id: boolean,
        useStatefulRedisAuth: boolean,
    },

    useRBAC?: {
        roles: string[]
        default: string,
    },

    auth:{
        localAuth: boolean,
        useHttpOnlyCookieToken?: boolean,
        oauthProviders?: {
            google?: boolean,
            microsoft?: boolean,
            apple?: boolean,
            github?: boolean,
            [key: string]: boolean | undefined;
        };
    },

    _: {
        writtedDir: string[],
    },
}

export interface roleJson {
    [key: string]: string[];
}

export enum DbRelationType {
    OneToOne = "one-to-one",
    OneToMany = "one-to-many",
    ManyToOne = "many-to-one",
}

export interface jsonSchema {
    type: string;
    "x-documentConfig": documentConfig;
    properties: {
        [key: string]: jsonSchemaPropsItem;
    };
    required?: string[];
    index?: string[];
    interface?: {
        fkProps: {
            propName: string;
            interfaceName: string;
            relationType: DbRelationType;
        }[];
    };
    [key: string]: any;
}

export interface foreignKeyConfig {
    schemaName: string;
    fieldName: string;
    relationType: DbRelationType;
}

export interface jsonSchemaPropsItem {
    type: string;
    description?: string;
    format?: string;
    properties?: { 
        [key: string]: jsonSchemaPropsItem;
    };
    items?: jsonSchemaPropsItem;
    enum?: string[];
    required?: boolean | string[];
    index?: boolean;
    unique?: string[];
    example?: any;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    "x-vexData"?: string;
    "x-format"?: string;
    "x-hidden"?: boolean;
    "x-foreignKey"?: foreignKeyConfig;
    [key: string]: string | boolean | number | string[] | jsonSchemaPropsItem | foreignKeyConfig | { [key: string]: jsonSchemaPropsItem;} | any[] | undefined;
}

export interface populateOptions { 
    [key: string]: string,
}

export interface documentConfig {
    documentName: string;
    keyPrefix?: string;
    uniqueIndex?: string[][];
    restApi: {
        methods: schemaMethod[];
        joinWhitelist?: string[];
        noRelations?: boolean;
    };
}

/**
 * fieldsName : fieldsType
 */
export interface removeKeyObj {
    [key: string]: string;
}

/** method key allowed in json schema, httpMethod with extra "getList" */
export type schemaMethod = "get" | "getList" | "post" | "put" | "patch" | "delete" ;

export const schemaMethodArr : schemaMethod[] = [ "get", "getList", "post", "put", "patch", "delete"];

/** schemaMethod without "getList" */
export type httpMethod = "get" | "post" | "put" | "patch" | "delete" ;
export const httpMethodArr : httpMethod[] = [ "get", "post", "put", "patch", "delete"];
