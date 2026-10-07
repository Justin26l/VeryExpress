# Spec — Firebase auth as a vex sign-in option

**Status:** approved for implementation.
**Base:** forked from the `0.8.x` line — branch `0.8.1` @ `b939e9f`, `package.json` `0.8.4`.
**Branch:** `feat/firebase-auth`, off that base. **Target version:** `0.8.5`.
**Scope:** this repo (the generator) only. An application adopts the change by regenerating and setting
the environment; nothing here edits an application's own source.

---

## 1. Why

The forcing case is a production app that signs in with Google **through Firebase** and posts the
Firebase ID token to a **hand-written** controller instead of a generated one. That controller hardcodes
`provider: "firebase"` and `providerUserId: decoded.uid`, so a Google user is filed under a namespace
nothing else can reach:

| Door | `provider` | `providerUserId` |
|---|---|---|
| The app's hand-written controller | `firebase` | Firebase uid |
| passport `GoogleStrategy` | `google` | Google sub |

Two doors, two identities, one human. The app's own identity row is the odd one out: the genuine Google
subject is sitting in the ID token the whole time, in `firebase.identities["google.com"][0]`, and is
simply thrown away.

vex already generates the passport door and the `/login` page that drives it — but that page is served
by the API origin, and a native app never loads it, so it cannot help the app. This spec closes the gap
from the other side: **generate the endpoint the app already calls**, and have it write the real IdP
identity, so both doors land on one row.

## 2. Goal

1. vex generates `POST /api/auth/firebase` — the endpoint such an app already uses, with the **same
   payload and the same response**, so it needs **zero client changes**.
2. That endpoint writes `(provider, providerUserId) = ("google", <Google sub>)` — the **upstream** IdP's pair,
   the same one `passport-google-oauth20` writes.
3. The generated `/login` page offers **both**: Firebase (browser SDK popup) and direct IdP
   (passport redirect). Both converge on the same identity row.

**Non-goals**

- Generic broker support (Cognito, Auth0, Keycloak) — out of scope.
- Browser `signInWithRedirect` / `getRedirectResult()` — the failure mode that motivated this rewrite.
  Popup only.
- Enabling passport Google in any particular app — it may stay off; the two doors are independent.

## 3. Decisions (resolved)

**D1 — identity column name. RESOLVED: carry the rename.** `0.8.4` keys `UserAuthProfiles` on
`oauthId` and has **no composite unique index**. This branch carries the `oauthId → providerUserId`
rename and the `(provider, providerUserId)` unique index, matching what deployments generated from the
`0.9.0` line already have. Without the unique index, "two doors converge on one row" is a hope, not a
guarantee: two concurrent first logins can create duplicate rows for one identity.

**D2 — version number. RESOLVED: `0.8.5`.** The `v0.9.0` tag already exists on the other line; the two
lines must never claim the same version.

**D3 — no `provider: "firebase"` row at all. RESOLVED: never write it.**
An application that deletes the Firebase user by looking up `{userId, provider: "firebase"}` has to move
that lookup to `getUserByProviderUid("google.com", <google sub>)` — the Admin SDK provides it and the
service account is already there. That is a change in the application, not here.

**D4 — sign-in methods with no upstream IdP. RESOLVED: refuse with `400`.** Firebase email/password,
phone and anonymous sign-ins have no upstream provider to be filed under, and `firebase` may not be used
as a namespace (D3).

## 4. Config and env

`vex.config.json` gets **one boolean**. Everything else is environment, because every other value is a
deployment concern and two of them are secrets:

```json
"auth": {
    "localAuth": true,
    "firebase": true,
    "deleteAccount": true,
    "oauthProviders": { "google": false, "github": false }
}
```

`auth.firebase` defaults to `false` (opt-in): it is the one feature
that lets an outside identity provider mint a vex session, so a project that has not configured one must
not get the endpoint. It must also count towards `isAuthEnabled()` — a project with `localAuth: false`,
no passport provider and `firebase: true` is not auth-less.

```bash
# server — firebase-admin, the project credential
FIREBASE_SERVICE_ACCOUNT_JSON=
# browser — Firebase's PUBLIC web config, served to the login page by design
FIREBASE_WEB_API_KEY=
FIREBASE_WEB_AUTH_DOMAIN=
FIREBASE_WEB_PROJECT_ID=
# login page: which buttons to render, comma separated. default: google
FIREBASE_PROVIDERS=google
```

