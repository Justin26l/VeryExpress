# Spec — Firebase auth as a vex sign-in option

**Status:** approved for implementation.
**Base:** forked from the `0.8.x` line — branch `0.8.1` @ `b939e9f`, `package.json` `0.8.4`.
**Branch:** `feat/firebase-auth`, off that base. **Target version:** `0.8.5`.
**Supersedes:** the `auth.externalIdentity` design on the `v0.9.0` branch. That work is **not** carried
over: no presets, no issuer/JWKS config, no `ExternalIdentityService`, no `identityLayer`.

---

## 1. Why

RenoMaster is the forcing case. Today its app signs in with Google **through Firebase** and posts the
Firebase ID token to a **hand-written** controller, `api/src/controllers/FirebaseAuthController.ts`.
That controller hardcodes `provider: "firebase"` and `providerUserId: decoded.uid`, so a Google user is
filed under a namespace nothing else can reach:

| Door | `provider` | `providerUserId` |
|---|---|---|
| RenoMaster app (hand-written controller) | `firebase` | Firebase uid |
| RenoMaster `/login` page (vex 0.9.0 external identity) | `google` | Google sub |
| passport `GoogleStrategy` | `google` | Google sub |

Three doors, two identities, one human. The 0.9.0 branch tried to fix this by generating a **generic
broker** feature (`auth.externalIdentity`) with a login page that the app never loads — so for the app
it was a dead end, and the app's own endpoint kept writing the wrong key.

This spec takes the other route: **generate the endpoint the app already calls**, and have it write the
real IdP identity.

## 2. Goal

1. vex generates `POST /api/auth/firebase` — the endpoint the RenoMaster app already uses, with the
   **same payload and the same response**, so the app updates with **zero client changes**.
2. That endpoint writes `(provider, oauthId) = ("google", <Google sub>)` — the **upstream** IdP's pair,
   the same one `passport-google-oauth20` writes. `provider: "firebase"` is **never written**.
3. The generated `/login` page offers **both**: Firebase (browser SDK popup) and direct IdP
   (passport redirect). Both converge on the same identity row.
4. RenoMaster deletes its hand-written `FirebaseAuthController.ts`.

**Non-goals**

- Generic broker support (Cognito, Auth0, Keycloak) — that was the 0.9.0 framing and is dropped.
- Browser `signInWithRedirect` / `getRedirectResult()` — the failure mode that motivated this rewrite.
  Popup only.
- Enabling passport Google for RenoMaster — it may stay off; the two doors are independent.

## 3. Decisions (resolved)

**D1 — identity column name. RESOLVED: carry the rename.** `0.8.4` keys `UserAuthProfiles` on
`oauthId` and has **no composite unique index**. This branch carries the `oauthId → providerUserId`
rename and the `(provider, providerUserId)` unique index, matching what RenoMaster already runs.
Without the unique index, "two doors converge on one row" is a hope, not a guarantee: two concurrent
first logins can create duplicate rows for one identity.

**D2 — version number. RESOLVED: `0.8.5`.** The `v0.9.0` tag already exists on the other line; the two
lines must never claim the same version.

**D3 — no `provider: "firebase"` row at all. RESOLVED: never write it.**
`AccountErasureService.findFirebaseUid()` in RenoMaster reads `{userId, provider: "firebase"}` to delete
the Firebase user, so that path has to move to `getUserByProviderUid("google.com", <google sub>)` — the
Admin SDK has it and the service account is already there. RenoMaster-side work; see §13.

**D4 — sign-in methods with no upstream IdP. RESOLVED: refuse with `400`.** Firebase email/password,
phone and anonymous sign-ins have no upstream provider to be filed under, and `firebase` may not be used
as a namespace (D3). RenoMaster does not use them.

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

`auth.firebase` defaults to `false` (opt-in, like the deleted `externalIdentity`): it is the one feature
that lets an outside identity provider mint a vex session, so a project that has not configured one must
not get the endpoint. It must also count towards `isAuthEnabled()` — a project with `localAuth: false`,
no passport provider and `firebase: true` is not auth-less.

