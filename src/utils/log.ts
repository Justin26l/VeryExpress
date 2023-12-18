export function processing(msg: any, ...optionalParams: any[]): void {
    console.log('\x1b[36m%s\x1b[0m', '[Processing]', msg, optionalParams.length > 0 ? optionalParams : '');
}

export function writing(msg: any, ...optionalParams: any[]): void {
    console.log('\x1b[32m%s\x1b[0m', '[Writing]', msg, optionalParams.length > 0 ? optionalParams : '');
}

export function error(msg: any, ...optionalParams: any[]): void {
    console.log('\x1b[31m%s\x1b[0m', '[Error]', msg, optionalParams.length > 0 ? optionalParams : '');
    process.exit(1);
}

export default {
    process : processing,
    writing,
    error,
};
