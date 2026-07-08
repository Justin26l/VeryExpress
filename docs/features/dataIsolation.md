# Data Isolation (Row-Level Ownership)

Available from v0.6.x. Provides transparent per-entity ownership: all queries are automatically scoped to the authenticated user.

## How it works

1. Declare `dataIsolation` in `x-documentConfig.restApi` of your JSON Schema
2. Generator produces `DataIsolationRegistry.gen.ts` mapping entity → ownership field
3. `DataIsolationContext` middleware runs before request handlers, storing current user ID in `AsyncLocalStorage`
4. `TypeOrmRepositoryAdapter` reads the registry and injects `{ [field]: userId }` into every query

## Configuration

```jsonc
{
    "x-documentConfig": {
        "documentName": "Project",
        "restApi": {
            "methods": ["get", "getList", "post", "put", "patch", "delete"],
            "dataIsolation": {
                "field": "ownerId"
            }
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

## Behavior

- **All queries** — `find`, `findOne`, `update`, `delete` — get an `AND` filter: `{ [field]: currentUserId }`
- **Create** — the middleware does NOT auto-set the field; the controller must set it from the authenticated user
- **No userId in context** — if `Authentication` middleware hasn't set a user (e.g., public routes), the ownership filter is skipped
- **Only affects SQL/TypeORM target** — Mongoose adapter doesn't implement data isolation yet

## Dependencies

- Requires authentication (`auth.localAuth: true` or OAuth) to establish request context
- Works with RBAC — both filters compose (ownership AND role check)
