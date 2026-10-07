import { describe, expect, it } from "vitest";

import UserContext, { userIdOfToken } from "../../src/templates/_middlewares/UserContext";

/**
 * `UserContext` is a plain module (its only import is `async_hooks`), so unlike the
 * repository-adapter templates it can be exercised directly.
 *
 * This is the layer the whole audit-field feature hangs off: if the identity is read
 * wrongly here, every `createdBy` / `updatedBy` written by any downstream app is wrong,
 * and a module-level variable would additionally cross-contaminate concurrent requests.
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
    });

    it("exposes the identity inside run() and restores the outer scope after it", () => {
        const inside = UserContext.run({ vexUserId: "u-1" }, () => UserContext.userId);

        expect(inside).toBe("u-1");
        expect(UserContext.userId).toBeUndefined();
    });

    it("keeps the whole token payload readable, not just the identity", () => {
        const token = UserContext.run(
            { vexUserId: "u-1", vexRole: "admin" },
            () => UserContext.getStore()?.tokenData,
        );

        expect(token).toMatchObject({ vexUserId: "u-1", vexRole: "admin" });
    });

    it("survives await points inside the context", async () => {
        const observed = await UserContext.run({ vexUserId: "u-1" }, async () => {
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 1));
            return UserContext.userId;
        });

        expect(observed).toBe("u-1");
    });

    /**
     * The reason this is AsyncLocalStorage and not a module-level variable: Express
     * interleaves requests on one thread, so each in-flight handler must keep seeing
     * its own caller. The staggered delays force the continuations to interleave.
     */
    it("isolates concurrent request contexts from each other", async () => {
        const ids = ["user-a", "user-b", "user-c"];

        const observed = await Promise.all(ids.map((id, index) => UserContext.run(
            { vexUserId: id },
            async () => {
                await new Promise((resolve) => setTimeout(resolve, 4 - index));
                await Promise.resolve();
                return UserContext.userId;
            },
        )));

        expect(observed).toEqual(ids);
    });
});
