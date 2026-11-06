# Tenant Isolation

Tenant isolation scopes documents to a tenant. It is a standalone module: it does not import the auth
module, and it is emitted only when `vex.config.tenant.enable` is true. The tenant id is always a
UUID; the header (`x-tenant-id`) and the token claim (`tenantId`) are fixed.

```jsonc
"tenant": {
    "enable": true,
    "IsolationMode": "preSelect"   // or "option"; defaults to "preSelect"
}
```

`IsolationMode` decides how a request gets its tenant:

| Mode | Who chooses the tenant | When |
| --- | --- | --- |
| `preSelect` | the app build / client (header) | one frontend per tenant, e.g. a branded app |
| `option` | the logged-in user | one app, user logs in then picks an organization |

Documents opt in with an isolation rule:

```jsonc
"isolation": [
    { "field": "tenantId", "source": "user.tenantId", "onMissing": "deny" }
]
```

The rule field is the document column; it does not have to be named `tenantId`. See
[`dataIsolation.md`](dataIsolation.md).

## Generated files

Emitted only when the feature is enabled; turning it off removes them on the next run
(`cleanupStaleFiles`).

| File | When | Role |
| --- | --- | --- |
| `jsonSchema/UserTenant.json` | enabled, if absent | the user ↔ tenant mapping table |
| `_middlewares/TenantScopeContext.gen.ts` | enabled | pure decision + UUID check |
| `_middlewares/TenantScope.gen.ts` | enabled | the middleware |
| `_services/TenantService.gen.ts` | enabled | link / unlink / list |
| `_controllers/TenantController.gen.ts` | `option` | `GET /tenant`, `POST /tenant/select` |
| `_types/Tenant.gen.ts` | `option` | response types |

`Authentication.middleware` and `JWTService` contain no tenant code. The generated auth controller
uses `TenantService` in `preSelect` mode and `JWTService.generateAccessToken(user, index, { tenantId })`
in `option` mode.

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
```

The tenant system decides where tenant ids come from (invite, billing, admin console); it only has
to call `addUserTenant` or `linkUserTenant`.

## Account deletion

`AccountDeletionService` keeps owning deletion. With tenant isolation enabled it removes the
`UserTenant` mapping instead of tombstoning the shared account; `auth.deleteAccount.deleteTables`
runs in both modes. See [`accountDeletion.md`](accountDeletion.md).

## Limits

- The claim is a snapshot. A revoked mapping stays usable until the access token expires; `refresh`
  and `select` re-check the database.
- `preSelect` trusts the header. A caller that knows a tenant UUID can send it; use it only where the
  client build is controlled and tenant ids are not secret.
- Registration links the header tenant when one is present, in both modes. An open registration
  endpoint therefore lets a caller pick a tenant; gate registration where tenants are private.
- Unique indexes are not rewritten. Declare tenant-scoped uniqueness explicitly, e.g.
  `"uniqueIndex": [["tenantId", "email"]]`.
- `listUserTenants` has no pagination and no ordering.

## Tests

- `test/unit/tenantScopeContext.test.ts` — decision and UUID validation.
- `test/unit/isolation.test.ts` — rule and `UserTenant` validation.
- `test/e2e/tenant.test.ts` — `option`: login → list → select → scoped CRUD → account deletion.
- `test/e2e/tenantHeader.test.ts` — `preSelect` with no auth module.
- `test/fixtures/scenarios/sql-tenant` / `sql-tenant-header` — golden output for both modes.
- `test/e2e/compile.test.ts` — `tenant-option-rbac-off`, `tenant-preSelect-auth-off`.

The e2e suites are opt-in: `npm run test:e2e`.
