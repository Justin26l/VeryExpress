export interface compilerOptions {
    headerComment?: string;
    modelsTemplate?: string;
    controllersTemplate?: string;
}

export interface jsonSchema {
    type: string;
    'x-documentConfig': documentConfig;
    properties: {
        [key: string]: {
            type: string;
            format?: string;
            index?: boolean;
            required?: boolean;
            description?: string;
            example?: any;
            [key: string]: any
        }
    };
    required?: string[];
    index?: string[];
    [key: string]: any;
}

export interface documentConfig {
    documentName: string;
    documentType?: 'primary' | 'secondary';
    interfaceName: string;
    keyPrefix?: string;
    methods: method[]
}

export enum method {
    get     = 'get',
    post    = 'post',
    put     = 'put',
    patch   = 'patch',
    delete  = 'delete',
    options = 'options',
    head    = 'head',
    trace   = 'trace'
};
