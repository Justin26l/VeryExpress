import * as types from "~/types/types";
import { isJwtAuthEnabled } from "~/utils/generator";

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

function checkStringArray(value: unknown, key: string): void {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
        throw new Error(`vex.config.${key} must be an array of non-empty strings, got ${JSON.stringify(value)}`);
    }
}

function checkTenant(options: types.compilerOptions): void {
    const tenant = options.tenant;
    if (!tenant) return;

    const legacyKeys = ["header", "resolve", "claim", "bypassRoles", "userField", "membership"];
    const present = legacyKeys.filter(key => key in (tenant as unknown as Record<string, unknown>));
    if (present.length > 0) {
        throw new Error(
            `vex.config.tenant no longer accepts ${present.map(k => `"${k}"`).join(", ")}. ` +
            `Use { "enable": true, "IsolationMode": "preSelect" | "option" }.`,
        );
    }

    if (typeof tenant.enable !== "boolean") {
        throw new Error(`vex.config.tenant.enable must be true or false, got ${JSON.stringify(tenant.enable)}`);
    }

    if (tenant.IsolationMode !== undefined
        && tenant.IsolationMode !== "preSelect"
        && tenant.IsolationMode !== "option") {
        throw new Error(
            `vex.config.tenant.IsolationMode must be "preSelect" or "option", got ${JSON.stringify(tenant.IsolationMode)}`,
        );
    }

    if (tenant.enable && tenant.IsolationMode === "option" && !isJwtAuthEnabled(options)) {
        throw new Error(
            `vex.config.tenant.IsolationMode is "option" but the app enables no JWT authentication — ` +
            `the user must log in before selecting a tenant.`,
        );
    }
}

function checkDeleteAccount(options: types.compilerOptions): void {
    const setting = options.auth?.deleteAccount;
    if (setting === undefined || typeof setting === "boolean") return;

    if (typeof setting !== "object" || Array.isArray(setting)) {
        throw new Error(
            `vex.config.auth.deleteAccount must be true, false, or an object, got ${JSON.stringify(setting)}`,
        );
    }

    checkBoolean(setting.enabled, "auth.deleteAccount.enabled");
    checkStringArray(setting.deleteTables, "auth.deleteAccount.deleteTables");
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
    checkTenant(options);
    checkDeleteAccount(options);
}

export default {
    checkConfigValid
};
