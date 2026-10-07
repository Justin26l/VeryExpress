# Account deletion (tombstone)

Self-service account deletion for generated apps: `POST /api/auth/delete-account` plus a
`/delete_account` page. The account is **soft-deleted** — the row survives so business tables can
keep their required foreign keys — and its credentials and personal data are erased.

This covers the identity domain only. Business rows, uploaded objects and third-party identities
(Firebase, etc.) belong to the application.

## Configuration

```json
{
    "auth": { "deleteAccount": true },
    "app":  { "showSoftDeleted": false }
}
```

| Option | Default | Meaning |
|---|---|---|
| `auth.deleteAccount` | `true` | Emit the endpoint, the service and the page. Also requires auth to be enabled — a deletion endpoint that cannot authenticate a caller could only delete the wrong account. |
| `app.showSoftDeleted` | `false` | Lifts the adapter's soft-delete filter app-wide, making tombstones visible (and writable) again. Loud on every generation run. |

Both are read with `??`, so an explicit `false` is never swallowed. There is no `deleteAccountPlaceholder`:
the tombstone label is the constant `"Deleted user"`.

## Declaring soft delete

Tag one boolean property with `x-vexData: "softDelete"`:

```jsonc
"properties": {
    "deleted": {
        "type": "boolean",
        "default": false,
        "x-vexData": "softDelete",
        "description": "Framework-managed; never client-writable."
    }
},
"required": ["deleted"]
```

The framework then owns that field:

- **Not client-writable.** `collectRequestManagedFields()` omits it, so it never appears in a
  generated request body (`PayloadUser`), and the OpenAPI schema stops advertising it. A client
  cannot soft-delete, resurrect or pre-tombstone a row through the CRUD API.
- **Hidden by default.** The adapters add `marker IS NOT TRUE` (`$ne: true` on Mongo) to every read
  and write filter, so a tombstoned row is unreachable without any call-site change.
- **Owned writes.** `softDelete(id, data)` writes the marker through the normal update-phase
  machinery, so `updatedAt` / `updatedBy` record who deleted the row and when. No `deletedAt` /
  `deletedBy` columns are added.

Validation (generation-time, fails loud):

- at most **one** marker per document;
- it must be `"type": "boolean"`, `"default": false` and **required**.

The required/default rules are load-bearing. The hide-filter is `marker IS NOT TRUE`, so a nullable
column would drop every row written before it existed. `required` + `default: false` produce a
`boolean NOT NULL DEFAULT false` column.

## Query semantics

`app.showSoftDeleted` is a **generation-time constant** baked into `VexFieldRegistry.gen.ts`, so no
request can flip it. There is deliberately no soft-delete key in `Filter<T>`: `Filter` is the shape
of every HTTP `filter` body, so a filter-level escape hatch would be a client-side bypass.

Internal callers use dedicated methods instead:

```ts
softDelete(id, data?)                    // write the marker + redaction in one update
findOneWithDeleted(filter, join, select) // skip ONLY the soft-delete term; ownership still applies
```

The hide term is **not** applied to relation loading, which is why the marker is a plain column and
not TypeORM's `@DeleteDateColumn` — the decorator nulls relation loads, and retained conversations
must still resolve their author to show "Deleted user".

> Enabling `app.showSoftDeleted` is a blunt instrument: it applies to every entity, including ones
> added later, and it removes the write protection that keeps a tombstone's audit fields frozen.

## The token guard

`Authentication.middleware` verifies the JWT signature and nothing else, so a deleted user's
unexpired access token would keep working for the rest of its lifetime. The generated
`AccountStateGuard` closes that gap.

It reads the marker **value** rather than relying on the row being hidden, so the answer holds under
`app.showSoftDeleted` — a visibility-based check would call every tombstone alive. It uses
`findOneWithDeleted` so the ownership filter still applies, and treats a missing marker as live
(`!== true`), matching the adapters.

Every other auth path is already fail-closed: refresh and the OAuth exchange look the user up
through a soft-filtered read, local login compares an email that has been wiped to NULL, and the
OAuth callback cannot re-bind because the profile rows are gone.

The guard is emitted as a no-op when the identity document declares no marker, so the middleware's
import always resolves and projects without soft delete pay nothing.

The exported middleware is **synchronous** on purpose. Both call sites are express chains, and
Express 4 does not catch a rejected promise — an `async` handler would turn every failure into an
unhandled rejection. The async work lives in `handle()` and every outcome is routed to `next()`.

## Deletion flow

`AccountDeletionService.deleteSelf()` takes the identity from `UserContext` only; no id is ever
accepted from a path or body, so one account cannot delete another. It is idempotent: a repeat call
returns `alreadyDeleted` without re-stamping the row.

Order is load-bearing:

1. **Credentials first** — auth profiles, roles, sessions. Tombstoning first would leave the OAuth
   path able to resolve the account through `provider` / `oauthId`, i.e. a deleted user could log
   back into their own tombstone.
2. **Tombstone last** — `softDelete(userId, TOMBSTONE)`. A mid-flight failure therefore leaves a
   live account that can simply be retried.

The tombstone redacts the standard personal fields: `email` → NULL, `name` → `"Deleted user"`,
`locale` / `profileErrors` → NULL, `active` → false. `email` is NULL rather than `""` because `User`
declares a unique index on it — a second deletion would collide on the empty string, and the same
address must be able to register a fresh account immediately.

The payload is derived from the project's own schema, so absent or renamed fields are never emitted
and audit / identity fields are skipped.

## The page

`GET /delete_account`, served from `LoginUI` rather than as a static file — `express.static("public")`
would expose `public/delete_account.html` at `/delete_account.html`, not at the route the store
listing points people at.

`LoginUIConfig.deleteAccount` is **optional and defaults to true**, because an app's `server.ts` is
generated once and is not overwritten on later runs; a required field would stop such a project from
compiling.

The copy is explicit that this is a tombstone, not an erasure. The client clears its stored tokens on
success: the account is gone the moment the tombstone is written, so keeping a token the server now
rejects would only produce confusing 401s.

## Integration notes

- **Migration.** Adding the marker adds a column. `SQL_SYNCHRONIZE=true` covers development;
  production needs `ALTER TABLE "user" ADD COLUMN "deleted" boolean NOT NULL DEFAULT false`.
- **`allowOverwrite: false`.** A project that pinned `UserModel.gen.ts` / `User.gen.ts` must add the
  column by hand, or clear the `.vex/meta.json` entry for those files.
- **Per-request cost.** The guard costs one narrow indexed read per authenticated request.
- **Third-party identity.** vex cannot delete a Firebase account. Do it from the app, and capture the
  provider uid *before* calling the service.
