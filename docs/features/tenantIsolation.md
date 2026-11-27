# Tenant Isolation

Tenant isolation scopes documents to a tenant. It is a standalone module: it does not import the auth
module, and it is emitted only when `vex.config.tenant.enable` is true. The tenant id is always a
UUID; the header (`x-tenant-id`) and the token claim (`tenantId`) are fixed.

```jsonc
"tenant": {
    "enable": true,
    "IsolationMode": "preSelect",   // "preSelect" | "option" | "single"; defaults to "preSelect"
    "scope": ["/api"]               // optional; omitted = every route
}
```

`IsolationMode` decides how a request gets its tenant:

| Mode | Who chooses the tenant | When |
| --- | --- | --- |
| `preSelect` | the app build / client (header) | one frontend per tenant, e.g. a branded app |
| `option` | the logged-in user | one app, user logs in then picks an organization |
| `single` | login, from the account's one mapping | one app, one account belongs to one tenant |

Documents opt in with an isolation rule:

```jsonc
"isolation": [
    { "field": "tenantId", "source": "user.tenantId", "onMissing": "deny" }
]
```

The rule field is the document column; it does not have to be named `tenantId`. See
[`dataIsolation.md`](dataIsolation.md).

`scope` limits which request paths the middleware touches, for browsers and static assets that
cannot send the header. It is a boundary-aware prefix match (`/api` matches `/api/...`, not
`/apix`); an entry must start with `/`; `/hello` is always exempt. In `preSelect`, include the auth
routes the client uses (normally `/api` or `/api/auth`).

The middleware validates the UUID only. It does not check whether the tenant exists or is enabled:
that lookup belongs to the application, and a missing / deleted tenant is its normal `404`.

## Generated files

Emitted only when the feature is enabled; turning it off removes them on the next run
(`cleanupStaleFiles`).

| File | When | Role |
| --- | --- | --- |
| `_middlewares/TenantScopeContext.gen.ts` | enabled | pure decision + UUID check |
| `_middlewares/TenantScope.gen.ts` | enabled | the middleware |
| `jsonSchema/UserTenant.json` | enabled with an auth method, if absent | the user ↔ tenant mapping table |
| `_services/TenantService.gen.ts` | enabled with an auth method | link / unlink / list; `singleUserTenant` in `single` |
| `_controllers/TenantController.gen.ts` | `option` (implies auth) | `GET /tenant`, `POST /tenant/select` |
| `_types/Tenant.gen.ts` | `option` | response types |

`Authentication.middleware` and `JWTService` contain no tenant code. The generated auth controller
uses `TenantService` in `preSelect` mode and `JWTService.generateAccessToken(user, index, { tenantId })`
in `option` and `single` mode.

## Header-only deployment

Membership is the only part of the module that needs an account. `preSelect` with no auth method
(`auth.localAuth`, every OAuth provider and `auth.firebase` off) reads the tenant from the header
alone: it links nobody, resolves no claim, and emits no `UserTenant` document, no `TenantService`
and no account table.

The account schemas follow `app.useUserSchema`: with `false` the generator copies neither `User.json`
nor the auth-only `Session.json` / `UserAuthProfiles.json`, and no template that imports them is
emitted. With `true` the project has the built-in `User` document, as the flag says.

