// {{headerComment}}
import type { FirebaseAuthUI } from "./LoginUI.gen";

/**
 * Test/compile-time stand-in for the generated login-page wiring.
 *
 * **In a generated app this file is overwritten by the generator**, which emits the Firebase wiring or
 * `undefined` when `auth.firebase` is off. It lives in the template directory so that `LoginUI.ts`'s
 * unconditional import resolves in this repo — that import has to be unconditional, because the
 * generated default is how the configuration reaches the login page without editing the app-owned
 * `server.ts`.
 *
 * `let` plus a setter rather than a `const`, so the unit tests can vary what the generator "emitted".
 * The generated version is a plain `const`; nothing in the app calls the setter.
 */
export let firebaseAuthUI: FirebaseAuthUI | undefined = undefined;

export function setFirebaseAuthUI(ui: FirebaseAuthUI | undefined): void {
    firebaseAuthUI = ui;
}
