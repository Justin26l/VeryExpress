export interface compilerOptions {
    jsonSchemaDir: string,
    openapiDir: string,
    rootDir: string,
    srcDir: string,
    sysDir: string,

    generator: {
        disableVersionLabel?: boolean;
        commitBeforeGenerate: boolean;
    },

    app: {
        enableSwagger: boolean,
        useUserSchema: boolean,
        useObjectID: boolean,
        allowApiCreateUpdate_id: boolean,
        useStatefulRedisAuth: boolean,
    },

    useRBAC?: {
        roles: string[]
        default: string,
        schemaIncluded: string[]
    },

    sso:{
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
        headerComment: string,
        writtedDir: string[],
    },
}

export interface roleJson {
    [key: string]: string[];
}

export interface jsonSchema {
    type: string;
    "x-documentConfig": documentConfig;
    properties: {
        [key: string]: jsonSchemaPropsItem;
    };
    required?: string[];
    index?: string[];
    [key: string]: any;
}

export interface jsonSchemaPropsItem {
    type: string;
    description?: string;
    format?: string;
    properties?: { 
        [key: string]: jsonSchemaPropsItem;
    };
    items?: jsonSchemaPropsItem;
    enum?: any[];
    required?: boolean | string[];
    index?: boolean;
    example?: any;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    "x-vexData"?: string;
    "x-format"?: string;
    "x-foreignKey"?: string;
    "x-foreignValue"?: string[];
    [key: string]: string | boolean | number | string[] | jsonSchemaPropsItem | { [key: string]: jsonSchemaPropsItem;} | any[] | undefined;
}

export interface populateOptions { 
    [key: string]: string,
}

export interface documentConfig {
    documentName: string;
    keyPrefix?: string;
    methods: schemaMethod[];
}

/**
 * fieldsName : fieldsType
 */
export interface removeKeyObj {
    [key: string]: string;
}

/** method key allowed in json schema, httpMethod with extra "getList" */
export type schemaMethod = "get" | "getList" | "post" | "put" | "patch" | "delete" | "options" | "head" | "trace" ;

export const schemaMethodArr : schemaMethod[] = [ "get", "getList", "post", "put", "patch", "delete", "options", "head", "trace" ];

/** schemaMethod without "getList" */
export type httpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head" | "trace" ;
export const httpMethodArr : httpMethod[] = [ "get", "post", "put", "patch", "delete", "options", "head", "trace"];