```bash
# server — firebase-admin, the project credential. Either source; JSON wins.
FIREBASE_SERVICE_ACCOUNT_JSON=
FIREBASE_SERVICE_ACCOUNT_PATH=          # default: serviceAccountKey.json
# browser — Firebase's PUBLIC web config, served to the login page by design
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
# login page: which buttons to render, comma separated. default: google
FIREBASE_PROVIDERS=google
```

`FIREBASE_PROVIDERS` is read **at render time**, like the rest of the browser config, so changing it
does not need a regeneration. The server accepts any provider in the built-in table regardless of what
the page renders.

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

This is RenoMaster's `FirebaseLoginResult` verbatim (`api/src/types/response/AuthResponse.ts`).
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

Backed by facts verified on the live service (`firebase-admin` `token-verifier.d.ts`, and
`RenoMaster/docs/rules/backend/firebaseImplementation.md` §5):

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

1. **Never silently fall back.** The 0.9.0 verifier returned `null` and fell back to the broker identity
   when the upstream subject was missing, which produces a *wrong-but-plausible* key with no signal.
   Here a known upstream provider with a missing subject is a **loud refusal**, with a server log line.
2. **Type handling.** `firebase-admin` declares `firebase.identities` as `{ [key: string]: any }`.
   Generated code must not lean on `any`: erase it to `unknown` and use `Reflect.get`, per
   `firebaseImplementation.md` §5.

**Email linking** happens only when `decoded.email_verified === true` — otherwise any provider that
claims an address could be walked into someone else's account. (The 0.8.4 **passport** flow links by
email unconditionally; that hole is the same class and is called out as follow-up work in §12, but it
is not this change.)

## 7. Where the two doors meet

| Door | written pair |
|---|---|
| `POST /api/auth/firebase` (this spec) | `("google", <Google sub>)` |
| passport `GoogleStrategy` → `OAuthProfileMap` | `("google", oauthProfile.id)` = `("google", <Google sub>)` |

Both look up an existing row with the same `{ provider, oauthId }` predicate, so a user who signed up in
the app can sign in on the `/login` page against the **same** `User` row, and the reverse. Enabling
either door independently is valid; enabling both is the point.

**Existing RenoMaster rows are not migrated.** A user whose only row is `(firebase, uid)` is linked
lazily: the next Firebase Google login resolves `(google, sub)`, finds no row, then matches an existing
`User` by **verified** email and attaches the row — `isNewUser` stays `false`. This works because the
hand-written controller created those users with the Google address in `User.email`.

## 8. Generated artifacts

| File | Content |
|---|---|
| `src/system/_services/auth/FirebaseAdmin.gen.ts` | service-account loading (JSON env → path env → `serviceAccountKey.json`), `initializeApp`, exported `auth \| null` + `isFirebaseAvailable` |
| `src/system/_services/auth/FirebaseAuthService.gen.ts` | `verifyIdToken` → identity resolution → find / link / create `User` + `UserAuthProfiles` (+ `UserRole` when RBAC) with rollback |
| `src/system/_services/auth/FirebaseIdentityMap.gen.ts` | the `sign_in_provider` → provider table, generated from the built-in list |
| `src/system/_controllers/AuthController.gen.ts` | gains `@Post("firebase")` |
| `src/system/_routes/LoginUI.gen.ts` | Firebase button(s), SDK script tags, config carrier, glue script |
| `public/js/firebaseauth.js` | browser glue: popup → `getIdToken()` → POST → store tokens → redirect (root template, copied once) |
| `_projectSettings/package.json` | `firebase-admin: ^14.1.0` (server) — `firebase: ^12.x` (browser SDK) is already a dependency |
| `_projectSettings/env` | the six variables from §4 |

The `userRepo` / `userAuthProfilesRepo` / `userRoleRepo` getters are currently emitted only when
`localAuth` is on. They must also be emitted when `firebase` is on, as must the
`loginRedirectResponse`-adjacent response types.

## 9. Login page

`/login` renders up to three groups:

