# Join Whitelist

Available from v0.6.x. Controls which relation joins are allowed at the API level.

## Why

Foreign-key relations (`x-foreignKey`) generate TypeScript types that include all possible joins. Without a whitelist, any client could request expensive or unintended joins. The whitelist restricts `join` query parameters to an explicit allowlist.

## Configuration

```jsonc
{
    "x-documentConfig": {
        "documentName": "User",
        "restApi": {
            "methods": ["get", "getList"],
            "joinWhitelist": ["contact", "address"]
        }
    }
}
```

If `joinWhitelist` is not set, the preprocessor auto-populates it with ALL detected relations (local FK + reverse FK). To disable all joins, set `joinWhitelist: []`.

## Generated artifacts

- `JoinWhitelistRegistry.gen.ts` — Static map of `documentName → { relationName → relatedDocumentName }`
- `JoinWhitelistMiddleware` — Reads the `join` query param, validates each entry against the registry, strips invalid entries

## Behavior

- `GET /{resource}?join=["contact"]` — allowed if "contact" is in whitelist
- `GET /{resource}?join=["secretRelation"]` — silently removed if not whitelisted
- The `{DocName}ApiRelations` type only includes whitelisted relations; `{DocName}WithRelations` includes all (for internal use)
- `noRelations: true` on schema config disables relation types entirely (no `WithRelations` or `WithApiRelations` types)

## To see all available relations

The whitelist is written back to your JSON schema file during preprocessing. Check the `x-documentConfig.restApi.joinWhitelist` array in the source `.json` file.
