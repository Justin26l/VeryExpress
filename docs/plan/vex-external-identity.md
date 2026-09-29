# Implementation plan — external identity (`externalIdentity`), provider presets, and the `oauthId` rename

Input: design discussion, 2026-09-24 session. Validates
[`vex-account-deletion.md`](vex-account-deletion.md) without changing it — see D7 and §8.

## Why this exists

Renomaster (and any generated app with a mobile client) cannot avoid one external dependency: a
mobile app needs an identity provider, Firebase is the pragmatic choice, and every other client of
the same backend must accept the resulting identity. The requirement is therefore **not** "support
Firebase" but:

1. vex core stays vendor-neutral and adds **zero** new runtime dependencies and **zero** vendor SDKs;
2. an app can plug any OIDC issuer — Firebase, Keycloak, Auth0, Cognito — by configuration;
3. account deletion keeps working for such a user without any change to the deletion path — the
   deletion page needs only what already exists: a vex access token (§8).

## Decisions taken

| ID | Requirement | Source |
|---|---|---|
| D1 | Rename `UserAuthProfiles.oauthId` → `providerUserId`. **One step**, no dual-read, no compat alias | user directive |
| D2 | `(provider, providerUserId)` is the **account-linking key**; `email` is only a fallback | user directive |
| D3 | Enforce that key with a **composite unique index**, not by NOT NULL | derived (D2) |
| D4 | `auth.externalIdentity`: generic OIDC verifier, config-gated, **default off** | user directive |
| D5 | Per-IdP settings ship as **data presets**, not code branches | user directive |
| D6 | passport (`AuthRouter`) and `externalIdentity` are **two inbound doors, one token issuer** — different integration shapes, not competing implementations | design |
| D7 | **Deletion is unchanged.** No `externalIdentities` hand-back — the page's "identity info" *is* the vex access token, and deletion is already provider-agnostic through `UserContext` | user directive (revised) |
| D8 | No `firebase-admin`, no `jose` — verify with the `jsonwebtoken` the generated app already has | design |
| D9 | `provider` is a **namespace label**, and `"local"` is reserved by vex | code evidence (§6.3) |
| D10 | v1 ships **only** the presets that expose the upstream subject — `firebase`, `cognito` — and the docs recommend those two for `externalIdentity` | user directive |
| D11 | The `UserAuthProfiles` row set **is** the linked-accounts UI: no separate display field, and a user with two upstream IdPs gets two rows | user directive |
| D12 | One login writes **exactly one** row — the identity used for that login. Never enumerate every identity the broker knows about | user directive |
| D13 | The name stays `externalIdentity`, not `oauthBroker` | derived (§3.1) |
| D14 | **If passport can drive the provider, use passport.** `externalIdentity` only covers providers passport cannot drive, or where the client owns the flow | user directive |
| D15 | The client sends the **ID token**, never the access token. Every real token in the system stays **vex-issued**; the IdP only does SSO | user directive |

Revisions applied while writing this plan:

- **D7 withdrawn and replaced.** The first draft had `deleteSelf()` read the account's profile rows
  before wiping them and return `externalIdentities`, so the app could delete the provider account.
  That is unnecessary: the delete page logs in once, receives a vex access token, and sends it as a
  bearer token — "identity info" is that token, which is exactly what `UserContext` is built from.
  Deletion therefore needs **no change at all**: it never inspects which provider the caller used,
  and `removeCredentials()` already removes every profile row for the user. The provider-side cleanup
  is app-owned and needs no server round-trip, because the app obtained the Firebase credential
  itself. See §8.
- **`provider` and `providerUserId` must come from the same layer (user directive).** The draft
  resolved the two independently, which let the Firebase preset emit `("google", <firebase uid>)` — a
  provider that names a namespace the id does not belong to. Replaced `providerNamespace` plus a
  standalone `provider.claim`/`map` with a single `identityLayer` that supplies **both** halves, and
  recorded the broker capability survey that decides which presets can offer `upstream` at all
  (§6.2, §6.2.1). A `displayProvider` column was considered for the UI label and rejected: under the
  broker layer it is per-login while the row is per-user, so it would be last-write-wins.
- **The rename cannot be `oidcId`.** GitHub (passport-github) is plain OAuth2, not OIDC; Keycloak
  brokering SAML yields a NameID; a Firebase uid is the broker's own id, not an OIDC `sub`. The field
  spans OAuth2 / OIDC / SAML / broker-local, and for `provider: "local"` rows it is `null` by
  construction. `providerUserId` names the pair `(provider, providerUserId)` without lying about the
  protocol. See §2.3.
- **`EdDSA` is dropped from the preset algorithm allowlists.** `jsonwebtoken@9` — already a
  generated-app dependency — verifies RS/PS/ES/HS/none, not EdDSA. Advertising EdDSA in a preset
  would produce a verifier that rejects valid tokens. Keycloak presets therefore allow
  `RS256/PS256/ES256` only. See §5.3 and §12.2.
- **`isAuthEnabled()` is currently wrong for this feature.** It is
  `localAuth || OAuthProviders().length > 0` (`src/utils/generator.ts:35-37`). A Firebase-only app
  (`localAuth: false`, no passport providers, `externalIdentity.enabled: true`) would generate with
  auth **off** — no `AuthController`, no `Session`, no `/auth/external`. The gate must include
  external identity. See §3.2.

---

## 1. The rename (D1)

### 1.1 Scope

`oauthId` is referenced in exactly four source locations:

| File | Occurrences |
|---|---|
| `src/templates/jsonSchema/UserAuthProfiles.json` | 1 (property declaration) |
| `src/templates/_services/oauth/OAuthProfileMap.ts` | 2 (github + google mappings) |
| `src/templates/_services/oauth/OAuthStrategyService.ts` | 5 (lookup ×2, dedup key, create ×2) |
| `src/generators/services/accountDeletion.generator.ts` | 1 (comment only) |

`src/templates/jsonSchemaRBAC/` holds only `UserRole.json` — there is **one** schema copy to change.
`output/jsonSchema/UserAuthProfiles.json` is re-copied from the template on every run, so it is not
edited by hand.

### 1.2 Schema change

```json
"providerUserId": {
    "type": "string",
    "index": true,
    "description": "External subject within the provider's namespace, paired with `provider`. Together they are the account-linking key. NULL for provider=\"local\"."
}
```

The `description` is load-bearing: it is the only place the namespace rule (§2.1) is visible to
someone reading a generated project's schema.

### 1.3 Schema migration — `src/migrations/v0.9.0.ts`

Registered in `src/migration.ts`'s `migrations[]` with `order: [0, 9, 0, 999]`, following the
`v0.6.14-alpha` pattern (transform `jsonSchemaDir/*.json` in place, driven by
`output/.vex/meta.json → lastGeneratedVersion`).

Behaviour:

- target `UserAuthProfiles.json` only (match on `x-documentConfig.documentName`);
- rename the property key, preserving key order and injecting the `description` above;
- if `x-documentConfig.uniqueIndex` already lists `oauthId`, rewrite that entry too (§2.2);
- idempotent: already-`providerUserId` files are skipped with `log.info`;
- never touches files whose documentName is not `UserAuthProfiles`.

The migration mechanism does **not** touch the database — same boundary as account deletion. The DB
half is the project's job:

```sql
ALTER TABLE "userauthprofiles" RENAME COLUMN "oauthId" TO "providerUserId";
ALTER TABLE "userauthprofiles" ADD CONSTRAINT "unique_provider_providerUserId"
    UNIQUE ("provider", "providerUserId");
```

(The table name is `userauthprofiles`, not `user_auth_profiles` — the generated entity is
`@Entity("userauthprofiles")`, straight from the document name with no snake_case conversion. Verify
against the project's own `UserAuthProfilesModel.gen.ts`; the account-deletion plan uses
`ALTER TABLE "user" ADD COLUMN "deleted"` as the precedent. `SQL_SYNCHRONIZE=true` covers development.)

### 1.4 One step, no dual-read (D1)

No transitional alias, no `providerUserId ?? oauthId` reads. Rationale:

- a dual-read window keeps two names in the generated code and in every downstream project for a
  whole release, and the second half of the migration is the part that never gets done;
- the only known consumer is renomaster, and it is being changed alongside this.

Consequence to state in the release note: **every project must run the rename migration and the DB
rename before regenerating**, or generation produces a model whose entity field no longer matches
the DB column. Passing `allowOverwrite: false` on the auth-profile model requires clearing the
`.vex/meta.json` entry for it, per the account-deletion precedent.

Touched: the four files in §1.1, `src/migrations/v0.9.0.ts`, `src/migration.ts`, all six
`test/golden/*.txt`, `test/fixtures/scenarios/*/schemas/UserAuthProfiles.json`,
`test/.e2e/schemas/UserAuthProfiles.json`.

---

## 2. Identity-key invariants (D2, D3)

### 2.1 The namespace rule

