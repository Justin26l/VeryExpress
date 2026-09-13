# Audit / Ownership Fields (auto-written on the write paths)

Status: **implemented** in v0.8.0. Supersedes the unmerged prototype commit `b21be2e`
(branch `fix/data-isolation-dynamic-field`), which was **not** merged into `main` and must not be merged as-is.

## Problem

Generated apps declare `createdBy` / `createdAt` / `updatedBy` / `updatedAt` in their JSON Schemas,
but nothing ever writes them — `grep -rn "createdBy\|updatedBy" src/` in the generator is empty.
The columns exist in the entities and stay NULL forever.

Consequences seen in the wild (RenoMaster):

- A custom controller checking `findOne({ _id, createdBy: request.user._id })` never matches → `404` on `DELETE /api/job/{id}`.
- Timeline ordering bugs, because `createdAt` is also never written.

## Goal

The DB layer maintains these fields **by itself** on the write paths, for every downstream app,
without per-app hand-written code. Declaration is schema-driven and reads like a SQL column definition.

## 1. Declaring auto-written fields — the `default` keyword family

Auto-written fields are declared with the JSON Schema native `default` keyword, using one of six reserved
keyword values. This mirrors SQL: *what the column is* is `x-format` / `type`, *what fills it* is `default`.

| `default` keyword | field declaration | PostgreSQL column | TS type | written on |
| --- | --- | --- | --- | --- |
| `onCreateTimestamp` | `{ "type": "string", "x-format": "Timestamp" }` | `timestamptz` | `string` (ISO-8601) | create only |
| `onCreateUnixTimestamp` | `{ "type": "integer", "x-format": "UnixTimestamp" }` | `bigint` | `number` | create only |
| `onUpdateTimestamp` | `{ "type": "string", "x-format": "Timestamp" }` | `timestamptz` | `string` (ISO-8601) | update / replace only |
| `onUpdateUnixTimestamp` | `{ "type": "integer", "x-format": "UnixTimestamp" }` | `bigint` | `number` | update / replace only |
| `onCreateUserId` | `{ "type": "string", "x-format": "UUID" }` | `uuid` | `string` | create only |
| `onUpdateUserId` | `{ "type": "string", "x-format": "UUID" }` | `uuid` | `string` | update / replace only |

Naming rule: `Timestamp` = datetime, `UnixTimestamp` = integer epoch **seconds**. Never mix the two for one field.

### Example (`Job.json`)

```jsonc
"active": {
    "type": "boolean",
    "default": true,                 // a literal default — untouched, still behaves as before
    "required": true
},
"createdAt": { "type": "string",    "x-format": "Timestamp", "default": "onCreateTimestamp" },
"createdBy": { "type": "string",    "x-format": "UUID",      "default": "onCreateUserId" },
"updatedAt": { "type": "string",    "x-format": "Timestamp", "default": "onUpdateTimestamp" },
"updatedBy": { "type": "string",    "x-format": "UUID",      "default": "onUpdateUserId" }
```

A **literal** `default` (string / number / boolean / array / object that is not one of the six keywords)
keeps its current meaning and is not affected by this feature.

### New `x-format` value

`xFormatType` gains `Timestamp = "Timestamp"`, mapping to `timestamptz` in `X_FORMAT_DB_TYPE`.
`resolveDbType` already prefers `x-format` over the JSON Schema `format` hint, so `x-format` wins when both are present.

The driver returns a `Date` for `timestamptz`. Generated entities carry a transformer that writes the ISO
string through and converts it back on read, so the API, the generated interface and the entity all keep
the `string` contract — no `Date` leaks into responses, and the OpenAPI/DTO types stay truthful.

## 2. Where the user id comes from — `x-vexData: "userId"`

Exactly one field in the whole schema set is tagged as the identity source:

```jsonc
// User.json
"_id": {
    "type": "string",
    "x-format": "PrimaryUUID",
    "x-vexData": "userId",
    "index": true
}
```

Semantics: *this column holds the identity value that audit fields store*. It is the equivalent of the
existing `x-vexData: "role"` marker, and the **only** precedent-style way a schema declares which column
carries identity.

Rules:

