
export interface openapi {
    openapi: string,
    info: {
        title: string,
        description: string,
        version: string,
    },
    paths: paths,
    components: components,
}

export interface paths {
    [key:string]: {
        "x-collection"?: string, // 'x-collection' is a custom field for specify db collection
        "x-interface"?: string, // 'x-interfaceName' is a custom field for specify interfaceName
        summary?: string,
        get?: method,
        post?: method,
        put?: method,
        patch?: method,
        delete?: method,
        options?: method,
        head?: method,
        trace?: method,
        // [key:string]: method | string | undefined,
    }
}

export interface method {
    summary?: string,
    operationId: string, // method + interfaceName
    tags: string[], 
    parameters: parameter[],
    requestBody?: requestBody,
    responses: responses,
}

export interface parameter {
    name: string;
    in: "query" | "header" | "path" | "cookie";
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    allowEmptyValue?: boolean;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    schema: {
        type: string;
        format?: string;
        "x-format"?: string;
        required?: string[];
        minLength?: number;
        maxLength?: number;
        minimum?: number;
        maximum?: number;
        enum?: string[];
    };
    example?: any; // This could be any type depending on your example structure
    examples?: any; // This could be any type depending on your examples structure
}

export interface requestBody {
    description: string;
    required: boolean;
    content?: {
        "application/json": {
            schema: {
                $ref: string;
            };
        };
    };
}

export interface responses {
    [key:number]: responseItem,
}

export interface responseItem {
    description: string;
    content?: {
        "application/json"?: {
            schema: {
                $ref?: string;
                [key:string]:any
            };
        };
    };
}

/**
 * OpenAPI 3.0 Components
 */
export interface components {
    schemas: {
        [key:string]: componentsSchemaValue
    }
}

export interface componentsSchemaValue {
    type: string,
    items?: any,
    required?: string[],
    properties?: {
        [key:string]: fieldsItem,
    }
}

export interface fieldsItem {
    type: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    maxItems?: number;
    maxProperties?: number;
    uniqueItems?: boolean;
    enum?: string[];
    [key:string]: any;
}