`(provider, providerUserId)` must always be drawn from **one** namespace, never mixed:

| Broker | Broker namespace | Upstream namespace |
|---|---|---|
| Firebase | `providerUserId = <firebase uid>` | reachable: `firebase.identities["google.com"][0]` **is** Google's `sub`, the same value passport-google stores as `profile.id` |
| Keycloak | `providerUserId = <keycloak sub>` | generally **not** reachable from the ID token |

This asymmetry is why the preset carries an `upstreamSub` capability flag (§4.3): a preset that
cannot reach upstream subjects must say so, so `identityLayer: "upstream"` can be rejected at
generation time instead of silently producing a namespace that never matches anything.

**Coherence is the binding rule, and it is what §6.2 enforces.** `provider` and `providerUserId` are
never resolved independently: the same layer supplies both. Mixing them — `provider` from
`firebase.sign_in_provider` while the subject is the Firebase uid — produces
`("google", <firebase uid>)`, a pair that names a namespace its id does not belong to. See §6.2.

### 2.2 Composite unique index

Today `provider` and `oauthId` each carry `"index": true` — two single-column indexes for a query
that is always a **pair** lookup (`OAuthStrategyService.ts:32-35`, `:88-90`), and nothing enforces
uniqueness at all, so two rows can claim the same external identity.

```json
"x-documentConfig": {
    "documentName": "UserAuthProfiles",
    "uniqueIndex": [["provider", "providerUserId"]]
}
```

The existing generator already supports composite unique indexes
(`src/generators/db/typeormEntity.template.ts:99-103`):

```ts
@Unique('unique_provider_providerUserId', ['provider', 'providerUserId'])
```

Postgres permits unlimited `(local, NULL)` rows under a unique index, so `local` password rows — which
never carry a `providerUserId` — are unaffected.

### 2.3 Why not NOT NULL, and why `providerUserId`

`providerUserId` **cannot** be unconditional `NOT NULL`: `AuthController.register` writes
`{ userId, provider: "local", password }` with no external id
(`src/generators/routes/authController.template.ts:145`). The honest constraint is conditional
(`provider <> 'local' ⇒ providerUserId IS NOT NULL`); Postgres can express it as a `CHECK`, and
nothing in vex's schema DSL needs to grow to support that, because the unique index already carries
the correctness that matters.

Rejected name: `oidcId`. Reasons — GitHub is not an OIDC provider, Keycloak-brokered SAML yields a
NameID, a Firebase uid is the broker's own id, and `local` rows have no external id at all.
Accepted name: `providerUserId`, which reads as the second half of the `provider` pair and is
accurate for every case. Industry equivalents: Auth.js `providerAccountId`, Spring Security
`subject`, Cognito `sub`.

### 2.4 Mongo gap (known, out of scope)

`src/generators/db/mongooseModel.generator.ts` is 44 lines and emits **no** indexes; `uniqueIndex` is
SQL-only. Worse, a Mongo unique index treats a missing field as `null`, so a composite
`(provider, providerUserId)` unique index would reject the second `local` row. Mongo support would
need a sparse index. The target project is `dbType: "sql"`; this is recorded so the preset work does
not assume parity.

---

## 3. Configuration (D4)

### 3.1 Shape

**Naming: the feature is `externalIdentity`, deliberately not `oauthBroker`.** "Broker" names the
infrastructure, and the name has to survive three cases the config already covers: (a) a real broker
(Firebase, Cognito, Keycloak, Auth0); (b) a plain OIDC IdP or Google/Apple directly, where **nothing is
being brokered** — the IdP *is* the source (§4.4); (c) a SAML-brokered upstream behind Keycloak, whose
upstream is not OAuth at all. "oauthBroker" is wrong for (b) and misleading for (c), and it also
overloads a word the feature already uses for a different axis — `identityLayer: "broker"` would then
read as "the broker of the broker". `externalIdentity` names the *outcome* the block configures (an
identity established outside vex), which is accurate in all three cases. If a rename is ever wanted,
`federatedIdentity` is the honest alternative; `oauthBroker` is not.

Simple form — preset plus the variables it declares:

```json
"auth": {
    "localAuth": true,
    "externalIdentity": {
        "enabled": true,
        "preset": "firebase",
        "projectId": "renomaster-prod"
    }
}
```

Advanced form — no preset, everything explicit (for an IdP with no preset yet):

```json
"auth": {
    "externalIdentity": {
        "enabled": true,
        "issuer": "https://idp.example.com/realms/main",
        "jwksUrl": null,
        "audience": "vex-api",
        "audienceClaim": "aud",
        "algorithms": ["RS256", "ES256"],
        "provider": { "constant": "main-idp" },
        "claims": {
            "id": "sub",
            "email": "email",
            "emailVerified": "email_verified",
            "username": ["preferred_username", "name", "email", "sub"]
        },
        "identityLayer": "broker",
        "onMissingEmail": "reject"
    }
}
```

Explicit keys always win over the preset (shallow-deep merge, arrays replaced not concatenated).
v1 supports **exactly one** verifier; multi-verifier is §12.6.

### 3.2 Gate — and the `isAuthEnabled` fix

```ts
// src/utils/generator.ts
export function isExternalIdentityEnabled(co: types.compilerOptions): boolean {
    return isAuthEnabled(co) && (co.auth.externalIdentity?.enabled ?? false);
}
```

`isAuthEnabled` must be extended with the **raw** flag, not the gated helper (calling the helper
would recurse):

```ts
export function isAuthEnabled(co: types.compilerOptions): boolean {
    return co.auth.localAuth
        || OAuthProviders(co).length > 0
        || (co.auth.externalIdentity?.enabled ?? false);
}
```

Without this, the Firebase-only app described in the header generates auth-less:
`src/generators/routes/routes.generator.ts:23` is the single gate that emits `AuthController`, and
`Session` / `JWTService` / `vexUserIdField` all hang off it.

Boolean reads use `??`, never `||` (hard rule — `x || true` swallows an explicit `false`). Add
`externalIdentity: { enabled: false }` to `defaultCompilerOptions.auth` for discoverability; add
`externalIdentity?: externalIdentityOptions` to `types.compilerOptions.auth`.