- The tag is required whenever any `onXXUserId` keyword is used — even when `app.useUserSchema` is false.
- The tag appears exactly once across all schemas. More than one is an error (ambiguous identity source).
- The tagged field should be indexed (`"index": true`) — it is used as a lookup key by the refresh flow.

## 3. Token claims

The generated JWT payload carries the identity explicitly, so no consumer needs to know the schema shape:

| token | payload |
| --- | --- |
| access | user profile fields + `vexUserId` + `vexRole` |
| refresh | `{ vexUserId }` (with `?? _id` fallback for tokens issued before the upgrade) |

- `vexUserId` = value of the `x-vexData: "userId"` tagged field.
- `vexRole` = `rolesOf(user)` — a snapshot at signing time. It is intentionally **absent from the refresh
  token**: refresh tokens are long-lived, roles may change, and `POST /auth/refresh` re-reads the user
  anyway. Only the access token (short-lived) carries roles.
- The API `profile` object returned to clients stays as it is — `vexUserId` / `vexRole` belong to the token
  payload, not to the profile. `JWTService.sanitizeUser()` therefore splits into a profile builder and a
  token-payload builder.
- `POST /auth/refresh` resolves the user by the tagged field (`{ [taggedField]: payload.vexUserId }`)
  instead of a hardcoded `{ _id: payload._id }`, with `payload.vexUserId ?? payload._id` for old tokens.

## 4. Runtime behaviour (write paths)

A generated registry (`VexFieldRegistry.gen.ts`, entity → `[{ field, type }]`) is read by the repository
adapters. Both adapters apply the same two-step rule:

1. **Strip** — every declared auto field is removed from caller-supplied data. A client can never forge
   `createdBy` / `updatedAt`; the context is always authoritative.
2. **Inject** — only the values valid for the current phase:

| phase | inject | strip-only (no inject) |
| --- | --- | --- |
| create | `onCreate*` | `onUpdate*` |
| update / replace | `onUpdate*` | `onCreate*` |

Stripping-without-injecting on the opposite phase is what keeps `createdBy` / `createdAt` immutable:
a PATCH never overwrites them.

Values written:

| keyword kind | value |
| --- | --- |
| `onXXTimestamp` | `new Date().toISOString()` — an ISO-8601 string the `timestamptz` column accepts directly |
| `onXXUnixTimestamp` | `Math.floor(Date.now() / 1000)` — epoch seconds |
| `onXXUserId` | the request context identity (`vexUserId`); **skipped** when there is none |

The registry generator is the only place that knows the mapping: adapters import
`entityVexFields` at runtime rather than re-deriving it from the schema.

### Request body type — `Create{Doc}`

Server-owned fields must not appear in the API *input*. The interface generator therefore emits, into
`src/system/_types/{Doc}.gen.ts`:

```ts
export type CreateJob = Omit<Job, "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "_id">;
```

and the controllers accept `Create{Doc}` (create, put) / `Partial<Create{Doc}>` (patch). The omission is
**declaration-based, never name-based**: a field is dropped when it carries a reserved `default` keyword,
or when it is the primary key (`x-format: Primary` / `PrimaryUUID`) and `app.allowApiCreateUpdate_id` is
false. A column literally named `createdAt` without a keyword stays client-writable — the declaration is
the contract.

Two consequences:

- The OpenAPI request schema stops advertising fields the server strips or overwrites; the response schema
  keeps them, because clients still read them.
- The generated tsoa config is `noImplicitAdditionalProperties: "throw-on-extras"`, so a request that
  **still sends** one of those fields is rejected with `400 Invalid Request Body` instead of having the
  value quietly dropped. Clients that echo a whole row back on PATCH must strip these fields first.

The adapter's strip step stays as defence in depth: it also covers non-HTTP callers (internal services,
seed scripts) that bypass tsoa validation entirely.

`delete()` is **not** covered. There is no soft delete in the framework
(`grep -rn "softDelete\|active: false" src/` is empty) — `delete()` issues a real `DELETE`, so there is no
row left to audit. Soft delete is out of scope for this feature.

### App-layer only — no SQL `DEFAULT`

All six keywords are injected by the adapter; **no SQL `DEFAULT` / `ON UPDATE` expression is generated**.

