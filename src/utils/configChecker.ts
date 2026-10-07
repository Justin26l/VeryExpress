import * as types from "~/types/types";

/**
 * Refuse a non-boolean for a switch that is documented as a boolean.
 *
 * `auth.firebase: "true"` reads as "on" to a human and as truthy to JavaScript, but the gate compares
 * with `=== true` — so the feature would silently not be generated. Failing here names the key instead.
 */
function checkBoolean(value: unknown, key: string): void {
    if (value !== undefined && typeof value !== "boolean") {
        throw new Error(`vex.config.${key} must be true or false, got ${JSON.stringify(value)}`);
    }
}

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

    checkBoolean(options.auth?.firebase, "auth.firebase");
}

export default {
    checkConfigValid
};