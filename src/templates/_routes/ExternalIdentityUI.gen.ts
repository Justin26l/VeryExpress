// {{headerComment}}
import type { ExternalIdentityUI } from "./LoginUI.gen";

/**
 * Test/compile-time stand-in for the generated login-page wiring.
 *
 * **In a generated app this file is overwritten by the generator**, which emits either the resolved
 * `auth.externalIdentity` settings or `undefined` when the feature is off. It lives in the template
 * directory so that `LoginUI.ts`'s unconditional import resolves in this repo — the import has to be
 * unconditional because the default is how the configuration reaches the login page without editing
 * the app-owned `server.ts`.
 *
 * `let` plus a setter rather than a `const`, so the unit tests can vary what the generator "emitted".
 * The generated version is a plain `const`; nothing in the app calls the setter.
 */
export let externalIdentityUI: ExternalIdentityUI | undefined = undefined;

export function setExternalIdentityUI(ui: ExternalIdentityUI | undefined): void {
    externalIdentityUI = ui;
}