Four required, one optional — deliberately the names an app's Firebase deployment already uses, so
turning this on needs no environment change. Two variables that earlier drafts carried are **gone**,
because nothing reads them:

- `FIREBASE_APP_ID` — Firebase Auth never reads an appId. A production popup sign-in initializes with
  `initializeApp({ apiKey, authDomain, projectId })` and nothing else.
- `FIREBASE_SERVICE_ACCOUNT_PATH` — a second source for one credential is a second way to be
  misconfigured. Inline JSON only; a file can still be passed as
  `FIREBASE_SERVICE_ACCOUNT_JSON="$(cat key.json)"`.

`FIREBASE_PROVIDERS` is read **at render time**, like the rest of the browser config, so changing it
does not need a regeneration. The server accepts any provider in the built-in table regardless of what
the page renders.

`FIREBASE_SERVICE_ACCOUNT_JSON` takes the downloaded key file **as-is**. Google spells its fields
snake_case (`project_id`, `private_key`, `client_email`) while firebase-admin's `ServiceAccount` type
spells them camelCase, and the SDK accepts either — so the generated loader accepts either too. A
validator that insisted on the camelCase spelling rejected every genuine key file, which surfaced only
as a `503` with no further detail.

## 5. Endpoint contract (frozen — the app depends on it)

```
POST /api/auth/firebase
body:      { "idToken": "<Firebase ID token>" }
200:       { "result": { "accessToken", "accessTokenIndex",
                         "refreshToken", "refreshTokenIndex", "isNewUser" } }
503:       firebase-admin is not configured (no usable service account)
401:       "Invalid or expired Firebase ID token"
400:       "This sign-in method has no upstream identity provider"
409:       "This sign-in method does not provide an email address"
```

This is the shape deployed clients already parse.
`isNewUser` is `true` only when the `User` row was created by this call; an existing user linked by
email is `false`.

Note this endpoint answers **200 with the token pair**, unlike `/api/auth/local` (302 + `sessionCode`).
That is deliberate: it is the contract the app already speaks, and changing it would break the "zero
client changes" goal. The session-code path stays the pattern for the browser-only flows.

## 6. Identity resolution

Input: the `DecodedIdToken` returned by `firebase-admin`'s `verifyIdToken`.

```
signInProvider = decoded.firebase.sign_in_provider          // "google.com"
provider       = MAP[signInProvider]                        // → "google"
if (!provider)                                → 400 refuse  // "password" / "phone" / "anonymous"
subjects       = decoded.firebase.identities[signInProvider]
if (!Array.isArray(subjects) || !subjects[0]) → 400 refuse  // NEVER fall back to the broker
identity       = { provider, providerUserId: subjects[0] }  // the genuine Google sub
```

Backed by facts verified against the live service and the SDK's own typings
(`firebase-admin` `token-verifier.d.ts`):

| claim | meaning |
|---|---|
| `sub` | Firebase **uid** (admin also aliases it as `uid`) — a 28-char random string, **not** the Google sub |
| `firebase.sign_in_provider` | how the user actually signed in: `"google.com"`, `"password"`, `"phone"` |
| `firebase.identities` | upstream ids keyed by provider id: `{"google.com": ["<Google sub>"]}` |
| `email` / `email_verified` | the address, and whether the provider verified it |

`identities[google.com][0]` is the same value as `firebase-admin`'s
`getUser(uid).providerData` entry for `google.com`, and the same as `passport-google-oauth20`'s
`profile.id`. That equality is the whole feature.

**Two hard rules:**

1. **Never silently fall back.** A verifier that returns `null` and falls back to the broker identity
   when the upstream subject is missing produces a *wrong-but-plausible* key with no signal.
   Here a known upstream provider with a missing subject is a **loud refusal**, with a server log line.
2. **Type handling.** `firebase-admin` declares `firebase.identities` as `{ [key: string]: any }`.
   Generated code must not lean on `any`: erase it to `unknown` and read it with `Reflect.get`.

**Email linking** happens only when `decoded.email_verified === true` — otherwise any provider that
claims an address could be walked into someone else's account. (The 0.8.4 **passport** flow links by
email unconditionally; that hole is the same class and is called out as follow-up work in §12, but it
is not this change.)

## 7. Where the two doors meet

| Door | written pair |
|---|---|
| `POST /api/auth/firebase` (this spec) | `("google", <Google sub>)` |
| passport `GoogleStrategy` → `OAuthProfileMap` | `("google", oauthProfile.id)` = `("google", <Google sub>)` |

