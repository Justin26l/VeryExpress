import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { beforeEach, describe, expect, it } from "vitest";

/**
 * Client-side JS is shipped verbatim from `src/templates/root/public/js`, so nothing else in the
 * suite ever executes it. These tests run the real file in a minimal DOM stub.
 *
 * The stub's whole point is ordering: the page loads the script from <head>, so it executes BEFORE
 * the <body> exists. A handler that binds at parse time silently attaches to nothing — the HTML
 * still contains the button, so an HTTP-level assertion passes while the button does nothing.
 */

const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "src",
    "templates",
    "root",
    "public",
    "js",
    "deleteaccount.js",
);

interface StubElement {
    id: string;
    value: string;
    disabled: boolean;
    textContent: string;
    addEventListener(type: string, fn: () => void): void;
}

interface Harness {
    run(): void;
    mountBody(): void;
    fireDomReady(): void;
    click(): void;
    elements: Record<string, StubElement>;
    fetchCalls: { url: string; opts: Record<string, unknown> }[];
    store: Record<string, string>;
}

/** Response the stub `fetch` will resolve with; tests mutate it to exercise failure branches. */
let nextResponse: { ok: boolean; status: number; body: unknown };

/** Reproduces the browser ordering: script executes, then the body parses, then DOMContentLoaded. */
function makeHarness(): Harness {
    const elements: Record<string, StubElement> = {};
    const listeners: Record<string, Record<string, () => void>> = {};
    const domReady: (() => void)[] = [];
    const fetchCalls: { url: string; opts: Record<string, unknown> }[] = [];
    const store: Record<string, string> = {};

    const makeElement = (id: string): StubElement => ({
        id,
        value: "",
        disabled: false,
        textContent: "",
        addEventListener(type, fn) {
            listeners[id] = listeners[id] || {};
            listeners[id][type] = fn;
        },
    });

    const document = {
        getElementById: (id: string) => elements[id] || null,
        addEventListener: (type: string, fn: () => void) => {
            if (type === "DOMContentLoaded") domReady.push(fn);
        },
    };

    const localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = String(v); },
        removeItem: (k: string) => { delete store[k]; },
    };

    const fetch = (url: string, opts: Record<string, unknown>) => {
        fetchCalls.push({ url, opts });
        return Promise.resolve({
            ok: nextResponse.ok,
            status: nextResponse.status,
            text: () => Promise.resolve(JSON.stringify(nextResponse.body)),
        });
    };

    const sandbox: Record<string, unknown> = {
        document, localStorage, fetch, console, JSON, setTimeout, Promise,
    };
    sandbox.window = sandbox;

    return {
        run() {
            vm.createContext(sandbox);
            vm.runInContext(fs.readFileSync(scriptPath, "utf8"), sandbox);
        },
        mountBody() {
            elements.deleteAccountBtn = makeElement("deleteAccountBtn");
            elements.confirmInput = makeElement("confirmInput");
            elements.deleteResult = makeElement("deleteResult");
        },
        fireDomReady() {
            domReady.forEach((fn) => fn());
        },
        click() {
            const handler = listeners.deleteAccountBtn?.click;
            if (!handler) throw new Error("no click listener was bound to the delete button");
            handler();
        },
        elements,
        fetchCalls,
        store,
    };
}

/** Lets the stubbed promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    nextResponse = { ok: true, status: 200, body: { result: { alreadyDeleted: false } } };
});

describe("deleteaccount.js", () => {
    it("binds its click handler even though it runs before the body exists", () => {
        const h = makeHarness();
        h.run();
        h.mountBody();
        h.fireDomReady();

        expect(() => h.click()).not.toThrow();
    });

    it("calls the deletion endpoint when the confirmation matches", async () => {
        const h = makeHarness();
        h.store.accessToken = "a";
        h.store.accessTokenIndex = "b";
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        expect(h.fetchCalls).toHaveLength(1);
        expect(h.fetchCalls[0].url).toBe("/api/auth/delete-account");
        expect(h.fetchCalls[0].opts.method).toBe("POST");
    });

    it("sends the access token the way the rest of the app does", async () => {
        const h = makeHarness();
        h.store.accessToken = "token-123";
        h.store.accessTokenIndex = "index-9";
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        const headers = h.fetchCalls[0].opts.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer token-123");
        expect(headers["X-Auth-Index"]).toBe("index-9");
    });

    it("refuses to call the API when the confirmation text is wrong", async () => {
        const h = makeHarness();
        h.store.accessToken = "a";
        h.store.accessTokenIndex = "b";
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "delete";   // case-sensitive on purpose
        h.click();
        await settle();

        expect(h.fetchCalls).toHaveLength(0);
        expect(h.elements.deleteResult.textContent).toContain("Type DELETE");
    });

    /**
     * The account is gone the moment the tombstone is written, so a retained token would only
     * produce confusing 401s on the next request.
     */
    it("clears the stored tokens on success", async () => {
        const h = makeHarness();
        h.store.accessToken = "a";
        h.store.accessTokenIndex = "b";
        h.store.refreshToken = "c";
        h.store.refreshTokenIndex = "d";
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        expect(h.store.accessToken).toBeUndefined();
        expect(h.store.accessTokenIndex).toBeUndefined();
        expect(h.store.refreshToken).toBeUndefined();
        expect(h.store.refreshTokenIndex).toBeUndefined();
    });

    it("does not clear tokens when the request fails", async () => {
        nextResponse = { ok: false, status: 401, body: { message: "Account is not active" } };

        const h = makeHarness();
        // Both credentials, because the script now refuses to call the API with only one of them —
        // this test is about what happens when the *server* rejects a full credential set.
        h.store.accessToken = "a";
        h.store.accessTokenIndex = "b";
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        expect(h.fetchCalls).toHaveLength(1);
        expect(h.store.accessToken).toBe("a");
        expect(h.elements.deleteResult.textContent).toContain("401");
        expect(h.elements.deleteAccountBtn.disabled).toBe(false);
    });

    /**
     * Deletion resolves the account from the token alone, so without one there is nothing to send.
     * Firing the request anyway earns a bare 401 that reads like a server fault; the user needs to
     * be told to sign in, not shown an error body.
     */
    it("does not call the API without a token, and points at the login page", async () => {
        const h = makeHarness();
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        expect(h.fetchCalls).toHaveLength(0);
        expect(h.elements.deleteResult.textContent).toContain("sign in first");
        expect(h.elements.deleteResult.textContent).toContain("/login");
    });

    /**
     * `Authentication.middleware` treats Authorization + X-Auth-Index as one requirement, so a
     * half-populated store is "not signed in" rather than a request worth sending.
     */
    it("does not call the API with only one of the two credentials", async () => {
        const h = makeHarness();
        h.store.accessToken = "a";        // no accessTokenIndex
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        expect(h.fetchCalls).toHaveLength(0);
        expect(h.elements.deleteResult.textContent).toContain("sign in first");
    });

    it("tells the user to sign in again when the server rejects the session", async () => {
        nextResponse = { ok: false, status: 401, body: { message: "Account is not active" } };

        const h = makeHarness();
        h.store.accessToken = "a";
        h.store.accessTokenIndex = "b";
        h.run();
        h.mountBody();
        h.fireDomReady();

        h.elements.confirmInput.value = "DELETE";
        h.click();
        await settle();

        expect(h.elements.deleteResult.textContent).toContain("may have expired");
        expect(h.elements.deleteResult.textContent).toContain("/login");
    });
});
