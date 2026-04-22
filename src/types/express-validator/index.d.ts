// Minimal type stubs for express-validator to satisfy TypeScript when @types/express-validator is not installed.
declare module "express-validator" {
    export type Schema = { [key: string]: any };

    export function checkSchema(schema: Schema): any;
    export function validationResult(req: any): any;

    // Common helpers used in templates/runtime — keep as any to stay permissive
    export function body(...args: any[]): any;
    export function param(...args: any[]): any;
    export function query(...args: any[]): any;
}

export {};
