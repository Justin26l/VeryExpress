// {{headerComment}}
import { AsyncLocalStorage } from "async_hooks";

/** Identity-bearing claims carried from the verified access token, plus request scope. */
export interface UserContextData {
    tokenData?: Record<string, unknown>;
    /** Tenant the client asked for, captured from the request header before authentication. */
    requestedTenantId?: string;
    /** Tenant of this request. The DB layer reads only this value. */
    tenantId?: string;
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

/**
 * Request-scoped values shared by middleware layers.
 *
 * `run` layers a patch onto whatever the enclosing layer established, so a later
 * middleware (authentication) does not erase what an earlier one (tenant header) set.
 * The store is replaced, never merged in place, so concurrent requests stay isolated.
 */
class UserContext {
    run<T>(patch: Partial<UserContextData>, fn: () => T): T {
        return als.run({ ...als.getStore(), ...patch }, fn);
    }

    /** Merge into the store of the enclosing `run`. Throws outside a request scope. */
    set(patch: Partial<UserContextData>): void {
        const store = als.getStore();
        if (!store) throw new Error("UserContext.set called outside a request scope");
        Object.assign(store, patch);
    }

    getStore(): UserContextData | undefined {
        return als.getStore();
    }

    /** Normalized identity of the authenticated caller. */
    get userId(): string | undefined {
        return userIdOfToken(als.getStore()?.tokenData);
    }

    get requestedTenantId(): string | undefined {
        return als.getStore()?.requestedTenantId;
    }

    get tenantId(): string | undefined {
        return als.getStore()?.tenantId;
    }
}

export default new UserContext();