`auth.verifyOnly: true` is the middle ground: tokens are verified (so a caller's identity exists),
but no account is signed in, so membership artifacts stay out. See
[`docs/appGenerated/auth.md`](../appGenerated/auth.md).

`jsonSchemaDir` is the app's input, not generator state. A schema already there is never deleted or
rewritten by this feature; it is generated like any other document. Turning `app.useUserSchema` off
does not remove a `User.json` left from an earlier run — it keeps producing a `User` table until the
app deletes the file.

## `preSelect`

1. `TenantScope.middleware` runs first in `server.ts`. The header is required on application routes:
   missing → `400`, non-UUID → `400`. The framework health check `/hello` is exempt. It writes
   `tenantId`.
2. A token claim is ignored — the header is the space.
3. Login and token refresh verify `UserTenant(userId, tenantId)`: not a member → `403`.
4. Registration links the new account to the header tenant.
5. `POST /tenant/select` does not exist; one build serves one tenant.

A request without a tenant never reaches the repository. `onMissing: "deny"` answers `403` for any
route that bypasses the middleware.

## `option`

1. `TenantScope.middleware` runs at L0 (guest pass): no token yet, so a valid header may set the
   tenant for public endpoints.
2. `Authentication.middleware` verifies the token.
3. The generated controller runs `TenantScope.middleware` again: the `tenantId` claim decides; a
   token without it → `401` (`tenant not selected`); a malformed claim → `401`.
4. Registration and login need no header. Tokens are minted without a tenant claim.
5. `GET /api/tenant` lists the user's mappings.
6. `POST /api/tenant/select` `{ tenantId }` validates the mapping in the database (`403` if absent)
   and returns new access + refresh tokens carrying the claim.
7. Refresh keeps the claim and re-validates the mapping; a removed mapping → `401`.

`TenantController` itself attaches only `Authentication.middleware`, so a token without a tenant can
still list and select. Custom controllers that need a selected tenant must attach
`TenantScope.middleware` after their authentication middleware.

## `single`

One account belongs to one tenant. The mode needs `tenant.enable` and a JWT sign-in method
(`auth.localAuth` or an OAuth provider): login is where the claim is minted.

1. `TenantScope.middleware` runs at L0 (guest pass); a valid header may set the tenant for public
   endpoints.
2. `Authentication.middleware` verifies the token; the generated controllers then run
   `TenantScope.middleware` again and the `tenantId` claim decides, exactly as in `option`.
3. Every login path — `POST /auth/token` (local and OAuth) and `POST /auth/firebase` — looks up the
   account's `UserTenant` rows:

   | Rows | Result |
   | --- | --- |
   | 1 | access and refresh tokens carry `tenantId` |
   | 0 | tokens carry no claim; login still succeeds, so the app can guide the account through creating its tenant |
   | more than 1 | `409` `tenant_ambiguous` — one account one tenant is the mode's promise, so extra rows are a data error |

4. No tenant endpoint is generated: there is no `GET /tenant` and no `POST /tenant/select`.
5. Refresh keeps a claim the refresh token already carries and re-validates the mapping (removed
   mapping → `401`). A token without a claim is resolved again through the same 1 / 0 / more-than-1
   rule.

`POST /auth/register` still links the header tenant when one is present, as in the other modes. The
tenant itself is created by the application's own endpoint; this module does not provide one.

## `UserTenant`

The module owns one table, copied into `jsonSchemaDir` on first enable:

```jsonc
{
    "documentName": "UserTenant",
    "restApi": { "methods": [] },
    "uniqueIndex": [["userId", "tenantId"]],
    "properties": {
        "userId":   { "type": "string", "x-format": "UUID" },
        "tenantId": { "type": "string", "x-format": "UUID" }
    }
}
```

An existing `UserTenant.json` is left alone, so the app can extend it.

`TenantService`:

```ts
addUserTenant(tenantId)              // userId from UserContext; idempotent
linkUserTenant(userId, tenantId)     // registration / provisioning
hasUserTenant(userId, tenantId)
removeUserTenant(userId, tenantId)
listUserTenants(userId?)
singleUserTenant(userId)             // single mode: the one tenant, or undefined; 409 on more than one
```

The tenant system decides where tenant ids come from (invite, billing, admin console); it only has
to call `addUserTenant` or `linkUserTenant`.

## Account deletion

`AccountDeletionService` keeps owning deletion. With tenant isolation enabled it removes the
`UserTenant` mapping instead of tombstoning the shared account; `auth.deleteAccount.deleteTables`
runs in both modes. See [`accountDeletion.md`](accountDeletion.md).

## Joins

A `join` is scoped by the joined document's own tenant rule, not only by the root document's. The
SQL adapter adds the rule as a nested `where` term for every hop of the path: `join=["menuItem"]`
filters `menuItem`, and `join=["menuItem.category"]` filters both `menuItem` and `category`.

A row whose foreign key points at another tenant's row is not returned with that row's columns; the
read comes back empty. A joined document with no tenant rule joins unchanged. A missing tenant with
`onMissing: "deny"` answers `403`, the same as the root document.

Ownership rules (`user._id`) are not applied to joined rows — joining another user's profile is
legitimate. The Mongoose adapter does not implement joins, so this applies to the SQL target only.

## Limits

- The claim is a snapshot. A revoked mapping stays usable until the access token expires; `refresh`
  re-checks the database, and so does `select` in `option` mode.
- `preSelect` trusts the header. A caller that knows a tenant UUID can send it; use it only where the
  client build is controlled and tenant ids are not secret.
- Registration links the header tenant when one is present, in all modes. An open registration
  endpoint therefore lets a caller pick a tenant; gate registration where tenants are private.
- Unique indexes are not rewritten. Declare tenant-scoped uniqueness explicitly, e.g.
  `"uniqueIndex": [["tenantId", "email"]]`.
- `listUserTenants` has no pagination and no ordering.

## Tests

- `test/unit/tenantScopeContext.test.ts` — decision and UUID validation for every mode.
- `test/unit/isolation.test.ts` — rule and `UserTenant` validation.
- `test/unit/tenantSingle.test.ts` — `single` config rules, claim resolution in every login path.
- `test/e2e/tenant.test.ts` — `option`: login → list → select → scoped CRUD → account deletion.
- `test/e2e/tenantSingle.test.ts` — `single`: login claim with one mapping, no claim with none,
  `409` with several, no tenant endpoint.
- `test/e2e/tenantHeader.test.ts` — `preSelect` with no auth module.
- `test/fixtures/scenarios/sql-tenant` / `sql-tenant-header` / `sql-tenant-single` — golden output.
- `test/e2e/compile.test.ts` — `tenant-option-rbac-off`, `tenant-preSelect-auth-off`,
  `tenant-single-auth-on`.

The e2e suites are opt-in: `npm run test:e2e`.
