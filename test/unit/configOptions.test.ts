import { describe, expect, it } from "vitest";

import { isAuthEnabled, isRbacEnabled, OAuthProviders } from "../../src/utils/generator";
import type { compilerOptions } from "../../src/types/types";

function options(auth: compilerOptions["auth"]): compilerOptions {
    return { auth } as compilerOptions;
}

function rbacOptions(useRBAC: compilerOptions["useRBAC"]): compilerOptions {
    return { useRBAC } as compilerOptions;
}

describe("OAuthProviders", () => {
    it("returns only providers explicitly set to true", () => {
        const result = OAuthProviders(
            options({ oauthProviders: { google: true, github: false } } as compilerOptions["auth"]),
        );
        expect(result).toEqual(["google"]);
    });

    it("returns an empty list when nothing is enabled", () => {
        const result = OAuthProviders(
            options({ oauthProviders: { google: false, github: false } } as compilerOptions["auth"]),
        );
        expect(result).toEqual([]);
    });
});

describe("isAuthEnabled", () => {
    it("is true when local auth is on", () => {
        expect(
            isAuthEnabled(options({ localAuth: true, oauthProviders: {} } as compilerOptions["auth"])),
        ).toBe(true);
    });

    it("is true when only an OAuth provider is on", () => {
        expect(
            isAuthEnabled(
                options({
                    localAuth: false,
                    oauthProviders: { google: true },
                } as compilerOptions["auth"]),
            ),
        ).toBe(true);
    });

    it("is false when neither is on", () => {
        expect(
            isAuthEnabled(
                options({ localAuth: false, oauthProviders: {} } as compilerOptions["auth"]),
            ),
        ).toBe(false);
    });
});

/**
 * RBAC is opt-in. The critical case is the empty role list: it used to reach
 * `json-schema-to-typescript` as an empty `UserRole.role` enum, which it renders
 * as the invalid type `role: ()` and which aborted the whole generation.
 */
describe("isRbacEnabled", () => {
    it("is true when at least one role is declared", () => {
        expect(isRbacEnabled(rbacOptions({ roles: ["admin"], default: "admin" }))).toBe(true);
    });

    it("is false when useRBAC is absent", () => {
        expect(isRbacEnabled(rbacOptions(undefined))).toBe(false);
    });

    it("is false when the role list is empty", () => {
        expect(isRbacEnabled(rbacOptions({ roles: [], default: "user" }))).toBe(false);
    });

    it("is false when roles is missing entirely", () => {
        expect(isRbacEnabled(rbacOptions({ default: "user" } as compilerOptions["useRBAC"]))).toBe(false);
    });
});
