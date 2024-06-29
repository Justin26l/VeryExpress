import * as types from "~/types/types";

export function checkConfigValid(options: types.compilerOptions): void {
    if(!options) {
        throw new Error("vex.config is undefined");
    }
    if(!options.srcDir) {
        throw new Error("vex.config.srcDir is undefined");
    }
    if(!options.sysDir) {
        throw new Error("vex.config.sysDir is undefined");
    }
    if(!options.openapiDir) {
        throw new Error("vex.config.openapiDir is undefined");
    }
    if(!options.jsonSchemaDir) {
        throw new Error("vex.config.jsonSchemaDir is undefined");
    }

}

export default {
    checkConfigValid
}