Touched: `src/types/types.ts`, `src/utils/generator.ts`, `src/utils/identityPresets.ts` (§4),
`vex.config.json` (documented example only — the repo's own config stays off).

---

## 4. Presets (D5)

### 4.1 Where they live

`src/utils/identityPresets.ts` — **data only**. Imported by the generator (to resolve config) and
emitted into the generated verifier's constants. No network access, no SDK, no per-IdP `if`.

Preset shape:

```ts
export interface identityPreset {
    issuerPattern: string;              // "{projectId}", "{host}", "{realm}" substitution
    discovery: boolean;                 // fetch /.well-known/openid-configuration at RUNTIME
    jwksUrl?: string;                   // used when discovery is false
    audienceFrom: "projectId" | "clientId" | "apiIdentifier" | "explicit";
    audienceClaim: "aud" | "client_id";
    algorithms: string[];               // asymmetric only; HS* is rejected at generation
    requires: string[];                 // config variables that must be present
    /** provider value written when the resolved layer is "broker" */
    brokerLabel: string;
    /** provider value written when the resolved layer is "upstream"; null = capability absent */
    upstreamProvider: providerRule | null;
    /** upstream subject source; null = capability is absent, not "not configured" */
    upstreamSub: upstreamSubRule | null;
    /** "auto" = upstream whenever this login has an upstream pair, else broker */
    identityLayerDefault: "auto" | "broker" | "upstream";
    claims: claimMap;
    onMissingEmailDefault: "reject" | "synthesize";
}
```

### 4.2 Firebase (verified against the live endpoints)

```
curl https://securetoken.google.com/demo-vex/.well-known/openid-configuration
```
```json
{
  "issuer": "https://securetoken.google.com/demo-vex",
  "jwks_uri": "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  "response_types_supported": ["id_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

```ts
firebase: {
    issuerPattern: "https://securetoken.google.com/{projectId}",
    discovery: true,
    audienceFrom: "projectId",
    audienceClaim: "aud",
    algorithms: ["RS256"],
    requires: ["projectId"],
    brokerLabel: "firebase",
    upstreamProvider: {
        claim: "firebase.sign_in_provider",
        map: {
            "google.com": "google", "github.com": "github", "apple.com": "apple",
            "facebook.com": "facebook"
        }
    },
    upstreamSub: { from: "firebase.identities", keyedByProvider: true },
    identityLayerDefault: "auto",
    claims: {
        id: "sub",
        email: "email",
        emailVerified: "email_verified",
        username: ["name", "email", "sub"]
    },
    onMissingEmailDefault: "reject"
}
```

Two consequences of `identityLayerDefault: "auto"` that are specific to Firebase and worth being explicit
about, because they are the whole reason `auto` is safe here:

- **The layer is resolved per login, not per config.** Firebase's own `password`, `phone`, `custom`
  and `anonymous` sign-ins have **no** `identities` entry for their `sign_in_provider`, so `auto` falls
  back to the broker layer for them and writes `("firebase", <uid>)`. A Google sign-in writes
  `("google", <Google sub>)`. Both pairs are coherent, which is the invariant (§6.2).
- **The two layers produce different row counts.** Under `broker`, one Firebase user with `google.com`
  and `github.com` linked is **one** row, because `provider` is `firebase` either way. Under `upstream`
  it is **two** rows, `("google", <Google sub>)` and `("github", <GitHub id>)` — which is also what the
  passport flows would write for that person.
- Note what is **absent** from `upstreamProvider.map`: `password`, `phone`, `anonymous`,
  `custom`, `saml.<tenant>`, `oidc.<tenant>`. None of them has an upstream subject, so none of them can
  name an upstream layer. A key missing from `map` forces the broker layer rather than inventing a
  provider name.

Two findings that belong in the preset's comments:

- Firebase's discovery document is a **stub**: it has no `authorization_endpoint`, `token_endpoint`
  or `userinfo_endpoint`. Enough to verify a token, useless for a login flow. The resolver must
  depend on `jwks_uri` and nothing else.
- The path is **not validated**: `securetoken.google.com/<anything>/.well-known/openid-configuration`
  returns 200 and echoes the path. A typo'd `projectId` yields a successful discovery and then an
  `iss` mismatch on every token — a config typo that disguises itself as an auth failure. Mitigate
  with a generation-time `log.warn` when `projectId` looks like a placeholder.

### 4.3 Keycloak (verified against a public realm — **deferred, not shipped in v1**)

Kept here as the worked example of a **broker-layer-only** preset (D10): the endpoints and claim
semantics below are verified, but the preset does not ship in v1 because it cannot expose an upstream
subject, so it can never produce the `("google", <Google sub>)` row a linked-accounts UI wants.

```
curl https://loginproxy.gov.bc.ca/auth/realms/standard/.well-known/openid-configuration
```
```
issuer   = https://loginproxy.gov.bc.ca/auth/realms/standard
jwks_uri = https://loginproxy.gov.bc.ca/auth/realms/standard/protocol/openid-connect/certs
id_token_signing_alg_values_supported = [PS384, RS384, EdDSA, ES384, HS256, HS512, ES256,
                                         RS256, HS384, ES512, PS256, PS512, RS512]
introspection_endpoint = .../protocol/openid-connect/token/introspect
```

```ts
keycloak: {
    issuerPattern: "https://{host}/auth/realms/{realm}",
    discovery: true,
    audienceFrom: "clientId",
    audienceClaim: "aud",
    algorithms: ["RS256", "PS256", "ES256"],   // EdDSA + all HS* excluded, see §5.3
    requires: ["host", "realm", "clientId"],
    brokerLabel: "keycloak",
    upstreamProvider: null,        // see below — reachable, but not as an upstream *subject*
    upstreamSub: null,
    identityLayerDefault: "auto",
    claims: {
        id: "sub",
        email: "email",
        emailVerified: "email_verified",
        username: ["preferred_username", "name", "email", "sub"]
    },
    onMissingEmailDefault: "reject"
}
```

Notes the preset must carry:

- **`identity_provider` is a login-method claim, not an identity.** It says *how* the user signed in
  (`google`), which is exactly what a UI wants to show — but it is **absent** for realm-local
  (built-in password) login, and crucially it is **not** paired with an upstream subject. So it cannot
  name a layer: `provider` must stay `keycloak` in both the direct and the brokered case.
- **Keycloak *can* expose an upstream user id, but not as a subject.** The official session data is
  ([`session-data.adoc`](https://raw.githubusercontent.com/keycloak/keycloak/main/docs/documentation/server_admin/topics/identity-broker/session-data.adoc)):

  > `identity_provider` — The IDP alias of the broker used to perform the login.
  > `identity_provider_identity` — The IDP **username** of the currently authenticated user. Often, but
  > not always, the same as the Keycloak username. For example, Keycloak can link a user `john` to a
  > Facebook user `john123@gmail.com`.

  Propagating it needs a `User Session Note` protocol mapper
  (`oidc-usersessionmodel-note-mapper`, `UserSessionNoteMapper.java`) — configuration, not default. And
  the value is the upstream **username**, which the docs themselves show can be an email address. It is
  therefore *not* an upstream subject: storing it as `providerUserId` would produce a value that will
  never match the `sub` the passport flows write. v1 keeps `upstreamSub: null` for Keycloak and records
  the capability as "reachable but not as a subject" rather than pretending it is absent.
- `audienceClaim: "aud"` is only correct for the **ID token**. A Keycloak access token carries
  `aud: "account"` unless the realm adds an audience mapper; Cognito access tokens have no `aud` at
  all and use `client_id`. `audienceClaim` exists for exactly this.

### 4.4 v1 presets: `firebase` only, for now

**Status: `firebase` is implemented and verified end to end. `cognito` is the next one, and the reason
both are the intended v1 pair is that they are the two brokers that hand over the upstream IdP's subject
by default** (§6.2.1). That is the property that matters: it is the only way a user who signed in with
Google through a broker gets a `("google", <Google sub>)` row, which is both the portable key (§6.2) and
the row the "connected accounts" UI shows.

Firebase was built first deliberately, to validate the whole shape (verification, identity layer, login
page wiring) against one real broker before generalising it.

**Recommendation to state in `docs/appGenerated/auth.md`:** if a project needs `externalIdentity`,
prefer a broker that exposes the upstream subject — **Firebase or Cognito**. Brokers that cannot
(Keycloak, Okta) still work, but they can only produce a single broker-labelled row
(`("keycloak", <sub>)`), so the UI shows `keycloak` instead of `google`, and the row will never match
what the passport flows write. That is a legitimate outcome, not a broken one — it just is not what
most apps want from an SSO button.

### 4.4.1 The preset also owns the login-page wiring

A preset declares two things, not one:

| Half | What it is | Where |
|---|---|---|
| verification | issuer pattern, JWKS discovery, audience, algorithms, claim paths, identity layer | `resolveExternalIdentity()` → `ExternalIdentityConfig.gen.ts` |
| **login page** | button label, SDK script URLs (version-pinned), provider list, public env var names, the browser init snippet | `preset.ui` → `ExternalIdentityUI.gen.ts` |

The second half is why `auth.externalIdentity` needs no hand-editing: without it, a project would have to
supply the broker's SDK and a token getter itself, and `server.ts` — the natural place for that — is
generated once and never overwritten, so it could not reach an existing project. Instead `LoginUI.gen.ts`
imports `ExternalIdentityUI.gen.ts` and falls back to it, and both files are regenerated on every run.

`ui.initScript` is the one place vendor knowledge is unavoidable: vex cannot know how to call a given
broker's JS SDK. Everything around it — the buttons, the nonce'd script tags, the POST to
`/api/auth/external`, the session-code exchange — is generic, and a project can still override the whole
thing from `server.ts` when it needs to (a self-hosted SDK build, a broker with no preset).

Firebase specifics that the preset pins, and why:

- **The compat SDK build, not the modular one.** `firebase-app-compat.js` / `firebase-auth-compat.js`
  are single blocking scripts. The modular build resolves submodules with dynamic `import()`, which
  needs either a bundler or a CSP allowance for the CDN host.
- **Served from the npm package, not a CDN.** `firebase` is a dependency of the generated app and
  `LoginUI` serves the two files from `node_modules/firebase/` through an allowlisted same-origin route.
  npm owns the version, no CDN host needs allowing, and the page works offline. The route reads at
  request time because generation happens before `npm install`; a missing install is reported in the
  login page's configuration problems rather than showing up as a blank page.
- **Verified against `firebase@12.19.0`**: both files are shipped at the package root, and the route
  serves them (200, `application/javascript`), rejects an unlisted name, and rejects traversal.
- **No client secret.** The ID token is verified against Google's published JWKS, so the backend holds
  no broker credential. `FIREBASE_*` are the broker's *public* browser config and are served to the page
  by design.

Every preset and its status. Deferred entries each need their own live-endpoint verification like
§4.2/§4.3 before they are advertised.

**Scope rule (user directive): if passport can drive the provider, use passport.** Anything vex already
generates a `passport-*` strategy for — Google, GitHub — belongs on the `/auth/<provider>` redirect path,
not here. `externalIdentity` exists for the providers passport cannot drive: a broker the client talks to
(Firebase, Cognito, Auth0, Keycloak), or an IdP whose sign-in the client SDK owns (Apple, a plain
enterprise OIDC IdP). See §5.0 — the split is "who talks to the IdP", not "which is better".

| Preset | Status | `upstreamSub` | Layer reachable | Note |
|---|---|---|---|---|
| `firebase` | **v1** | `firebase.identities[<provider>][0]` | `upstream` / `broker` | §4.2 |
| `cognito` | **v1** | `identities[].userId` (JSON **string** in the token) | `upstream` / `broker` | needs its own §4.2-style endpoint pass |
| `auth0` | deferred | conditional — parse `sub` on `\|` only while the connection is unambiguous | `upstream`, with a caveat | §12.10 |
| `keycloak` | deferred | null | `broker` only | validated in §4.3, but it cannot produce a two-IdP row set; a project needing it uses the explicit no-preset config form |
| `okta` | deferred | null | `broker` only | configuration does not yield a subject |
| `google` (plain) | **not a use case** | n/a | — | **use the passport flow instead.** vex already generates `passport-google-oauth20`; a provider passport can drive is never an `externalIdentity` job (§5.0) |
| `apple` | deferred | n/a — the IdP *is* the source, so `sub` is upstream | — | a genuine case, and not a contradiction of the row above: Apple sign-in is driven by a client SDK, so there is no server redirect for passport to own. Same shape as a broker |
| plain enterprise OIDC IdP | deferred | n/a | — | also genuine: no passport strategy exists for it, and the client owns the flow |

### 4.5 Generation-time validation (fail loud, never silently degrade)

| Condition | Action |
|---|---|
| `preset` names an unknown entry | `log.error`, abort generation for auth output |
| a `requires` variable is missing/empty | `log.error` naming the variable |
| `algorithms` contains `HS*` or `none` | `log.error` — symmetric algs enable alg-confusion |
| `identityLayer: "upstream"` but preset's `upstreamSub` is `null` | `log.error` |
| explicit `identityLayer` conflicts with the preset's capability (e.g. `"upstream"` on a preset whose `upstreamSub` is `null`) | `log.error` |
| resolved `provider` constant is `"local"` | `log.error` — reserved (§6.3) |
| neither `preset` nor `issuer` given | `log.error` |
| `discovery: false` and no `jwksUrl` | `log.error` |

Generation stays **offline and deterministic**: discovery is a runtime concern, so golden tests never
depend on the network (§10).

---

## 5. Token verification at runtime (D4, D8)

### 5.0 This is not a second OIDC flow

The first question a reader asks is whether `externalIdentity` reimplements what passport already does.
It does not, because it does not run a **flow** at all. The distinguishing question is *who talks to the
identity provider*:

| | passport path (`AuthRouter.gen.ts`) | `externalIdentity` path |
|---|---|---|
| Who speaks to the IdP | the **vex server** | the **client** (mobile app / SPA) |
| Wire steps | `GET /auth/google` → 302 to Google → callback → code exchange → profile fetch | none |
| What vex receives | an authorization code, then a profile | an **already-signed ID token** in a POST body |
| What vex does | drives the flow, then calls `verify(accessToken, refreshToken, profile, done)` | verifies a JWT, maps claims |
| State | server-side session / `req.user` | none |
| Emitted code | `OAuthRouteFactory`, passport strategies, `OAuthStrategyService` | `ExternalIdentityService`, `JwksProvider` |

passport **acquires** an identity. `externalIdentity` **accepts** one that was already acquired. That is
why it needs no strategy, no redirect route, no callback URL, and no `passport` at all — and why it is
the only workable shape for a native mobile client, where there is no browser redirect for the server to
drive.

**Two inbound doors, one outbound path (D6).** They differ only on the way in. Everything downstream is
shared and must stay shared:

- `UserAuthProfiles` rows — the same `(provider, providerUserId)` key, the same composite unique index,
  whether written by `OAuthStrategyService` or `ExternalIdentityService`;
- `JWTService.assignTokens(user, provider)` → `Session` + code → the existing `POST /auth/token`;
- `Authentication.middleware` and `AccountStateGuard` on every subsequent request.

What `externalIdentity` does **reuse** from the passport code is only the find/create/attach *logic*, and
that is duplicated rather than shared today (§6.5, §12.4).

Two alternatives were considered and rejected:

- **`passport-jwt`** (already a dependency) is a verifier, not a flow, so it would not make this an OIDC
  flow either. It still needs the JWKS resolver, it reads the credential from the `Authorization`
  header — which would collide with `Authentication.middleware` trying to verify the same header as a
  vex JWT — and it produces `req.user`, which vex's identity gate deliberately does not read (identity
  comes from the verified vex token). Wrong tool.
- **A `passport` strategy per broker** (`passport-firebase-jwt` etc.) is the same thin wrapper around
  `verifyIdToken`, i.e. vendor coupling with no capability gain. Rejected in the naming/scope decision
  (D13, §3.1).

**Where vex's own JWT actually comes from.** The passport path has four stages, and only the last two mint
vex tokens:

| # | Stage | Talks to | Output |
|---|---|---|---|
| 1 | `GET /auth/google` | browser → Google | the SSO login itself |
| 2 | callback → **exchange the IdP's authorization code** → fetch profile → `OAuthStrategyService.verify` | vex → Google | the **identity** — `(provider, providerUserId)`, email, username — and a vex user row |
| 3 | `JWTService.assignTokens(req.user, provider)` (`OAuthRouteFactory.ts:75`) | — | a `Session` plus vex's **own** `sessionCode`, redirected as `?code=` |
| 4 | `POST /auth/token` with that code | — | the vex access + refresh JWT pair |

So **stage 2 is not what mints the JWT** — it is what learns *who the user is*. Note the two unrelated
codes: stage 2 exchanges the **IdP's** authorization code, stage 4 exchanges **vex's** `sessionCode`.
Only the second produces tokens.

`externalIdentity` replaces stages 1–2 and joins at stage 3 verbatim: same `assignTokens`, same
`sessionCode`, same `POST /auth/token`, same JWT pair. **That is what "one token issuer" means.**

**Which token the client sends: the ID token, never the access token.**

| | ID token | access token |
|---|---|---|
| Who it is for | the relying party — **vex** | calling the **IdP's own** APIs |
| Audience | the client/project id vex configured | the IdP's resource server — Keycloak `account` by default; Cognito's has **no `aud`** at all, only `client_id` |
| Verifiable offline by vex | ✅ signed JWT + JWKS | ❌ — Firebase's is **opaque, not a JWT** |
| Claims | `sub`, `email`, `email_verified`, broker claims | frequently no email, wrong `aud` |

Sending the access token would force a network round trip to the IdP's `userinfo`/`tokeninfo` endpoint plus
a vendor SDK — exactly what D8 removes. The client therefore calls `getIdToken()` (Firebase), **not**
`getAccessToken()`.

**One standard: every real token in the system is issued by vex.** The ID token is a **credential**, not a
session — presented once at the door, consumed there, never stored, never echoed, and accepted by no other
endpoint:

| Token | Issued by | Where it lives | Accepted by |
|---|---|---|---|
| ID token | the broker | client memory, transient | only `POST /auth/external` |
| `sessionCode` | vex (`assignTokens`) | client, short-lived, **single-use** | only `POST /auth/token`, which consumes it (§12.12) |
| access JWT | vex (`JWTService`) | client | every endpoint, via `Authentication.middleware` |
| refresh JWT | vex (`JWTService`) | client | only `POST /auth/refresh` |

After stage 4 the client holds only vex tokens. Every later request is verified by the same middleware,
refreshed through the same endpoint, and invalidated by the same `AccountStateGuard`. The IdP is out of the
picture entirely — which is the stated goal: **the IdP does SSO and nothing else.**

Two operational consequences of that boundary:

- **Logging out of vex does not end the IdP session.** The client still holds a broker session, and the
  broker will mint a fresh ID token that can be exchanged again. A "log out" that only clears vex tokens is
  therefore incomplete — the client must also sign out of the broker. Account *deletion* is unaffected:
  the profile rows are gone, so re-binding is impossible (§8).
- **vex stores no provider tokens** — not the ID token, not the access token, not a provider refresh token.
  The app owns the broker credential, which is why §8 needs no hand-back.

### 5.1 Emitted service

`src/templates/_services/auth/ExternalIdentityService.ts` → `_services/auth/ExternalIdentityService.gen.ts`,
plus `_services/auth/JwksProvider.gen.ts` for key resolution and caching. Both emitted only when
`isExternalIdentityEnabled`. The resolved preset is baked in as a frozen constant object; the
`requires`-substituted `issuer` and `audience` are literals.

### 5.2 Verification order (each step fails closed)

1. Reject if the token is not a three-part JWS, or has no `kid`.
2. Reject if `header.alg` is not in the configured allowlist (`jsonwebtoken.verify`'s `algorithms`
   option performs this, but fail early with a distinct error for observability).
3. Resolve the key from the cached JWKS by `kid`; on an unknown `kid`, refetch **once**, rate-limited
   (cooldown), then fail. Cache honours the JWKS `Cache-Control: max-age`.
4. `jwt.verify(token, keyResolver, { issuer, audience, algorithms, clockTolerance })` — `issuer` is
   the **config** value, exact string match, no trailing-slash normalisation.
5. Require `sub` to be a non-empty string (it is the storage key).
6. Require numeric `exp` and `iat`; reject `iat` more than the clock tolerance in the future.
7. Extract claims per §6.

**SSRF pin (security-critical):** the `iss` claim is never used to locate `jwks_uri`. `issuer` comes
from config; discovery is fetched from that config-derived URL only. Otherwise a token carrying
`iss: http://169.254.169.254/` turns the verifier into an SSRF gadget.

### 5.3 Dependencies — zero new ones (D8)

Use the `jsonwebtoken` the generated app already depends on (`^9.0.2`, see
`src/templates/_projectSettings/package.json`) plus `node:crypto`:

- `crypto.createPublicKey({ key: jwk, format: "jwk" })` imports RSA and EC JWKs natively (Node ≥ 16);
- `jsonwebtoken.verify` accepts a `(header, callback)` key-resolver function, so `kid` lookup is a
  direct fit.

This is why **EdDSA is excluded from every preset's `algorithms`**: `jsonwebtoken@9` does not verify
Ed25519, so advertising it would yield a verifier that rejects valid Keycloak tokens signed with a
realm configured for EdDSA. RESTRICT over ADVERTISE. The alternative — adding `jose` — is §12.2.

`jsonwebtoken` supports `RS*`, `PS*`, `ES*`. Those are the only values a preset may list; the
validator in §4.5 enforces it.

### 5.4 What this deliberately does not do

- **No revocation check.** Firebase's `checkRevoked` is a vendor call; Keycloak's introspection
  (RFC 7662) needs client credentials and a network hop per request. Adding either re-introduces
  vendor coupling into the generic core. Freshness comes from the short-lived vex JWT plus
  `AccountStateGuard` (`docs/features/accountDeletion.md`, "The token guard").
- **No reconciliation of `auth_time`.** ID-token replay within its validity window is possible and is
  documented as an accepted risk (§12.1).

---

## 6. From claims to a stored identity (D2, D9)

### 6.1 Field mapping

| Target | Source | Configurable? |
|---|---|---|
| `providerUserId` | `sub` (broker namespace) or the upstream subject (§6.2) | path + namespace mode |
| `provider` | constant, or a claim + map (§6.3) | yes |
| `email` | `email` claim | path + missing policy |
| `username` | **ordered fallback array**, first non-empty string | yes |
| `password` | **never written** by this path | n/a |

`username` must be an array, not a path: Firebase ID tokens have **no** username-style claim (only
`name` / `email` / `picture`), while Keycloak has `preferred_username`. A project whose
`UserAuthProfiles.username` is NOT NULL needs the `sub` tail to avoid a failed login. The template
schema declares no `required` array today (`src/templates/jsonSchema/UserAuthProfiles.json`), but
projects are free to add one, so the fallback list is not optional.

### 6.2 Identity layer — one knob, and the pair must be coherent

**The invariant: `provider` and `providerUserId` always come from the *same* layer.** A pair is either
`("firebase", <Firebase uid>)` or `("google", <Google sub>)` — never `("google", <Firebase uid>)`.
`provider` names the namespace the id lives in; if the two disagree the pair is meaningless and the
`(provider, providerUserId)` lookup (§2.2) is matching garbage.

The first draft of this plan violated that invariant: it took `provider` from
`firebase.sign_in_provider` while defaulting the subject to the broker `sub`, i.e. exactly that
incoherent pair. The fix is to stop treating the two as independent knobs. There is **one** setting:

| Resolved layer | `provider` | `providerUserId` | Available when |
|---|---|---|---|
| `broker` | `preset.brokerLabel` — `firebase`, `keycloak`, `auth0` | the broker's own subject (`sub`) | always |
| `upstream` | `preset.upstreamProvider` — `google`, `github` | the upstream subject | `preset.upstreamSub` is non-null |

`"auto"` (the default) resolves **per login**: `upstream` when the token actually carries an upstream
pair, otherwise `broker`. Because both halves move together, `auto` can never produce an incoherent
pair — which is why it is safe as a default. An explicit `"upstream"` means "upstream or fail", and is
rejected at generation time for a preset that declares no capability.

**The row set *is* the UI.** There is no separate display field (see the rejection note below): a
"connected accounts" list shows exactly what `UserAuthProfiles` holds. The layer decision is therefore a
product decision, not an internal one:

| Scenario | `upstream` — the target model | `broker` — the fallback |
|---|---|---|
| Firebase user, Google only | 1 row — `("google", gsub)`; UI: **Google** | 1 row — `("firebase", uid)`; UI: **Firebase** |
| Firebase user, Google + GitHub linked | 2 rows — `("google", gsub)`, `("github", gid)`; UI: **Google, GitHub** | **1 row** — `("firebase", uid)`; UI: **Firebase** |
| Same human also signs in via passport-google | **1 row** — identical key | 2 rows, merged by `email` |

`upstream` is the target, and it is what `auto` selects whenever the token carries an upstream pair.
The broker layer is a genuine fallback rather than a peer: it is all that is available from a broker
that exposes no upstream subject, and it is what Firebase's own `password` / `phone` sign-ins resolve
to. The two-row display a user expects from a linked account is *only* achievable on the upstream
layer — which is the whole argument for the v1 preset list being what it is (§4.4).

**The writer upserts exactly one row per login — the identity used for that login.** Not every identity
the broker knows about. Index `identities[<sign_in_provider key>]`, write that one pair, done.

This also makes the `firebase.identities` ambiguity irrelevant to the implementation: whether the claim
lists every linked provider or only the sign-in one, indexing by `sign_in_provider` yields the same
answer. Nothing in the writer depends on which is true (§12.11).

The visible consequence, accepted: a "connected accounts" list shows the identities the user has
actually **logged in with at least once**, not everything linked at the broker. A user who linked
GitHub but only ever signs in with Google shows one entry until they sign in with GitHub once. That is
honest — vex only has an identity for a provider once that provider has proven it.

**No `displayProvider` column.** Considered and dropped. Keying on the broker while showing the upstream
name would require a label that is per-login while the row is per-user: for a user with two linked
providers the label would flip depending on which button they last pressed — last-write-wins, therefore
wrong. It is also unnecessary. The row set already records what the account is linked to, and the client
already knows which button the user just pressed. **What the UI shows is what is stored.**

### 6.2.1 Broker capability survey — who can reach an upstream subject

This decides which presets may offer `identityLayer: "upstream"` at all.

| Broker | Upstream subject? | Mechanism | Gotchas |
|---|---|---|---|
| **Firebase** | ✅ default | `firebase.identities["google.com"][0]` | object; also carries a non-provider `"email"` key |
| **Cognito** | ✅ present | `identities[].userId` + `providerName` | in the token it is a **JSON-encoded string** — parse, don't index |
| **Auth0** | ⚠️ partly | for social logins `sub` is literally `<provider>\|<upstreamId>`, e.g. `google-oauth2\|103547991597142817347` | after account linking the *primary* identity owns `sub`; the full `identities[]` array needs an Action to reach the ID token |
| **Keycloak** | ⚠️ no | `identity_provider_identity` via a `User Session Note` mapper | it is the upstream **username**, not the subject, and needs realm config |
| **Okta** | ⚠️ no | custom claim off the profile / linked object | expression mapping, not a default claim |
| **Entra ID** | ❌ | it *is* the IdP — there is no upstream | — |
| **Supabase** | ❌ in-token | `GET /auth/v1/user` → `identities[].identity_data.sub` | an extra HTTP call per login |
| Plain OIDC IdP | n/a | it is the source | `sub` *is* the upstream subject |

Summary: **two brokers hand it over by default (Firebase, Cognito), one in a parseable format (Auth0),
two need configuration that still does not yield a subject (Keycloak, Okta), and the rest have no
upstream concept.** That asymmetry is why the layer is a preset *capability*, and why `broker` has to be
a first-class outcome rather than a degraded one.

**Firebase's claim shape is the thing to implement carefully.** The JWT claim is `sub` (the Firebase
uid); `uid` is only a convenience copy that `firebase-admin` adds at decode time
([`token-verifier.ts`](https://raw.githubusercontent.com/firebase/firebase-admin-node/master/src/auth/token-verifier.ts),
`decodedIdToken.uid = decodedIdToken.sub`). Three rules follow:

- **`sign_in_provider` and `identities` must be read as a pair.** Resolve the layer first; only then
  take the provider from `firebase.sign_in_provider` and the subject from
  `identities[<that same key>][0]`. Never a subject from a different `identities` entry.
- **`firebase.identities` contains a non-provider key, `"email"`**, whose value is an array of email
  addresses. A naive "iterate `identities` and write a row per key" implementation creates a bogus
  `("email", "user@example.com")` profile. Keys absent from `upstreamProvider.map` force the broker
  layer; they never become a provider name of their own.
- **A key missing from `map` is a capability signal, not an error.** `password`, `phone`, `custom`,
  `saml.<tenant>`, `oidc.<tenant>` have no upstream subject, so `auto` correctly lands them on the
  broker layer as `("firebase", uid)`.

Firebase's Identity Platform adds `saml.<tenant>` / `oidc.<tenant>` values, and `anonymous` needs an
explicit policy decision: it has a uid but no durable identity and no email, so the verifier should
reject it outright rather than synthesize an empty account.

### 6.3 `provider` resolution

`provider` is **not** independently configurable when a layer can name it — that is how the incoherent
pair of §6.2 happened. It is resolved as part of the layer decision, and only falls back to a standalone
rule for projects that have no upstream concept at all:

- **`broker` layer** — `preset.brokerLabel`, or for a preset-less config `{ "constant": "main-idp" }`.
  One verifier, one issuer, one label.
- **`upstream` layer** — `preset.upstreamProvider`: `{ claim, map }`, where a key missing from `map`
  means "this login has no upstream", which forces the broker layer rather than inventing a name.

Runtime validation of the resolved value: must match `^[a-z0-9-]{1,32}$` and must not be `"local"`.
`"local"` is a **reserved namespace** owned by vex's own password path:

```ts
// src/templates/_utils/hash.ts:36
const hashedPassword = user.userAuthProfiles.find((p:any) => p.provider === "local")?.password;
```

`verifyPassword` finds the password row **by `provider === "local"`**. Any external IdP that writes
`provider: "local"` either feeds a foreign hash into a bcrypt comparison or creates a second `local`
row with different semantics — which the composite unique index (§2.2) would then reject anyway.

Concretely: **Keycloak's built-in password login is `provider: "keycloak"`, not `"local"`** (see §4.3:
`identity_provider` is absent for realm-local login, which is precisely the broker-layer case). A
project must also pick **one** password authority — vex's `localAuth` or the IdP's — and not run both
for one address; a Firebase email/password login therefore writes `("firebase", <uid>)`, and the
project should turn `localAuth` off rather than maintain two password systems for the same address.

