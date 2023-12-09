export interface method {
    summary: string,
    operationId: string,
    tags: string[],
    parameters: parameter[],
    requestBody?: requestBody,
    responses: responses,
}

export interface parameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
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
    };
    example?: any; // This could be any type depending on your example structure
    examples?: any; // This could be any type depending on your examples structure
}

export interface requestBody {
    description: string;
    required: boolean;
    content?: {
        'application/json': {
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
        'application/json': {
            schema: {[key:string]:any};
        };
    };
}