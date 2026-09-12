import { describe, expect, it } from "vitest";

import { isAuthEnabled, OAuthProviders } from "../../src/utils/generator";
import type { compilerOptions } from "../../src/types/types";

function options(auth: compilerOptions["auth"]): compilerOptions {
    return { auth } as compilerOptions;
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