Reasons:

- PostgreSQL has no `ON UPDATE CURRENT_TIMESTAMP` (MySQL only), so SQL-level `onUpdate` cannot be
  expressed portably.
- Emitting a SQL default *and* injecting in the adapter gives one field two sources of truth, which
  diverges for direct SQL writes and makes incidents harder to reason about.

All auto fields are generated `nullable: true`: `onUpdate*` is NULL until the first update, and
`onCreate*` must not break pre-existing rows.

Adapter is still the only writer, but `create()` is not the only entrance to a table. Anyone writing via
raw SQL bypasses the audit fields — same as any ORM-level convention. Documented, accepted.

## 5. No authenticated context

Public / anonymous / internal calls have no ALS store (`DataIsolationContext` does not run one when
`req.user` is absent):

- Timestamp keywords are context-free → **still injected**.
- `onXXUserId` keywords → **skipped**, field left unset (NULL column). Never `"undefined"`, never a throw.
- Nothing in the write path raises because the context is missing.

## 6. Validation (`formatJsonSchema` / checkSchema stage — fail at generation, not at runtime)

| # | rule | on violation |
| --- | --- | --- |
| R1 | at most one field tagged `x-vexData: "userId"` across all schemas | error |
| R2 | any `onXXUserId` keyword present requires R1 satisfied | error |
| R3 | tagged identity field must be `type: "string"` and indexed (or primary) | error |
| R4 | resolved column family of every `onXXUserId` field must equal that of the tagged field | error |
| R5 | `onXXTimestamp` must be `string` + `x-format: "Timestamp"`; `onXXUnixTimestamp` must be `integer` + `x-format: "UnixTimestamp"` | error |
| R6 | `x-vexData` value must be a known one (`role`, `userId`) — catches typos | error |
| R7 | an audit field must not be `required` — its value is stripped from the client body anyway | error |

R4 compares the **resolved** family, not the raw string: `Primary`, `PrimaryUUID` and `UUID` all resolve to
`uuid`, so tagging `_id` as `PrimaryUUID` and declaring `createdBy` as `UUID` is consistent and does not
raise. The error message names both offending paths (the tagged field and the audit field).

Validation runs once, after every schema is loaded (`validateAuditFields()` in
`src/preprocess/auditFields.ts`, called from the pipeline), because R1/R2 are cross-document. All problems
are collected and reported together; `log.error` exits the generator, so a contradiction never reaches runtime.

## 7. Backward compatibility

- Schema with no reserved keyword and no tag → nothing changes; generation output is identical.
- Schema with a literal `default` → unchanged.
- Existing generated apps: re-run `vex`; entities gain `nullable` audit columns if they were declared.
- Existing rows keep `createdBy = NULL`. This feature cannot backfill; a downstream app that needs
  ownership on legacy rows must migrate data itself.
- Tokens issued before the upgrade still work (the `?? _id` fallback on refresh).
- The prototype branch's lowercase `x-format` values (`primary`, `uuid`, …) are **rejected** — this design
  keeps the current capitalized values (`Primary`, `PrimaryUUID`, `UUID`, `UnixTimestamp`) and only adds
  `Timestamp`.

## 8. Mongoose

Implemented in parallel with TypeORM — same registry, same strip/inject phases, same values
(ISO-8601 string for `onXXTimestamp`, epoch seconds for `onXXUnixTimestamp`), so both targets store
comparable data. One extra step: `mongooseModel.generator` hands the model generator a copy of the schema
with the reserved keywords removed, because that generator copies `default` straight into the mongoose
schema — a keyword would otherwise become a literal string default.

(The current Mongoose adapter has no data-isolation support; that gap is unrelated and stays out of scope.)

## 9. Out of scope

- Soft delete.
- Backfilling existing NULL rows.
- RenoMaster's own job-ownership check (its owner is the `Client` profile, not the `User`).
- Extending `useUserSchema: false` into a fully custom account model. Today `User.json` is copied from the
  templates unconditionally and `localAuth` requires `useUserSchema: true`, so a custom identity schema is
  not reachable yet; `x-vexData: "userId"` is the forward-compatible hook for it.
