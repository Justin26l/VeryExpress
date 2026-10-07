import { describe, expect, it } from "vitest";

import { isAccountDeletionEnabled, isAuthEnabled, isRbacEnabled, isShowSoftDeleted, OAuthProviders } from "../../src/utils/generator";
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

/**
 * Account deletion is opt-out: absent config means on. The two ways it can be off are an explicit
 * `deleteAccount: false` and an auth-less app — a deletion endpoint that cannot authenticate the
 * caller could only ever delete the wrong account.
 */
describe("isAccountDeletionEnabled", () => {
    const authOn = { localAuth: true, oauthProviders: {} } as compilerOptions["auth"];

    it("defaults to true when deleteAccount is unset and auth is on", () => {
        expect(isAccountDeletionEnabled({ auth: authOn } as compilerOptions)).toBe(true);
    });

    it("honours an explicit false", () => {
        expect(
            isAccountDeletionEnabled(
                { auth: { ...authOn, deleteAccount: false } } as compilerOptions,
            ),
        ).toBe(false);
    });

    it("honours an explicit true", () => {
        expect(
            isAccountDeletionEnabled(
                { auth: { ...authOn, deleteAccount: true } } as compilerOptions,
            ),
        ).toBe(true);
    });

    it("is false when auth is disabled, even if deleteAccount is true", () => {
        expect(
            isAccountDeletionEnabled({
                auth: { localAuth: false, oauthProviders: {}, deleteAccount: true },
            } as compilerOptions),
        ).toBe(false);
    });
});

/**
 * `app.showSoftDeleted` is the adapter visibility switch. Absent means "hide soft-deleted rows"
 * (the safe default); only an explicit true lifts the filter.
 */
describe("isShowSoftDeleted", () => {
    it("is false when app.showSoftDeleted is unset", () => {
        expect(isShowSoftDeleted({ app: {} } as compilerOptions)).toBe(false);
    });

    it("is false when explicitly false", () => {
        expect(isShowSoftDeleted({ app: { showSoftDeleted: false } } as compilerOptions)).toBe(false);
    });

    it("is true only when explicitly true", () => {
        expect(isShowSoftDeleted({ app: { showSoftDeleted: true } } as compilerOptions)).toBe(true);
    });
});
