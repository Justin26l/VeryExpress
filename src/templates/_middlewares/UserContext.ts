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
    run<T>(tokenData: Record<string, unknown>, fn: () => T): T {
        return als.run({ tokenData }, fn);
    }

    getStore(): UserContextData | undefined {
        return als.getStore();
    }

    /** Normalized identity of the authenticated caller. */
    get userId(): string | undefined {
        return userIdOfToken(als.getStore()?.tokenData);
    }
}

export default new UserContext();
