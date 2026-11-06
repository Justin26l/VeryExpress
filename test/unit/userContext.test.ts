import { describe, expect, it } from "vitest";

import UserContext, { userIdOfToken } from "../../src/templates/_middlewares/UserContext";

/**
 * `UserContext` is a plain module (its only import is `async_hooks`), so unlike the
 * repository-adapter templates it can be exercised directly.
 *
 * This is the layer the whole audit-field and tenant features hang off: if the request
 * scope is read wrongly here, every `createdBy` / `updatedBy` or tenant filter written by
 * any downstream app is wrong, and a module-level variable would cross-contaminate
 * concurrent requests.
 */
describe("userIdOfToken", () => {
    it("prefers the schema-declared vexUserId claim", () => {
        expect(userIdOfToken({ vexUserId: "u-1", _id: "row-9" })).toBe("u-1");
    });

    it("falls back to _id for tokens issued before the claim existed", () => {
        expect(userIdOfToken({ _id: "row-9" })).toBe("row-9");
    });

    it("returns undefined rather than throwing when there is no identity", () => {
        expect(userIdOfToken({})).toBeUndefined();
        expect(userIdOfToken(undefined)).toBeUndefined();
    });
});

describe("UserContext", () => {
    it("has no identity outside a request context", () => {
        expect(UserContext.getStore()).toBeUndefined();
        expect(UserContext.userId).toBeUndefined();
        expect(UserContext.tenantId).toBeUndefined();
    });

    it("exposes the identity inside run() and restores the outer scope after it", () => {
        const inside = UserContext.run(
            { tokenData: { vexUserId: "u-1" } },
            () => UserContext.userId,
        );

        expect(inside).toBe("u-1");
        expect(UserContext.userId).toBeUndefined();
    });

    it("keeps the whole token payload readable, not just the identity", () => {
        const token = UserContext.run(
            { tokenData: { vexUserId: "u-1", vexRole: "admin" } },
            () => UserContext.getStore()?.tokenData,
        );

        expect(token).toMatchObject({ vexUserId: "u-1", vexRole: "admin" });
    });

    it("survives await points inside the context", async () => {
        const observed = await UserContext.run({ tokenData: { vexUserId: "u-1" } }, async () => {
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 1));
            return UserContext.userId;
        });

        expect(observed).toBe("u-1");
    });

    /**
     * Two middleware layers write into the same request: the L0 header capture, then
     * authentication. A patch must layer on top, not replace what the earlier layer set —
     * that is the bug this semantics exists to prevent.
     */
    it("layers a nested run() on top of the enclosing scope", () => {
        const observed = UserContext.run({ requestedTenantId: "tenant-a" }, () => {
            const inside = UserContext.run(
                { tokenData: { vexUserId: "u-1" }, tenantId: "tenant-a" },
                () => ({
                    requestedTenantId: UserContext.requestedTenantId,
                    userId: UserContext.userId,
                    tenantId: UserContext.tenantId,
                }),
            );

            return { inside, requestedAfter: UserContext.requestedTenantId, tenantAfter: UserContext.tenantId };
        });

        expect(observed.inside).toEqual({
            requestedTenantId: "tenant-a",
            userId: "u-1",
            tenantId: "tenant-a",
        });
        // the inner frame does not leak into the outer one
        expect(observed.requestedAfter).toBe("tenant-a");
        expect(observed.tenantAfter).toBeUndefined();
    });

    it("set() merges into the enclosing scope", () => {
        UserContext.run({ requestedTenantId: "tenant-a" }, () => {
            UserContext.set({ tenantId: "tenant-a" });

            expect(UserContext.requestedTenantId).toBe("tenant-a");
            expect(UserContext.tenantId).toBe("tenant-a");
        });
    });

    it("set() refuses to create a scope of its own", () => {
        expect(() => UserContext.set({ tenantId: "tenant-a" })).toThrow(/outside a request scope/);
    });

    /**
     * The reason this is AsyncLocalStorage and not a module-level variable: Express
     * interleaves requests on one thread, so each in-flight handler must keep seeing
     * its own caller. The staggered delays force the continuations to interleave.
     */
    it("isolates concurrent request contexts from each other", async () => {
        const ids = ["user-a", "user-b", "user-c"];

        const observed = await Promise.all(ids.map((id, index) => UserContext.run(
            { tokenData: { vexUserId: id }, tenantId: `tenant-${index}` },
            async () => {
                await new Promise((resolve) => setTimeout(resolve, 4 - index));
                await Promise.resolve();
                return [UserContext.userId, UserContext.tenantId];
            },
        )));

        expect(observed).toEqual([
            ["user-a", "tenant-0"],
            ["user-b", "tenant-1"],
            ["user-c", "tenant-2"],
        ]);
    });
});
