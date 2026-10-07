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
