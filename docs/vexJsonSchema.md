# VeryExpress JSON Schema Reference

Schema files live in `jsonSchema/` (configured via `vex.config.json → jsonSchemaDir`).  
Each `.json` file defines one REST resource. Filename must match `x-documentConfig.documentName`.

---

## Top-level structure

```jsonc
{
    "type": "object",
    "x-documentConfig": { ... },
    "properties": { ... },
    "required": ["field1", "field2"],
    "additionalProperties": false
}
```

---

## `x-documentConfig`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `documentName` | `string` | yes | Resource name. Must match filename (e.g. `User.json` → `"User"`). Used as collection name, controller class, route prefix. |
| `methods` | `array<schemaMethod>` | yes | REST methods to generate. See values below. |
| `uniqueIndex` | `array<array<string>>` | no | Compound unique index definitions, e.g. `[["email"], ["userId","role"]]`. |

### `methods` values

| Value | HTTP | Description |
| --- | --- | --- |
| `get` | `GET /:id` | Get single document by id |
| `getList` | `GET /` | Get paginated list |
| `post` | `POST /` | Create document |
| `put` | `PUT /:id` | Full replace |
| `patch` | `PATCH /:id` | Partial update |
| `delete` | `DELETE /:id` | Delete document |

---

## Property fields

| Field | Type | Description |
| --- | --- | --- |
| `type` | `string` | JSON Schema type: `string`, `number`, `integer`, `boolean`, `object`, `array` |
| `required` | `boolean` | Marks field as required in API validator |
| `format` | `string` | JSON Schema format hint, e.g. `email`, `date-time` |
| `index` | `boolean` | Create DB index on this field |
| `enum` | `array<string>` | Restrict values to this list |
| `default` | `any` | Default value. Six reserved keyword values make the DB layer fill the field itself — see [auto-written audit fields](#auto-written-audit-fields-default-keywords) |
| `minLength` / `maxLength` | `number` | String length constraints (used in validator) |
| `minimum` / `maximum` | `number` | Number constraints (used in validator) |
| `description` | `string` | OpenAPI description |
| `example` | `any` | OpenAPI example value |
| `x-format` | `string` | VEX format hint. See below. |
| `x-vexData` | `string` | VEX special role. See below. |
| `x-foreignKey` | `object` | Foreign-key join config. See below. |
| `x-hidden` | `boolean` | Exclude field from API response |

### `x-format` values

| Value | Description |
| --- | --- |
| `Primary` | Marks field as primary key (`_id`). Auto-indexed. |
| `PrimaryUUID` | Primary key stored as a UUID column (SQL: `uuid`) |
| `UUID` | UUID string field (SQL: `uuid`) |
| `ObjectId` | MongoDB ObjectId (mongo mode) |
| `UnixTimestamp` | Integer epoch **seconds** (SQL: `bigint`) |
| `Timestamp` | ISO-8601 datetime (SQL: `timestamptz`, mapped back to an ISO string) |
| `enum` | Enum field — pair with `enum` array |

### `x-vexData` values

| Value | Description |
| --- | --- |
| `role` | Marks this field as the RBAC role field. Required for role-based access control to work. |
| `userId` | Marks the field that holds the identity value. Declare it **exactly once**, on the account schema (`User._id`) — every `onXXUserId` audit field is filled from it. |

---

## Auto-written audit fields (`default` keywords)

A field whose `default` is one of the reserved keywords below is owned by the DB layer: the
repository adapter strips any client-supplied value and writes the correct one per write phase.
Works for both `sql` and `mongo` targets. Full reference:
[`docs/features/auditFields.md`](features/auditFields.md).

| `default` keyword | field declaration | written on |
| --- | --- | --- |
| `onCreateTimestamp` | `{ "type": "string", "x-format": "Timestamp" }` | create only |
| `onCreateUnixTimestamp` | `{ "type": "integer", "x-format": "UnixTimestamp" }` | create only |
| `onUpdateTimestamp` | `{ "type": "string", "x-format": "Timestamp" }` | update / replace only |
| `onUpdateUnixTimestamp` | `{ "type": "integer", "x-format": "UnixTimestamp" }` | update / replace only |
| `onCreateUserId` | `{ "type": "string", "x-format": "UUID" }` | create only |
| `onUpdateUserId` | `{ "type": "string", "x-format": "UUID" }` | update / replace only |

```jsonc
"createdAt": { "type": "string",  "x-format": "Timestamp", "default": "onCreateTimestamp" },
"createdBy": { "type": "string",  "x-format": "UUID",      "default": "onCreateUserId" },
"updatedAt": { "type": "string",  "x-format": "Timestamp", "default": "onUpdateTimestamp" },
"updatedBy": { "type": "string",  "x-format": "UUID",      "default": "onUpdateUserId" }
```

Generation fails early on a contradiction: an unknown `x-vexData` value, an `onXXUserId` field whose
column type differs from the tagged identity field, a mismatched timestamp keyword, a missing identity
field, or an audit field marked `required`.

---

## Foreign keys (`x-foreignKey`)

Enables API-level joining between resources via `join` query param.

```jsonc
"userId": {
    "type": "string",
    "x-foreignKey": {
        "schemaName": "User",       // documentName of target schema
        "fieldName": "_id",         // field on target to match against
        "relationType": "many-to-one" // one-to-one | many-to-one. !!! NO "one-to-many" AT HERE !!!
    }
}
```

### `relationType` options

| Value | Description |
| --- | --- |
| `one-to-one` | Single document join |
| `many-to-one` | Many local docs → one target doc |

### Query params for joins (GET requests)

| Param | Type | Description |
| --- | --- | --- |
| `join` | `array<string>` (query string) | Local field names to join, e.g. `join=["userId"]` |
| `select` | `array<string>` (query string) | Fields to return from joined document. Empty = all. |

Example: `GET /userContact?join=["userId"]&select=["name","email"]`

---

## System fields

| Field | Notes |
| --- | --- |
| `_id` | Define with `"x-format": "Primary"` and `"index": true`. Generator uses it as the document primary key. |

---

## Full example

```jsonc
{
    "type": "object",
    "x-documentConfig": {
        "documentName": "UserContact",
        "methods": ["get", "getList", "post", "put", "patch", "delete"],
        "uniqueIndex": [["userId", "phoneNo"]]
    },
    "properties": {
        "_id": {
            "type": "string",
            "x-format": "Primary",
            "index": true
        },
        "userId": {
            "type": "string",
            "x-format": "UUID",
            "required": true,
            "x-foreignKey": {
                "schemaName": "User",
                "fieldName": "_id",
                "relationType": "one-to-one"
            },
        },
        "phoneNo": {
            "type": "string",
            "index": true
        },
        "isActive": {
            "type": "boolean",
            "default": true
        }
    },
    "additionalProperties": false,
    "required": ["userId"]
}
```