Both look up an existing row with the same `{ provider, providerUserId }` predicate, so a user who signed up in
the app can sign in on the `/login` page against the **same** `User` row, and the reverse. Enabling
either door independently is valid; enabling both is the point.

**Existing rows are not migrated.** A user whose only row is `(firebase, uid)` is linked
lazily: the next Firebase Google login resolves `(google, sub)`, finds no row, then matches an existing
`User` by **verified** email and attaches the row — `isNewUser` stays `false`. This works because the
hand-written controller created those users with the Google address in `User.email`.

## 8. Generated artifacts

| File | Content |
|---|---|
| `src/system/_services/auth/FirebaseAdmin.gen.ts` | service-account loading (JSON env → path env → `serviceAccountKey.json`), `initializeApp`, exported `auth \| null` + `isFirebaseAvailable` |
| `src/system/_services/auth/FirebaseAuthService.gen.ts` | `verifyIdToken` → identity resolution → find / link / create `User` + `UserAuthProfiles` (+ `UserRole` when RBAC) with rollback. The `sign_in_provider` → provider table is a module constant in here; a separate map module would be a file with one export |
| `src/system/_controllers/AuthController.gen.ts` | gains `@Post("firebase")` |
| `src/system/_routes/LoginUI.gen.ts` | Firebase button(s), the inline config carrier and the **inline** glue, the CSP |
| `src/system/_routes/FirebaseAuthUI.gen.ts` | the wiring as data; `undefined` when the switch is off |
| `_projectSettings/package.json` | `firebase-admin: ^14.1.0` (server). The browser SDK is no longer a dependency — the page loads it from gstatic |
| `_projectSettings/env` | the six variables from §4 |

Written for **every** project, on or off: `LoginUI.gen.ts` (a copied template — it carries the Firebase
rendering code dormant) and `FirebaseAuthUI.gen.ts` (a no-op `undefined`). That is the same shape the
account-state guard uses for `Authentication.middleware`, and it is why an off project's golden still
changes.

**No `public/js/firebaseauth.js`.** An earlier draft shipped the glue as a root template, and a root
template is copied **once** — so a project that already had the compat-era glue kept it while the page
moved to the modular carrier, and the page then asked a global that no longer existed
(`window.undefined is missing`). The glue is now inlined into the page by `LoginUI.gen.ts`, so the two
are one generated artifact and cannot be different generations. The same reasoning applies to any future
change here: if it must reach an existing project, it cannot live under `templates/root/**`.

The `userRepo` getter was emitted only when `localAuth` was on, while `exchangeToken` / `refreshToken`
are emitted for every auth-enabled project and both call it. **That was a pre-existing generator bug**
(a passport-only app did not compile); `userRepo` is now emitted whenever auth is on, and the two
Firebase variants in the e2e compile matrix guard it.

## 9. Login page

`/login` renders up to three groups:

1. local email + password (`localAuth`), unchanged;
2. **direct IdP** — one link per `oauthProviders` entry → `/api/auth/<provider>` (passport redirect),
   unchanged;
3. **Firebase** — one button per `FIREBASE_PROVIDERS` entry, `data-provider="google"`.

The Firebase group uses the **modular** SDK — `firebase-app.js` / `firebase-auth.js` as ES modules from
gstatic at a pinned version — because that is the API the app's own web sign-in uses
(`getAuth` / `signInWithPopup` / `GoogleAuthProvider`) and the page mirrors it line for line.

It cannot be served from `node_modules` instead: `firebase-auth.js` in the package imports
`firebase-app.js` from a **hardcoded gstatic URL**, so same-origin copies of the two would be two
distinct module instances and `getAuth()` would not see the app the page initialized. Earlier drafts
served the *compat* build from `node_modules` to avoid a CDN; that traded the proven API for a build the
app never uses, and is gone.

Consequences, accepted deliberately:

- `www.gstatic.com` needs a `script-src` allowance, and the glue needs `connect-src` for
  `identitytoolkit` / `securetoken` / `googleapis` plus `frame-src` for the project's auth domain. The
  page's CSP is built from the wiring per request, so a missing host is a silent generic auth error.
- `npm install` no longer needs the `firebase` package at all; only `firebase-admin` remains.