1. local email + password (`localAuth`), unchanged;
2. **direct IdP** — one link per `oauthProviders` entry → `/api/auth/<provider>` (passport redirect),
   unchanged;
3. **Firebase** — one button per `FIREBASE_PROVIDERS` entry, `data-provider="google"`.

The Firebase group loads `firebase-app-compat.js` / `firebase-auth-compat.js` **from
`node_modules/firebase`**, served same-origin through `/js/firebase/<file>` with a file allowlist — the
0.9.0 mechanism, which needs no CDN host and no CSP allowance. The page's CSP must keep the extra
`script-src` hosts (`apis.google.com`, `www.gstatic.com`, `www.google.com`): Firebase Auth injects
`apis.google.com/js/api.js` at sign-in time and an injected tag carries no nonce.

Flow: button → `signInWithPopup(provider)` → `user.getIdToken()` → `POST /api/auth/firebase` →
store `accessToken` / `accessTokenIndex` / `refreshToken` / `refreshTokenIndex` in `localStorage` →
navigate to `/mytokens`. Vendor error codes (`auth/unauthorized-domain`, `auth/popup-blocked`,
`auth/internal-error`, …) are expanded into an actionable message, and the server-side config problems
(missing env, mobile `appId` registration) are carried into the page and shown with them.

## 10. Loud failures (generation time)

Consistent with the repo's "never emit a half-working verifier" rule:

| Condition | Behaviour |
|---|---|
| `auth.firebase` is not a boolean | rejected by config validation |
| `auth.externalIdentity` still present | **generation fails** with the rename instruction |
| Firebase enabled but the generated app has no `userRepo` | not possible — the gate emits it |
| Service account missing at runtime | `503`, and the login page warns on render |

## 11. Compatibility

- **RenoMaster app:** no change. Same endpoint, same body, same response.
- **RenoMaster api:** delete `FirebaseAuthController.ts`, regenerate, keep `firebaseAdmin.ts` if other
  features (push, account erasure) use it.
- **`/login` page:** unchanged for local and passport; the Firebase button is new.
- **Old `(firebase, uid)` rows:** kept, not migrated, linked lazily (§7).
- **Package version:** `0.8.5` (D2), so the `0.9.0` line stays separate.

## 12. Tests

- **Unit** — the identity table in §6, one case per row: `google.com` + subject → `(google, sub)`;
  `google.com` with a missing/empty subject → refuse; `password` → refuse; email linking only when
  `email_verified` is `true`. Pure function, no Firebase call.
- **Unit** — `isAuthEnabled()` counts `auth.firebase`; `isFirebaseAuthEnabled()` is false by default.
- **Unit** — login page renders the Firebase button and carries the public config only when enabled.
- **Golden** — a new `sql-auth-firebase` scenario; every existing golden must be unchanged except where
  the shared templates gain the gated blocks.
- **e2e** — `/api/auth/firebase` answers `503` with no service account and `401` for a garbage token.
  A real happy path needs a live Firebase project and stays a manual check (§13).
- **Guard** — no backtick and no `${` inside the emitted `initScript` literal (it is itself interpolated
  into a template literal; this broke a build once).

**Known follow-up, not this change:** the 0.8.4 passport flow links accounts by email without checking
`email_verified` — the same account-takeover class the Firebase path guards against.

## 13. Manual verification checklist (RenoMaster)

1. Regenerate; confirm `/api/auth/firebase` appears in Swagger.
2. Fresh Google account through the app → exactly one `(google, <sub>)` row, **no** `(firebase, …)` row.
3. Same account through `/login` (Firebase button) and through passport (if enabled) → **same** `User`
   row, no duplicates.
4. Existing user with only `(firebase, uid)` → next login attaches `(google, sub)`, `isNewUser: false`.
5. Account deletion still removes the Firebase user after `findFirebaseUid()` is replaced with
   `getUserByProviderUid("google.com", <sub>)` (D3).
6. `SELECT provider, "oauthId" FROM userauthprofiles WHERE "userId" = ?` shows the expected pairs.