### 6.4 `email` and `emailVerified`

Missing-or-empty `email` is normal, not exceptional: Firebase phone/anonymous sign-in has none,
Keycloak requires an `email` scope plus a mapper, Cognito access tokens carry none, Apple's Hide My
Email yields a relay address.

```json
"onMissingEmail": "reject" | "synthesize"
```

- `reject` (default): fail the login with a specific error code. Safe, and correct for a project
  whose `User.email` is NOT NULL.
- `synthesize`: write `<providerUserId>@<provider>.invalid` — unique per subject, and `.invalid` is
  reserved by RFC 6761 (originally RFC 2606) so the placeholder is guaranteed non-routable. Required for phone-only
  accounts in a project with `User.email` NOT NULL, because `User` carries
  `uniqueIndex: [["email"]]` (`src/templates/jsonSchema/User.json`).

**`email` may only be used for account linking when `emailVerified` is true.** The existing
`email`-fallback in `OAuthStrategyService.ts:39-41` does not check it — an account-takeover vector
for any provider that does not verify addresses. The new path gates on the configured
`emailVerified` claim and treats **absent as false**. Retrofitting the same check onto the passport
path is a separate change (§12.5).

### 6.5 Write path

1. Resolve the identity per §6.1–6.4.
2. Look up `(provider, providerUserId)` on `UserAuthProfiles`. Hit → load the user.
3. Miss → if `emailVerified` and `email`, look up `User` by `email`; hit → attach a new profile row.
4. Miss → create `User` (+ `UserAuthProfiles`, and the default role when RBAC is on) exactly as the
   OAuth path does, including `profileErrors` and the soft-delete marker seeding that
   `OAuthProfileMap.applyNewUserMarker` performs.
