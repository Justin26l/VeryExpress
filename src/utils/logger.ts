export function processing(msg: string, ...optionalParams: string[]): void {
    console.log("\x1b[34m%s\x1b[0m", "[PROCESSING]", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function writing(msg: string, ...optionalParams: string[]): void {
    console.log("\x1b[32m%s\x1b[0m", "[WRITING]", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function info(msg: string, ...optionalParams: string[]): void {
    console.log("\x1b[36m%s\x1b[0m", "[INFO]", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function warn(msg: string, ...optionalParams: string[]): void {
    console.log("\x1b[33m%s\x1b[0m", "[WARN]", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function error(msg: string, ...optionalParams: string[]): void {
    console.log("\x1b[41m%s\x1b[0m", "[ERROR]", msg, optionalParams.length > 0 ? optionalParams : "");
    process.exit(1);
}

export default {
    process : processing,
    writing,
    info,
    warn,
    error,
};
