# Data Isolation (Row-Level Ownership)

Available from v0.6.x. Provides transparent per-entity ownership: all queries are automatically scoped to the authenticated user.

## How it works

1. Declare `dataIsolation` in `x-documentConfig` of your JSON Schema
2. Generator produces `DataIsolationRegistry.gen.ts` mapping entity → ownership field
3. `DataIsolationContext` middleware runs before request handlers, storing the current user's identity
   (`vexUserId` token claim, `_id` as fallback) in `AsyncLocalStorage`
4. `TypeOrmRepositoryAdapter` reads the registry and injects `{ [field]: userId }` into every query

## Configuration

```jsonc
{
    "x-documentConfig": {
        "documentName": "Project",
        "dataIsolation": {
            "field": "ownerId"
        },
        "restApi": {
            "methods": ["get", "getList", "post", "put", "patch", "delete"]
        }
    },
    "properties": {
        "ownerId": {
            "type": "string",
            "required": true
        },
        "title": {
            "type": "string"
        }
    }
}
```

The `field` value references a property on the same document that stores the owner's user ID.

> Note: `dataIsolation` sits directly under `x-documentConfig` — earlier revisions of this page
> showed it nested under `restApi`, which the generator never read.

## Behavior

- **All queries** — `find`, `findOne`, `update`, `delete` — get an `AND` filter: `{ [field]: currentUserId }`
- **Create** — the adapter stamps the owner field from the request context; a controller only has to
  set it by hand when the owner is *not* the authenticated user (e.g. an admin creating data for a third party).
  `field: "_id"` is never stamped (the row's own id is the caller's id only for the account document itself)
- **No userId in context** — if `Authentication` middleware hasn't set a user (e.g., public routes), the ownership filter is skipped
- **Only affects SQL/TypeORM target** — Mongoose adapter doesn't implement data isolation yet

## Related: audit fields

`dataIsolation` scopes *queries*; the reserved `default` keywords (`onCreateUserId`, `onUpdateTimestamp`, …)
fill *columns* on write. They are independent and can be combined. See
[`auditFields.md`](auditFields.md).

## Dependencies

- Requires authentication (`auth.localAuth: true` or OAuth) to establish request context
- Works with RBAC — both filters compose (ownership AND role check)