5. Never write `password`. Never write `provider: "local"`.

Steps 2–4 duplicate `OAuthStrategyService`'s find/create/attach logic. v1 accepts the duplication
(two templates, no shared base); unifying them is §12.4.

---

## 7. The endpoint

`POST /api/auth/external`, emitted into `AuthController.gen.ts` by
`src/generators/routes/authController.template.ts` when `isExternalIdentityEnabled`:

```ts
@Post("external")
@SuccessResponse(200, "OK")
async externalIdentity(
    @Body() body: { idToken: string }
): Promise<VexResponse<tokenResponse>>
```

- Path is provider-neutral **on purpose**: `/auth/firebase` would have to be renamed the day the
  backend swaps to Keycloak, and the client change is avoidable.
- The response mirrors `/auth/local`, not `/auth/token`: it calls
  `JWTService.assignTokens(user, provider)` (`JWTService.ts:73`), which creates a `Session` with a
  single-use `sessionCode` — with `Session.provider` set to the resolved provider label — and returns
  the redirect path. The client then exchanges the code at the existing `POST /auth/token`, which is
  where the access/refresh pair is minted. Reusing that exchange keeps one token-issuing path instead
  of adding a second, divergent one.
- Consequence for the response type: `localLoginResponse` is imported into `AuthController.gen.ts`
  only when `localAuth` is on (`authController.template.ts:59`). A project with
  `localAuth: false, externalIdentity.enabled: true` therefore needs the redirect-shape type hoisted
  out of that conditional — rename it to a neutral `loginRedirectResponse` and import it when
  `localAuth || externalIdentity`.
