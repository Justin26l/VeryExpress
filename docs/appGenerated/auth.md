# Auth

Stateless JWT tokens, plus three independent sign-in paths: local (email + password), OAuth2
(passport), and Firebase.

## Tokens

Rolling keys are defined in `.env` as `JWT_KEY{increment}`:

```bash
JWT_KEY1=aaaaa
JWT_KEY2=bbbbb
JWT_KEY3=ccccc
```

A client sends the access token as `Authorization: Bearer <accessToken>` with
`X-Auth-Index: <accessTokenIndex>`, and refreshes at `POST /api/auth/refresh`.

## Sign-in paths

| Path | Endpoint | Enabled by |
|---|---|---|
| Local (email + password) | `POST /api/auth/local`, `POST /api/auth/register` | `auth.localAuth` |
| OAuth2 | `GET /api/auth/<provider>` → `GET /api/auth/<provider>/callback` | `auth.oauthProviders` |
| Firebase | `POST /api/auth/firebase` | `auth.firebase` |

Local and OAuth2 answer `302` with a single-use `sessionCode`, which the client exchanges at
`POST /api/auth/token` for the token pair. Firebase answers `200` with the token pair directly.

OAuth2 credentials come from `.env`:

```bash
OAUTH_GOOGLE_CLIENTID=xxxxx
OAUTH_GOOGLE_CLIENTSECRET=xxxxx
```

`/login` renders a form or a button for whichever paths are enabled.

## The built-in account model

Auth resolves every request against one document named `User`. `app.useUserSchema` decides whether
vex writes it:

- `true` (default) — `jsonSchema/User.json` is copied from the templates and kept in sync with them
  (`email`, `name`, `active`, `deleted`, the audit fields).
- `false` — vex writes nothing. The project supplies its own `User.json`; without one, generation
  stops with `authentication needs a document named "User"`.

RBAC needs the same document (`UserRole` declares a foreign key to it), so it carries the same
requirement and the same error.

A schema in `jsonSchemaDir` is the app's input. Nothing deletes or rewrites it when the flag is off:
a `User.json` that is there is generated like any other document. The flag governs the template, not
the directory.

## Verify-only services

An app that serves business routes but never signs anyone in sets `auth.verifyOnly: true`. It
validates access tokens minted by another vex app and issues none:

```jsonc
"auth": { "localAuth": false, "verifyOnly": true }
```

What it generates, and what it does not:

| | Sign-in app | Verify-only app |
|---|---|---|
| `Authentication.middleware` | verifies the token, then checks the account row | verifies the token only |
| `JWTService` | mints and verifies, owns sessions | `verifyToken` only |
| `AuthController`, `/login`, OAuth routes | yes | no |
| `User`, `UserAuthProfiles`, `Session` schemas | yes | no |
| `AccountStateGuard` | reads the identity row | constant `true` |

`JWT_SECRET0..9` and `JWT_ALGORITHM` must match the app that signs. The client sends the key slot
in `X-Auth-Index`, the same header it sends to the signing app.

The identity travels in the token, so `onCreateUserId` / `onUpdateUserId` and ownership isolation
(`source: "user._id"`) work. The token carries it as `vexUserId`; when it is absent the middleware
falls back to `_id`.

Revocation is bounded by token lifetime: there is no account row here to check, so a deleted
account's unexpired access token stays valid until it expires.

Verify-only cannot be combined with a sign-in method, with `useRBAC` (role assignments live in the
local `UserRole` table) or with `tenant.IsolationMode: "option"` (selecting a tenant mints a token).
Generation stops with a config error naming the conflict.

## The identity row

A sign-in writes one `UserAuthProfiles` row, keyed by `(provider, providerUserId)` — a composite unique
index. `provider` is the namespace, `providerUserId` the subject inside it:

| Sign-in | `provider` | `providerUserId` |
|---|---|---|
| Local | `local` | — |
| passport Google | `google` | Google `sub` (`profile.id`) |
| Firebase + Google | `google` | Google `sub` |
| Firebase email/password, phone | — | `400`, no row |

A user reaching the API through Firebase and through passport Google resolves to the same `User` row.
`provider: "local"` is reserved: `verifyPassword` looks rows up by it.

## Firebase

```jsonc
"auth": { "firebase": true }
```

```bash
FIREBASE_SERVICE_ACCOUNT_JSON=      # the service account JSON
FIREBASE_WEB_API_KEY=               # public browser config, served to /login
FIREBASE_WEB_AUTH_DOMAIN=
FIREBASE_WEB_PROJECT_ID=
# FIREBASE_PROVIDERS=google         # which buttons /login renders; default google
```

The server verifies the ID token with `firebase-admin` against the project named by the service
account. With no usable credential the endpoint answers `503` and the app still starts.

`/login` loads the modular SDK (`firebase-app.js` / `firebase-auth.js`, ES modules from gstatic, pinned
version), preloads it on page load, and calls `signInWithPopup(getAuth(app), provider)` followed by
`user.getIdToken()`. The page sets its own CSP (script/connect/frame hosts) and its own
`Cross-Origin-Opener-Policy: same-origin-allow-popups`.

`firebase.sign_in_provider` selects the provider and `firebase.identities[<provider>][0]` supplies the
subject. A token whose provider has no entry in that map, or whose subject is missing, is answered with
`400`.

Failure modes on the page, expanded from the SDK's codes into a message on screen and in the server
log: `auth/popup-blocked`, `auth/popup-closed-by-user` (the popup closed before the handshake finished),
`auth/unauthorized-domain`, `auth/operation-not-allowed`, `auth/internal-error`.

Design record: [`docs/plan/spec-firebase-auth.md`](../plan/spec-firebase-auth.md).
