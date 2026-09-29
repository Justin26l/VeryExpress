# External identity (broker SSO)

Sign in through an external identity broker — Firebase today — while **every token in the system stays
vex-issued**. Off by default.

```
Browser ──(SDK sign-in)──> Broker ──(ID token)──> POST /api/auth/external ──> vex JWT
                                                          │
                                             verify JWKS, map claims,
                                             find-or-create the vex identity
```

The broker's token is a **credential, not a session**: presented once, consumed at that endpoint, never
stored, never echoed, and accepted nowhere else. Everything downstream is the existing vex flow — the
endpoint answers with a session-code redirect, and `POST /api/auth/token` mints the access/refresh pair.

The server holds **no broker SDK and no client secret**: the ID token is a standard OIDC JWT, verified
with the `jsonwebtoken` the app already has, against keys fetched from the issuer's JWKS and imported
with `node:crypto`.

## Configuration

```json
"auth": {
    "externalIdentity": {
        "enabled": true,
        "preset": "firebase",
        "projectId": "your-firebase-project"
    }
}
```

A preset names a broker. Explicit keys override it, so you can start from a preset and adjust one field.
Without a preset, `issuer` and the rest must be given explicitly.

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `false` | The feature gate. Auth must also be on. |
| `preset` | — | `firebase`. Unknown names fail generation loudly. |
| `projectId` | — | Preset variable: supplies the issuer and the audience. |
| `identityLayer` | `auto` | `auto` / `broker` / `upstream` — see below. |
| `signInMethod` | `popup` | `popup` / `redirect` — see below. |
| `onMissingEmail` | `reject` | `reject` refuses a login with no email; `synthesize` writes `<subject>@<provider>.invalid`. |
| `issuer`, `jwksUrl`, `discovery`, `audience`, `audienceClaim`, `algorithms`, `providerLabel`, `claims` | from the preset | For a broker with no preset. |

Generation fails loudly rather than emitting a half-working verifier: unknown preset, a missing preset
variable, a symmetric algorithm (`HS*`, an alg-confusion risk), `providerLabel: "local"` (reserved by
vex's own password path), or `identityLayer: "upstream"` on a preset that cannot reach an upstream
subject.

### Env

```
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
```

These are the broker's **public** browser values, served to the login page by design. `storageBucket`,
`messagingSenderId` and `measurementId` are for other Firebase products and are not used.

**`.env` is read once, at startup.** The dev watcher reloads on changes to it, but a process started by
hand needs restarting — and `dotenv` never overrides a variable that is already set in the environment,
so a value exported by your shell, IDE launch config or container silently wins. The server log names
what it could not resolve and says when a value is being shadowed.

Copy **all four** values from one app registration. Mixing an old `apiKey` with a new `appId` is a
silent failure: the request is authenticated with the key.

## The identity that gets stored

`provider` and `providerUserId` always come from the **same layer**, so the stored pair can never name a
namespace its id does not belong to:

| Layer | `provider` | `providerUserId` |
|---|---|---|
| `broker` | the broker (`firebase`) | the broker's own subject |
| `upstream` | the upstream IdP (`google`) | the upstream subject |

`auto` picks `upstream` when the login carries one and falls back to `broker` when it does not — a
Firebase password or phone sign-in has no upstream provider.

**Each login writes exactly one row**: the identity used. A user who signs in with Google through
Firebase gets `("google", <Google sub>)` — the same key the passport flow writes, so both paths converge
on one row. A second linked provider appears after the first login with it.

The row set **is** the connected-accounts UI: there is no separate display field.

Reading the token is deliberately conservative. Only `email_verified` addresses may be used for
account linking — without that gate, any provider that does not verify addresses becomes an
account-takeover path. And the issuer is pinned in configuration, never taken from the token: a verifier
that fetched the JWKS URL named by an unvalidated `iss` claim would be an SSRF gadget.

## The login page

The generated page renders one button per configured provider. The **preset** supplies the vendor
parts — SDK location, provider list, public env names, a browser init snippet — so nothing here names a
vendor and nothing needs editing in `server.ts`:

| Supplied by | What |
|---|---|
| the preset, emitted into `ExternalIdentityUI.gen.ts` | the SDK, the provider list, the init snippet |
| vex, in `LoginUI.gen.ts` | the buttons, the nonce'd script tags, the config carrier, and the glue that posts the ID token to `/api/auth/external` |

**The SDK comes from npm, not a CDN.** `firebase` is a dependency, and the page loads it through a
same-origin route (`/js/firebase/…`) whose file names are an allowlist. The version is npm's business,
no CDN host needs a CSP allowance, and the page works offline. The route reads `node_modules` at request
time because generation happens before `npm install` — run `npm install` after upgrading, or the login
page reports the SDK as not installed.

### popup or redirect

`popup` is the default and is what Google recommends on browsers that block third-party storage access —
the pending sign-in state stays in the page's own first-party storage.

`redirect` navigates the whole page. Reach for it when a popup is blocked, not to dodge the storage
policy: redirect has its own form of that failure, which is why Google documents
[best practices for `signInWithRedirect` on browsers that block third-party storage
access](https://firebase.google.com/docs/auth/web/redirect-best-practices). Its remedy is to serve the
broker's sign-in helper from your own domain; vex does not generate that proxy.

## When sign-in fails

The page expands the broker error codes that carry a meaning — `auth/unauthorized-domain` (add this
origin under Authentication → Settings → Authorized domains), `auth/operation-not-allowed` (enable the
provider under Authentication → Sign-in method), `auth/popup-blocked`, and so on — in the alert and in
the server log.

`auth/internal-error` names no cause by design. Its message points at the usual ones: a restricted API
key (Google Cloud console → APIs & Services → Credentials: the key must allow this origin under HTTP
referrers), an extension blocking `firebaseapp.com` / `apis.google.com`, or blocked third-party cookies.
For those, a request failing with `net::ERR_BLOCKED_BY_CLIENT` was never sent at all — an extension
blocked it.

A `GET /__/firebase/init.json 404` in the broker's own console output is expected: `/__/firebase/…` is a
Hosting reserved URL, and an API-only project has no Hosting site. The handler falls back to the
configuration in its own redirect URL.

### Works in a private window, fails in the normal profile

That combination means the configuration is right and the profile is interfering — check it before
touching any Firebase setting:

1. **An extension.** Private windows disable them. Look for `net::ERR_BLOCKED_BY_CLIENT`; then disable
   all extensions and add them back one at a time.
2. **Stale auth state for the origin.** The SDK caches sign-in and pending-redirect state in the origin's
   `IndexedDB` (`firebaseLocalStorageDb`), keyed by API key. After changing the key, or after a string of
   failed attempts, it can be inconsistent. Clear site data for the app origin and for
   `<project>.firebaseapp.com`.
3. **A profile-level cookie setting**, or an enterprise policy with a URL blocklist.

## Firebase: which values are used, and where

| Console section | Used? |
|---|---|
| SDK setup → npm | no bundler here, but the SDK *package* is used — see the login page section |
| SDK setup → CDN | no |
| SDK setup → 配置 (the `firebaseConfig` object) | **yes** — `apiKey`, `authDomain`, `projectId`, `appId` |

Also enable the providers you want (Authentication → Sign-in method) and keep your app's origin in the
authorized domains list. The app's config must come from a **Web** app registration; a mobile `appId`
(`…:android:…` / `…:ios:…`) is detected and reported rather than left to a network trace.