- Errors: `400` verification failed (generic message, no claim echo), `401` expired token, `403`
  `emailVerified` false when linking is required, `409` `onMissingEmail: "reject"` with no email.
  Nothing distinguishes "unknown kid" from "bad signature" in the response body.
- Not emitted at all when the feature is off — no route, no service, no constants.

### 7.1 The generated login page (implemented)

`externalIdentity` is **client-driven**, so the generated `LoginUI` cannot own the broker flow — but it
can host it. vex supplies a **slot**; the application supplies the vendor parts:

| Supplied by | What |
|---|---|
| the app, in `server.ts` (generated once, never overwritten) | `LoginUIConfig.externalIdentity = { label, scripts, getToken }` — the broker's SDK URL(s) and the name of a global that resolves a fresh ID token |
| vex, in `LoginUI.gen.ts` (regenerated every run) | the button, the nonce'd `<script>` tags, the `window.__vexExternalLogin` carrier, and `/js/externallogin.js` — glue that posts to `/api/auth/external` and follows the session redirect |

vex therefore never names a vendor: Firebase, Cognito and Auth0 are all just `{ scripts, getToken }`. The
glue mirrors the local flow — hand the broker's ID token to the one endpoint that accepts a non-vex
credential, get back `?code=`, land on the existing `/logincallback` exchange.

Two constraints recorded because they are easy to get wrong:

- **CSP.** The login page sets `script-src 'self' 'nonce-…'`. A nonce authorises a *cross-origin* script
  too, so a third-party script URL works — but only when the tag carries the same nonce as the header. A
  mismatch
  yields a page whose scripts were all silently blocked, so `test/unit/loginUI.test.ts` asserts every
  `nonce="…"` in the HTML equals the one the header declares.
- **`server.ts` and `public/**` are app-owned.** `copyDir(templates/root, …, false)` never overwrites them
  (`src/index.ts:83`), unlike `LoginUI.gen.ts` under `templates/_routes` (`true`). So the slot config
  reaches new projects as a comment in the generated `server.ts`, while anything expressed only in
  `public/js/*.js` reaches new projects **only**. Put a fix in `LoginUI.gen.ts` when it must reach an
  existing project.

**Sign-in mode is a preset/config choice, not a code path.** `auth.externalIdentity.signInMethod` is
`popup` (default) or `redirect`. The glue never learns which one is in use: the preset's init script
defines two globals, `signIn(providerId)` — which in redirect mode navigates away and never settles — and
`resume()`, which the glue calls once per page load to complete a redirect sign-in or resolve `null`. A
second entry point exists because a redirect cannot be recognised from an ordinary page load until the
broker answers.

