# Isolation Rules (Row-Level Ownership and Tenancy)

An isolation rule adds a query term the repository ANDs into every read and write of a document.
The current form is `x-documentConfig.isolation`; the older single-field `dataIsolation` form is
still accepted and normalized into it.

## How it works

1. Declare `isolation` in `x-documentConfig` of a JSON Schema.
2. The generator writes `DataIsolationRegistry.gen.ts`: entity class name → rule list.
3. `Authentication.middleware` establishes the request scope as an `AsyncLocalStorage` store
   (`UserContext`) from the verified access token.
4. Both repository adapters read the registry at runtime and resolve every rule from that scope.

## Configuration

```jsonc
{
    "x-documentConfig": {
        "documentName": "Project",
        "isolation": [
            { "field": "tenantId", "source": "user.tenantId", "onMissing": "deny" },
            { "field": "ownerId",  "source": "user._id",      "onMissing": "skip" }
        ],
        "restApi": {
            "methods": ["get", "getList", "post", "put", "patch", "delete"]
        }
    },
    "properties": {
        "tenantId": { "type": "string", "index": true },
        "ownerId":  { "type": "string", "index": true },
        "title":    { "type": "string" }
    }
}
```

| Key | Values | Meaning |
| --- | --- | --- |
| `field` | a string property of the document | column the rule filters and stamps |
| `source` | `user._id` \| `user.tenantId` | request-context value to resolve |
| `onMissing` | `skip` \| `deny` | what happens when the value is absent |

Defaults: `user._id` → `skip`, `user.tenantId` → `deny`. The tenant source requires
`vex.config.tenant.enable`; the rule is rejected at generation time otherwise.

The legacy form is an ownership rule:

```jsonc
"dataIsolation": { "field": "ownerId" }
```

is equivalent to `{ "field": "ownerId", "source": "user._id", "onMissing": "skip" }`.

## Behavior

- **Reads and writes** — `find`, `findOne`, `update`, `replace`, `delete`, `deleteWhere`,
  `softDelete`, `count` all carry the terms. Isolation always wins over the caller's filter.
- **Create** — isolation fields are stripped from the request data, then stamped from the request
  context. `field: "_id"` is never stamped; it only filters the row's own id.
- **Updates** — isolation fields are stripped, never re-stamped. A row cannot be moved to another
  tenant or owner through the API.
- **Request bodies** — isolation fields are omitted from the generated `Payload{Document}` type,
  so tsoa rejects a caller that tries to set one.
- **`skip`** — no value, no term. Used for ownership: public routes keep working.
- **`deny`** — no value, `403`. Used for tenancy: a document that declares a tenant rule is
  unreachable without a tenant.

## Validation

Generation fails when:

- `isolation` is not an array, or a rule names a field that does not exist or is not a `string`;
- a rule has an unknown `source` / `onMissing`, or declares the same field twice;
- a `user.tenantId` rule appears on the identity document (`x-vexData: "userId"`) or on
  `UserTenant` — both are read before a tenant is known;
- the tenant feature is enabled without a usable `UserTenant` document, or its `userId` /
  `tenantId` properties are missing or not strings.

## Related: audit fields

Isolation scopes *queries*; the reserved `default` keywords (`onCreateUserId`, `onUpdateTimestamp`,
…) fill *columns* on write. They are independent and can be combined. See
[`auditFields.md`](auditFields.md).

## Dependencies

- Requires authentication to establish the request context.
- Works with RBAC — both filters compose.
- See [`tenantIsolation.md`](tenantIsolation.md) for the tenant source and token claim.
