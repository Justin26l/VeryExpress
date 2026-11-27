import * as types from "~/types/types";
import { isAuthEnabled, isJwtAuthEnabled, isRbacEnabled, isVerifyOnlyAuthEnabled } from "~/utils/generator";

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
        && tenant.IsolationMode !== "option"
        && tenant.IsolationMode !== "single") {
        throw new Error(
            `vex.config.tenant.IsolationMode must be "preSelect", "option" or "single", got ${JSON.stringify(tenant.IsolationMode)}`,
        );
    }

    if (tenant.IsolationMode === "single" && !tenant.enable) {
        throw new Error(
            `vex.config.tenant.IsolationMode is "single" but tenant.enable is false — ` +
            `single mode resolves the user's membership at login and needs the module's tables.`,
        );
    }

    if (tenant.enable && tenant.IsolationMode === "single" && isVerifyOnlyAuthEnabled(options)) {
        throw new Error(
            `vex.config.tenant.IsolationMode is "single" cannot be combined with auth.verifyOnly — ` +
            `login mints a tenant-scoped token, and a verify-only app issues none. Use "preSelect".`,
        );
    }

    if (tenant.enable && tenant.IsolationMode === "single" && !isJwtAuthEnabled(options)) {
        throw new Error(
            `vex.config.tenant.IsolationMode is "single" needs a JWT sign-in method — ` +
            `login is where single mode mints the tenant claim. Enable auth.localAuth or an OAuth provider.`,
        );
    }

    if (tenant.enable && tenant.IsolationMode === "option" && isVerifyOnlyAuthEnabled(options)) {
        throw new Error(
            `vex.config.tenant.IsolationMode is "option" cannot be combined with auth.verifyOnly — ` +
            `selecting a tenant mints a tenant-scoped token, and a verify-only app issues none. Use "preSelect".`,
        );
    }

    if (tenant.enable && tenant.IsolationMode === "option" && !isJwtAuthEnabled(options)) {
        throw new Error(
            `vex.config.tenant.IsolationMode is "option" but the app enables no JWT authentication — ` +
            `the user must log in before selecting a tenant.`,
        );
    }

    checkStringArray(tenant.scope, "tenant.scope");
    if (tenant.scope !== undefined) {
        if (tenant.scope.length === 0) {
            throw new Error("vex.config.tenant.scope must not be empty — omit it to apply to every route.");
        }
        for (const prefix of tenant.scope) {
            if (!prefix.startsWith("/")) {
                throw new Error(`vex.config.tenant.scope entry must start with "/", got ${JSON.stringify(prefix)}`);
            }
        }
    }
}

function checkAuth(options: types.compilerOptions): void {
    checkBoolean(options.auth?.verifyOnly, "auth.verifyOnly");
    if (!isVerifyOnlyAuthEnabled(options)) return;

    if (isAuthEnabled(options)) {
        throw new Error(
            `vex.config.auth.verifyOnly cannot be combined with a sign-in method ` +
            `(auth.localAuth, an OAuth provider, or auth.firebase) — one app signs in, the other ` +
            `only verifies. Turn the sign-in method off in this app.`,
        );
    }

    if (isRbacEnabled(options)) {
        throw new Error(
            `vex.config.auth.verifyOnly cannot be combined with useRBAC — role assignments live in the ` +
            `app's own UserRole table, which a verify-only app does not own. Read the roles off the ` +
            `token, or run RBAC in the app that signs in.`,
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
    checkAuth(options);
    checkTenant(options);
    checkDeleteAccount(options);
}

export default {
    checkConfigValid
};