`redirect` exists for popup blockers, **not** as a way around third-party storage policy: it has its own
form of that failure, and Google documents it as
[best practices for `signInWithRedirect` on browsers that block third-party storage
access](https://firebase.google.com/docs/auth/web/redirect-best-practices). Its own recommendation is
popup — the pending state then lives in the app's first-party storage — or, if redirect is required,
serving the broker's sign-in helper (`/__/auth/*`, `/__/firebase/init.json`) from the app's own domain
so the flow becomes first-party. **vex does not generate that proxy**; a project that needs redirect on
such a browser must add it. Because the mode is data, switching it is a `vex.config.json` change.

**The CSP must allow the hosts a broker SDK injects at runtime**, and that cost a debugging round: a
nonce authorises the tags the page renders, but Firebase Auth injects `apis.google.com/js/api.js` at
sign-in time with no nonce, so a bare `script-src 'self' 'nonce-…'` blocked it and the only symptom was a
generic `auth/internal-error`. Presets now declare those hosts (`ui.csp.scriptSrc`) and `LoginUI` appends
them to the login page's policy only — every other page stays host-restricted.

**Fixed in the same pass:** the home page's login link was gated on
`localAuth || oauthProviders.length > 0`, so a broker-only app — exactly what `externalIdentity` is for —
showed no way to sign in at all. That is the same gap `isAuthEnabled` had (§3.2); it is now one
`authEnabled` test covering all three paths.

---

## 8. Deletion (D7) — no change

Deletion already accepts **any** identity, which is the whole point of D7 — and it needs no code
change to do so.

The delete page's flow is:

1. log in once — by any configured path, now including `/auth/external` — and keep the resulting
   **vex access token**;
2. `POST /api/auth/delete-account` with that token as the bearer credential.

"Identity info" in that flow is the access token itself. `Authentication.middleware` verifies it and
establishes `UserContext`, and `deleteSelf()` takes the account id from `UserContext` only
(`AccountDeletionService.gen.ts`, "The identity comes from the verified token only"). It never asks
which provider the caller used, so **a Firebase-authenticated user can delete their account with no
deletion-side change whatsoever.**

Two consequences worth stating explicitly, because they were the reason the first draft added a
hand-back:

- **All identities are covered for free.** `removeCredentials()` runs
  `deleteWhere({ userId })` against `UserAuthProfiles`, so every profile row — google, github,
  keycloak, firebase, `local` — is removed regardless of which one was used to log in. A user with
  four linked providers is deleted by one call.
- **No server round-trip is needed to identify the provider account.** The app obtained the Firebase
  credential itself when it logged in, so it already holds the uid it needs to call Firebase Admin's
  `deleteUser()`. `docs/features/accountDeletion.md:149` already says the right thing — capture the
  uid before calling the service; the app does not need vex to hand it back.

Ordering is unchanged and stays load-bearing: vex's identity domain is erased first (profiles, roles,
sessions, then the tombstone), and the provider account is deleted **after** the service returns. If
Firebase fails after the tombstone lands, re-login cannot re-bind — the profile rows are gone — so the
orphaned provider account is a cleanup item with an app-side retry, not a security hole.

Touched: nothing. `src/generators/services/accountDeletion.generator.ts` is edited only for the
rename's comment (§1.1).

### 8.1 The delete page: state the sign-in prerequisite (implemented)

Deletion is self-service and the server resolves the account from the token alone, so a visitor who is
not signed in has nothing to delete — and `/delete_account` did not say so. It fired the request with an
empty `Bearer ` and rendered whatever came back, i.e. a bare `401` that reads like a server fault.

The fix is deliberately split by which file can reach an existing project (§7.1):

- **`LoginUI.gen.ts`** (regenerated) states the prerequisite in the page and links to `/login`. This is the
  half that reaches an existing project.
- **`/js/deleteaccount.js`** (copied once, never overwritten) refuses to call the API when *either*
  credential is missing — `Authentication.middleware` treats `Authorization` and `X-Auth-Index` as one
  requirement — and on a `401` says the session may have expired and points at `/login`.

It deliberately does **not** clear the stored tokens on a `401`. A failed request does not establish that
the account is gone, and dropping the session on any failure would sign a user out of a working account.
That is the pre-existing behaviour, pinned by `test/unit/deleteAccountPage.test.ts`, and it is preserved —
the two existing tests whose setup predated the credential pre-check were given a full credential set so
they still exercise the path they were written for.

---

## 9. Files touched (summary)

| Area | Files |
|---|---|
| Rename | `src/templates/jsonSchema/UserAuthProfiles.json`, `src/templates/_services/oauth/OAuthProfileMap.ts`, `src/templates/_services/oauth/OAuthStrategyService.ts`, `src/generators/services/accountDeletion.generator.ts` |
| Migration | `src/migrations/v0.9.0.ts` (new), `src/migration.ts` |
| Config | `src/types/types.ts`, `src/utils/generator.ts`, `src/utils/identityPresets.ts` (new) |
| Verifier | `src/templates/_services/auth/ExternalIdentityService.ts` (new), `src/templates/_services/auth/JwksProvider.ts` (new) |
| Endpoint | `src/generators/routes/authController.template.ts`, `src/generators/routes/auth.generator.ts`, `src/templates/_types/auth.ts` (hoist `loginRedirectResponse`) |
| Tests | `test/fixtures/scenarios/sql-auth-external-identity/` (new), `test/unit/identityPresets.test.ts` (new), `test/unit/externalIdentityClaims.test.ts` (new), all six `test/golden/*.txt` |
| Docs | this file; `docs/appGenerated/auth.md` — **must carry the D10 recommendation** that a project wanting `externalIdentity` should prefer a broker that exposes the upstream subject (Firebase, Cognito); `docs/releaseNote/` (new version); `AGENTS.md` pointer if the config surface earns one |

Deletion appears nowhere in this table — D7 and §8 leave it untouched.

---

## 10. Tests

**Golden.** Existing six scenarios all re-baseline because of the rename (D1). Add
`sql-auth-external-identity`:

```json
"auth": {
    "localAuth": true,
    "externalIdentity": { "enabled": true, "preset": "firebase", "projectId": "vex-golden" }
}
```

Assert the new outputs appear (verifier service, JWKS provider, `/auth/external` in
`AuthController.gen.ts`, `providerUserId` in the model and types) and that no `firebase-admin` /
`jose` entry lands in the generated `package.json`.

Also add a negative scenario `sql-noauth` guard: it must stay auth-less — proving the §3.2 fix did not
leak auth into projects that did not ask for it.

**Unit — preset resolution** (`test/unit/identityPresets.test.ts`): every §4.5 validation rule, plus
substitution of `{projectId}` / `{host}` / `{realm}` and explicit-override-wins-the-preset merge.

**Unit — claim extraction** (`test/unit/externalIdentityClaims.test.ts`): pure function from a decoded
payload to the storage tuple, driven by fixture payloads —

| Fixture | Expected |
|---|---|
| Firebase Google, `identityLayer: "broker"` | `("firebase", <firebase uid>)` |
| Firebase Google, `identityLayer: "upstream"` | `("google", <Google sub>)` — the same key passport-google writes |
| Firebase Google, `identityLayer: "auto"` | `("google", <Google sub>)` — upstream pair present |
| Firebase `password` / `phone`, `identityLayer: "auto"` | `("firebase", <firebase uid>)` — no upstream pair, broker fallback |
| **any layer, any provider — coherence check** | `provider` and `providerUserId` always come from the same layer; no fixture may produce `("google", <firebase uid>)` |
| Firebase user with `google.com` + `github.com` linked, `broker` | **one** row — `("firebase", <uid>)`, unchanged by which provider was used |
| Firebase user with `google.com` + `github.com` linked, `upstream` | **two** rows — `("google", gsub)`, `("github", gid)`; the composite unique index accepts both |
| Firebase user with `google.com` + `github.com` linked, `upstream`, Google login | exactly **one** row written — `("google", gsub)`; GitHub's row appears only after a GitHub login, even if `identities` lists both |
| Firebase user with `google.com` + `github.com` linked, `upstream`, then a GitHub login | second row added — `("github", gid)`; the first row is untouched |
| Firebase payload whose `identities` carries the non-provider `"email"` key | no `("email", …)` row is ever written |
| Firebase `anonymous` | rejected — no durable identity |
| Firebase phone, no email, `reject` | login refused with the missing-email code |
| Firebase phone, no email, `synthesize` | `email = <uid>@firebase.invalid` |
| Firebase `email_verified: false` + existing email | **no** link, no takeover |
| Keycloak direct (no `identity_provider`) | `("keycloak", <kc sub>)` |
| Keycloak brokered Google | `("keycloak", <kc sub>)` — `identity_provider` names the login method, not a namespace, so the layer stays `broker` |
| Keycloak, no `preferred_username`, no `name` | `username` falls back to `email`, then `sub` |
| `provider` resolving to `"local"` | rejected |

**Unit — JWS validation**: `alg: HS256` with an RSA public key as HMAC secret (alg-confusion) must be
rejected; unknown `kid` triggers exactly one refetch; `iss` mismatch rejected; a `jwks_uri` in a
token's `iss` is never fetched (SSRF).

**e2e (optional).** `test:e2e` can host a local JWKS + self-signed token fixture, which also proves
the `jwksUrl` override path. Worth it because it is the only layer that proves the generated verifier
compiles and runs — the same argument the account-deletion work made for e2e.

---

## 11. Rollout notes for renomaster (not vex code, but blocked by it)

1. Run the new version's generation once so the `v0.9.0` schema migration renames the property.
2. `ALTER TABLE "userauthprofiles" RENAME COLUMN "oauthId" TO "providerUserId";` plus the new
   composite unique constraint on `("provider", "providerUserId")`.
3. Update any app code that reads `oauthId`.
4. Configure `auth.externalIdentity` with the `firebase` preset and the real `projectId`.
5. Decide `identityLayer` — leave it `auto` unless the app must never fall back to the broker label
   (`"upstream"`), or must never leave it (`"broker"`).
