export function processing(msg: any, ...optionalParams: any[]): void {
    console.log("\x1b[34m%s\x1b[0m", "[PROCESSING]" , new Date().toLocaleString() +" -", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function ok(msg: any, ...optionalParams: any[]): void {
    console.log("\x1b[32m%s\x1b[0m", "[OK]" , new Date().toLocaleString() +" -", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function info(msg: any, ...optionalParams: any[]): void {
    console.log("\x1b[36m%s\x1b[0m", "[INFO]" , new Date().toLocaleString() +" -", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function warn(msg: any, ...optionalParams: any[]): void {
    console.log("\x1b[33m%s\x1b[0m", "[WARN]" , new Date().toLocaleString() +" -", msg, optionalParams.length > 0 ? optionalParams : "");
}

export function error(msg: any, ...optionalParams: any[]): never {
    errorNoExit(msg, optionalParams);
    process.exit(1);
}

export function errorNoExit(msg: any, ...optionalParams: any[]): void {
    console.log("\x1b[41m%s\x1b[0m", "[ERROR]" , new Date().toLocaleString() +" -", msg, optionalParams.length > 0 ? optionalParams : "");
}

// wrapper 
export function infoMongo(msg: any, ...optionalParams: any[]): void {
    info("[MONGO]", msg, optionalParams);
}

export function errorMongo(msg: any, ...optionalParams: any[]): void {
    errorNoExit("[MONGO]", msg, optionalParams);
}

export function infoSql(msg: any, ...optionalParams: any[]): void {
    info("[SQL]", msg, optionalParams);
}

export function errorSql(msg: any, ...optionalParams: any[]): never {
    error("[SQL]", msg, optionalParams);
}

export default {
    process : processing,
    ok,
    info,
    warn,
    error,
    errorNoExit,

    infoMongo,
    errorMongo,
    infoSql,
    errorSql,
};
