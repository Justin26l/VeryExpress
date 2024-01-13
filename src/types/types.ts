export interface compilerOptions {
    headerComment?: string;
    modelsTemplate?: string;
    controllersTemplate?: string;
}

export interface jsonSchema {
    type: string;
    'x-documentConfig': documentConfig;
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
    [key: string]: any
}

export interface documentConfig {
    documentName: string;
    documentType?: 'primary' | 'secondary';
    interfaceName: string;
    keyPrefix?: string;
    methods: method[]
}

/**
 * fieldsName : fieldsType
 */
export interface additionalKeyObj {
    [key: string]: string;
}

export enum method {
    get = 'get',
    post = 'post',
    put = 'put',
    patch = 'patch',
    delete = 'delete',
    options = 'options',
    head = 'head',
    trace = 'trace'
};