**The page overrides `Cross-Origin-Opener-Policy` to `same-origin-allow-popups`.** helmet sets
`same-origin` app-wide by default, which gives a cross-origin popup its own browsing context group and
nulls `window.opener` inside it. The Firebase handler reports the result back over exactly that channel,
and the SDK also polls `popup.closed`, which the policy blocks — so the sign-in dies at the handshake and
the SDK reports **`auth/popup-closed-by-user`** seconds after a popup the user never touched.
`same-origin-allow-popups` keeps the relationship for popups this page opens while still isolating every
other cross-origin window, and it is set per response rather than in the app's `helmetConfig` because
`server.ts` is copy-once: a change there would never reach an existing project. See
[firebase-js-sdk#8541](https://github.com/firebase/firebase-js-sdk/issues/8541).

Flow: page load preloads the modules; button → `signInWithPopup(getAuth(app), provider)` →
`user.getIdToken()` → `POST /api/auth/firebase` → store `accessToken` / `accessTokenIndex` /
`refreshToken` / `refreshTokenIndex` in `localStorage` → navigate to `/mytokens`. Vendor error codes
(`auth/unauthorized-domain`, `auth/popup-blocked`, `auth/internal-error`, …) are expanded into an
actionable message, and the server-side config problems (missing env) are carried into the page and
shown with them.

**Preloading is load-bearing**, not an optimization: importing the modules inside the click handler
makes the popup open after a network wait, which Chrome treats as a non-user-initiated popup and blocks.
The page this generator mirrors hit that in production and documents it in a comment.

## 10. Loud failures (generation time)

Consistent with the repo's "never emit a half-working verifier" rule:

| Condition | Behaviour |
|---|---|
| `auth.firebase` is not a boolean | rejected by config validation |
| Firebase enabled but the generated app has no `userRepo` | not possible — the gate emits it |
| Service account missing at runtime | `503`, and the login page warns on render |

There is deliberately **no** compatibility shim or "did you mean" check for any earlier broker-SSO
config: nothing of that kind ever reached a stable release, so there is no config in the wild to
recognise. `auth.firebase` is simply a new key.

## 11. Compatibility

- **This repo:** additive. The only change to shared output is the gated blocks; every existing golden
  is unchanged apart from the rename in the previous commit.
- **`/login` page:** unchanged for local and passport; the Firebase button is new.
- **Old `(firebase, uid)` rows:** kept, not migrated, linked lazily (§7).
- **Package version:** `0.8.5` (D2), so the `0.9.0` line stays separate.

## 12. Tests

What is in place, and what each layer can and cannot see:

- **Unit, template level** (`test/unit/firebaseAuth.test.ts`) — the emitted `FirebaseAuthService` source
  contains the four provider mappings, refuses a login with no upstream provider, refuses a known
  provider with a missing subject, gates the email fallback on `emailVerified`, and never names
  `firebase` as a provider; the admin module reads `FIREBASE_SERVICE_ACCOUNT_JSON` and nothing else; the
  wiring pins a gstatic version and declares the script/connect/frame hosts the sign-in needs.
- **Unit, rendering** (`test/unit/loginUI.test.ts`) — one button per configured provider with the label
  substituted, the default when `FIREBASE_PROVIDERS` is unset, an unknown provider name reported
  instead of rendered, the SDK/init/glue tags, the public config and the problems carried to the
  browser, the CSP hosts, HTML escaping, the `</script` break, the off case, and the SDK route's
  allowlist rejecting `../..`.
- **Unit, gates** — `auth.firebase` is off by default, counts as auth on its own, and a non-boolean is
  refused instead of silently staying off.
- **Golden** — `sql-auth-firebase` (local + Firebase + RBAC) and `sql-auth-firebase-only`
  (`localAuth: false`). Existing goldens change only where a shared template did.
- **e2e compile** (`test/e2e/compile.test.ts`) — `firebase-auth-on` and `firebase-only` are type-checked
  as whole generated apps. This is the only layer that can see a type error in emitted code: it caught
  `user.userAuthProfiles` being possibly undefined, which no golden can.
- **e2e contract** (`test/e2e/contract.test.ts`) — `POST /api/auth/firebase` answers `503` with no
  service account, and says why. A real happy path needs a live Firebase project and stays a manual
  check (§13).
- **Not covered by any automated layer:** the identity table is asserted against the emitted source, not
  by executing it. Running it needs a `firebase-admin` credential and a real token; the unit tests are
  a structural guard plus the golden, and §13 step 2 is the behavioural check.

**Known follow-up, not this change:** the 0.8.4 passport flow links accounts by email without checking
`email_verified` — the same account-takeover class the Firebase path guards against.

