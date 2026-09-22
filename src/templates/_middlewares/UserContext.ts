// {{headerComment}}
import { AsyncLocalStorage } from "async_hooks";

/** Identity-bearing claims carried from the verified access token. */
export interface UserContextData {
    tokenData: Record<string, unknown>;
}

/**
 * Pure: identity value carried by a verified access token.
 *
 * `vexUserId` is the schema-declared identity (the field tagged `x-vexData: "userId"`,
 * which JWTService copies into the token); `_id` keeps tokens issued before that claim
 * existed working.
 */
export function userIdOfToken(tokenData: Record<string, unknown> | undefined): string | undefined {
    return (tokenData?.vexUserId as string | undefined) ?? (tokenData?._id as string | undefined);
}

const als = new AsyncLocalStorage<UserContextData>();

class UserContext {
    /**
     * Enter the per-request identity context.
     *
     * Called ONLY by Authentication.middleware, after token verification succeeded — at
     * that point a verified token always exists, so this runs unconditionally. The store
     * is the request's context; whether it carries a usable identity is decided when it
     * is read (`userId`), not when it is created.
     *
     * Never use `enterWith()`: it mutates the current execution context instead of
     * scoping a new one, and leaks into whatever runs next on the same tick.
     */
    run<T>(tokenData: Record<string, unknown>, fn: () => T): T {
        return als.run({ tokenData }, fn);
    }

    /** Current store from the per-request async context. */
    getStore(): UserContextData | undefined {
        return als.getStore();
    }

    /**
     * Normalized identity of the authenticated caller.
     *
     * The data layer MUST read the identity through this accessor and never inspect the
     * token shape itself — that keeps the token → identity mapping in exactly one place.
     */
    get userId(): string | undefined {
        return userIdOfToken(als.getStore()?.tokenData);
    }
}

export default new UserContext();