6. Decide `onMissingEmail` — `synthesize` if phone-only sign-in is allowed.
7. Deletion: **nothing to wire on the vex side** (§8). The app already holds the Firebase uid it
   logged in with, so it calls Firebase Admin `deleteUser(uid)` after
   `POST /api/auth/delete-account` returns, with a retry independent of the tombstone.
8. Firebase console work (providers, OAuth redirect allowlists, app bundle ids) is client-side and
   outside vex.

---

## 12. Open questions

1. **ID-token replay.** A verified ID token is a bearer credential valid for its lifetime; the
   endpoint does not bind it to a nonce. vex's JWT lifetime is short and `AccountStateGuard` covers
   deleted accounts, but a stolen ID token can be exchanged. Options: accept (document it), or add an
   optional `auth_time` freshness window. Recommend accept + document for v1.
2. **EdDSA.** Excluded from presets because `jsonwebtoken@9` cannot verify it. Adding `jose@4` (CJS)
   would lift the restriction at the cost of a new dependency in every generated app. Recommend
   deferring until a real project asks.
3. **`synthesize` domain.** `<providerUserId>@<provider>.invalid` is the proposal. Confirm the
   provider segment is stable across a provider rename.
4. **Duplication.** `ExternalIdentityService` and `OAuthStrategyService` both implement
   find/create/attach. Unify into a shared `IdentityLinkService`, or accept two templates?
5. **`emailVerified` on the passport path.** The same takeover vector exists in
   `OAuthStrategyService.ts:39-41` today. Separate card — it changes existing behaviour.
6. **Multiple verifiers.** v1 has one. A second IdP needs a per-verifier issuer→key mapping and a
   route that says which one to use. Defer.
7. **~~Independent finding: register's `local` row is gated on RBAC.~~ Withdrawn — the claim was
   wrong.** An earlier draft of this plan asserted that `AuthController.register` writes the `local`
   password row behind `${useRBAC ? ...}`, so an RBAC-off project would register successfully and then
   fail every `/auth/local` login. Re-checked against the file: the `local` row is written
   **unconditionally** (`authController.template.ts:145`); only the *role* assignment is gated
   (`:152-153`). Recorded because a stale `sql-norbac` golden appeared to confirm the wrong claim —
   that golden was generated before the un-gating fix and disagreed with its own template at HEAD, and
   re-baselining it is what exposed the discrepancy (§13).
8. **Independent finding: `auth.useHttpOnlyCookieToken` is inert.** It is declared
   (`src/types/types.ts:49`) and defaulted (`src/utils/generator.ts:115`) but referenced **nowhere**
   in `src/generators/` or `src/templates/` — no generated code reads it, so setting it changes
   nothing. Recorded because §7 deliberately does *not* claim cookie parity: there is no cookie
   behaviour to be parity with. Either implement it or delete it; not this plan's job.
9. **Keycloak's `identity_provider_identity`.** Reachable via a `User Session Note` mapper, but it is
   the upstream *username* (possibly an email), not a subject. Using it as `providerUserId` would give
   a label-friendly `("google", <username>)` pair that can never match what the passport flows write —
   coherent, but not portable. v1 declines it; revisit only if a project needs the UI label badly
   enough to accept a non-subject key.
10. **Auth0 account linking.** `sub` is `<provider>|<upstreamId>` only while the connection is
    unambiguous; after linking, the primary identity owns `sub`. A preset needs a rule for when to trust
    the parse and when to fall back to `broker`. Needs a real tenant before it is specifiable.
11. **Does `firebase.identities` list every linked provider, or only the sign-in one?** ~~Blocks the
    writer.~~ **Closed — no longer matters.** The writer upserts exactly one row per login, indexed by
    `sign_in_provider` (§6.2), which produces the same pair either way. Recorded because the two sources
    disagree (`firebase-admin`'s doc comment says "corresponding to the provider used to sign in the
    user"; common observation says all linked providers are present) and a future reader may wonder why
    the code does not enumerate the claim.
12. **~~Independent finding: `sessionCode` is not consumed on a successful exchange.~~ FIXED in this
   step.** `POST /auth/token` used to delete the session only on the expired branch, so within its TTL
   the same code could mint a token pair repeatedly. It now consumes the code immediately after the
   existence check and *before* the expiry check and the user lookup, so neither a later failure nor a
   replay leaves it exchangeable (`authController.template.ts`, `exchangeToken`). Covered by the e2e
   assertion "refuses a session code that was already exchanged".
   **Residual race, documented in the emitted comment:** `deleteWhere` returns `Promise<void>` in both
   adapters, so it reports no affected-row count and a true atomic consume ("delete, then check that
   *this* request removed the row") is not expressible. Two concurrent requests bearing the same code
   can both pass the check; the window is milliseconds and still requires the code to be known, so it
   is strictly smaller than the pre-fix TTL window. Closing it properly means adding an
   affected-row-reporting delete to `VexRepository` — its own change, touching both adapters.

---

## 13. Suggested commit sequence

1. Rename + composite unique index + `v0.9.0` schema migration + re-baselined goldens, **plus the
   `sessionCode` single-use fix (§12.12)** — folded in because it lives in the same auth template and
   re-baselines the same five goldens.

   Status: implemented. `oauthId` → `providerUserId` (schema, `OAuthProfileMap`, `OAuthStrategyService`,
   the deletion generator's comment); `uniqueIndex: [["provider","providerUserId"]]` → `@Unique` in the
   five SQL goldens and correctly absent from `mongo-auth-rbac` (§2.4); `src/migrations/v0.9.0.ts`
   registered in `src/migration.ts`; `package.json` bumped to `0.9.0` so the runner's
   `lastGeneratedVersion` comparison retires the migration instead of re-running it forever.
   Verified by generation probes: unpinned project, **pinned** project (`.vex/meta.json →
   allowOverwrite:false`, the case the migration exists for), already-migrated file, both-fields-present,
   unrelated document untouched, and a second run reporting "no pending migrations".

   Two pre-existing conditions surfaced while re-baselining, both worth knowing:
   - **`sql-norbac`'s golden was stale at HEAD** — it disagreed with its own template. The refresh
     therefore also records the un-gating of `register`'s `local` row, which is *not* part of this work.
     Reviewing the diff confirmed that is the only such drift, and it is why §12.7 is withdrawn.
   - Renaming a field changes `lastGeneratedVersion` / `lastWriteVersion` in every golden; the generator
     version in header comments is normalised to `<version>` and so stays out of the diff.
2. **Firebase preset + gates. Status: implemented (firebase only; `cognito` deferred).**
   `src/utils/identityPresets.ts` (verification settings *and* login-page wiring, §4.4.1),
   `isExternalIdentityEnabled()`, the `isAuthEnabled()` fix, `cli.ts` defaults, `types.ts` config shape,
   and the `FIREBASE_*` keys in the env template.
3. **Verifier, endpoint and generated login UI. Status: implemented.**
   - `ExternalIdentityConfig.gen.ts` / `JwksProvider.gen.ts` / `ExternalIdentityService.gen.ts`, emitted
     only when the feature is on; `ExternalIdentityUI.gen.ts` always emitted (no-op when off), because
     `LoginUI.gen.ts` imports it unconditionally.
   - `POST /auth/external` in `AuthController.gen.ts`; `localLoginResponse` hoisted to
     `loginRedirectResponse` so it can be shared with `/auth/local` when only one of the two is enabled.
   - The generated login page renders one button per preset provider and loads the preset's SDK, config
     carrier and init script — see §7.1 and §4.4.1.
   - New golden scenario `sql-auth-external-identity`; the other six prove the feature is genuinely gated
     (they carry only the no-op UI module).

   **Verified:** the repo's own `output/` typechecks with `tsc --noEmit` (exit 0); `npm test` 90 passing;
   `npm run test:e2e` 21 passing, which regenerates and compiles a real app.
4. **Docs. Status: done.** `docs/features/externalIdentity.md` (the detail), a TL;DR
   `docs/releaseNote/v0-9-0.md` pointing at it, the capability listed in `docs/appGenerated/auth.md`
   with the D10 broker recommendation, and the release-note rule recorded in `AGENTS.md`.

5. **Not yet done.** `cognito` preset (its absence fails generation loudly rather than half-working);
   the claim-extraction and JWS unit tests of §10 — the extraction is exercised only through the golden
   output and a generated app's compile, and **no test yet asserts that an `HS256` token is rejected**,
   which is the single most important security assertion in this feature; a negative test that an
   invalid `auth.externalIdentity` fails generation; and the `net::ERR_BLOCKED_BY_CLIENT` / private-window
   diagnostics are documented but not automated.

Deletion has no commit here by design (D7, §8). It is a regression check, not a change: the
`sql-auth-delete-account-off` golden and the e2e delete flow must still pass untouched.
