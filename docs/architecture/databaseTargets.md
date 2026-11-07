# Database Targets, Repository Layer & Data Isolation

## Target selection

`vex.config.json → dbType`:

| Value | Model generator |
|---|---|
| `"mongo"` | `src/generators/db/mongooseModel.generator.ts` |
| `"sql"` | `src/generators/db/typeormEntity.generator.ts` |

The generated app's DB target is fixed at generation time. `"sql"` means PostgreSQL: the connector
pins `type: "postgres"` and the app depends on `pg` only, so column types in the entity generator
(`uuid`, `timestamptz`, `bytea`, `jsonb`) must be PostgreSQL types.

### SQL schema creation

Schemas come from TypeORM `synchronize` at generated-app startup, controlled by the `SQL_SYNCHRONIZE` env var and wired in `_services/VexDbConnector.ts`.

The Knex-based `src/generators/db/sqlMigration.generator.ts` is **legacy/disabled**. Both its import and its call in `src/index.ts` are commented out, along with the `sqlMigrations` runner in `VexDbConnector.ts`. Do not treat it as live code.

## Repository adapter pattern

Controllers never touch the ORM/ODM directly. They call `VexDb.getRepository(Entity)`, which returns a `VexRepository<T>`.

Interface: `src/templates/_types/vex/VexRepository.ts`

```ts
find(filter, join?, select?, pagination?)  count(filter)
findOne(filter, join?, select?)            findOneWhere(filter, join?, select?)
create(data)                               save(data)
replace(id, data)
update(id, data)                           delete(id)
deleteWhere(filter)
```

`join` and `select` are optional on the `find` variants; the generic `U` parameter carries the joined/selected shape.

| Adapter | Target | Notes |
|---|---|---|
| `src/templates/_services/TypeOrmRepositoryAdapter.ts` | SQL | Maps `$and` / `$or` / `$like` / `$gt` etc. → TypeORM `FindOptions`. Applies the data-isolation ownership filter |
| `src/templates/_services/MongooseRepositoryAdapter.ts` | Mongo | Thin wrapper. Join, select, pagination and count are largely TODO — Mongoose support is less mature than SQL |

Both are static templates — file extensions are `.ts` in-repo, copied as `.gen.ts` into the generated app.

## Transactions

`VexDbConnector` owns the transaction entry:

```ts
await vexDb.transaction(async (tx) => {
    const repo = tx.getRepository(OrderEntity);
    await repo.create({ ... });
});
```

The callback receives `getRepository` only — never the TypeORM manager. Repositories are the
normal adapters, so isolation, audit stamping and fail-closed checks apply inside the transaction.
Throwing rolls everything back; nesting throws; the mongo target throws because the generated
adapter has no transaction support. `dataSource` is private, so business code cannot open its own
transaction on the raw connection.

`save` is the upsert-shaped write: insert without `_id`, scoped update with one. Isolation fields
are stripped in both branches, so a row cannot be moved to another tenant or owner.

### The Mongo target does not currently type-check

`npm run test:e2e` compiles a generated app per config variant. The Mongoose variant
is asserted with `it.fails` because it fails with **8 TypeScript errors with auth off
and 11 with it on**. These are independent of RBAC and of auth being enabled:

| Error | Where |
|---|---|
| `declares 'User' locally, but it is not exported` | `_models/*Model.gen.ts` do not re-export the entity types their importers expect (the TypeORM generator does: `export * from "./../_types/User.gen"`) |
| `has no exported member 'UserWithRelations'` | same — the relations type is not surfaced by the Mongoose model template |
| `'{ type: StringConstructor, … ref: {...} }' is not assignable to 'SchemaDefinitionProperty'` | Mongoose model template's `ref` shape |
| `VexRepository<UserDocument…> is not assignable to VexRepository<User>` | the Mongoose adapter's generics |

Consequence: `vex` with `dbType: "mongo"` produces an app that cannot be built with
`npm run build` (`tsc -p .`). The golden scenarios still cover the mongo *output text*,
which is why this went unnoticed — goldens compare text, they do not compile.

`test/e2e/compile.test.ts` turns red once the Mongoose target compiles, as a prompt to
move it into the passing variant matrix.

## Filter operators

The SQL adapter maps the filter DSL (`$and`, `$or`, `$like`, `$in`, comparison operators) onto TypeORM `FindOptions`. See [`docs/features/filterOperators.md`](../features/filterOperators.md).

## Isolation (ownership and tenancy)

Declared per entity in `x-documentConfig → isolation: [{ field, source, onMissing }]`. The legacy
`dataIsolation: { field }` form is an ownership rule.

Generation produces three pieces:

1. `DataIsolationRegistry.gen.ts` (`src/generators/middlewares/dataIsolationRegistry.generator.ts`) —
   entity → rule list (`field`, `source`, `onMissing`)
2. `UserContext.ts` — `AsyncLocalStorage` carrying the request scope (`tokenData`, `requestedTenantId`,
   `tenantId`). `Authentication.middleware` writes the verified token; in tenant `option` mode the
   generated controllers run `TenantScope.middleware` right after it, and the L0 pass in `server.ts`
   captures the header first. `run` layers a patch onto the enclosing scope instead of replacing it.
3. Both adapters resolve each rule from that scope and AND every term into the query. Tenant terms
   fail closed (`onMissing: "deny"`); ownership terms keep their historical skip-when-unauthenticated
   behaviour. Isolation fields are stripped from caller data and stamped on create.
4. The SQL adapter scopes a `join` by the joined entity's own tenant rule — one nested `where` term
   per hop of the join path — so a row whose foreign key points at another tenant does not come back
   with that row's columns. Ownership rules are not applied to joined rows.

Full guides: [`docs/features/dataIsolation.md`](../features/dataIsolation.md),
[`docs/features/tenantIsolation.md`](../features/tenantIsolation.md).

## Auto-written audit fields

Columns declared with a reserved `default` keyword (`onCreateTimestamp`, `onUpdateUserId`, …) are filled by
the repository adapters on `create` / `update` / `replace` — a shared helper strips client-supplied values
first, then injects per write phase. Both targets implement it; the entity → field map comes from
`VexFieldRegistry.gen.ts` (`src/generators/middlewares/vexFieldRegistry.generator.ts`), which also exports the
`x-vexData: "userId"` identity field the token pipeline reads. A `create` that declares `onCreateUserId` but
finds no identity in `UserContext` throws rather than writing NULL.

Guide: [`docs/features/auditFields.md`](../features/auditFields.md).

## Join whitelist

`src/generators/middlewares/joinWhitelistRegistry.generator.ts` emits a static entity → allowed-joins map consumed by `JoinWhitelistMiddleware.ts`. Populated from `x-documentConfig.restApi.joinWhitelist`; auto-filled by `jsonSchemaForeignKeys.ts` when unset. Controllers with a whitelist get `@Middlewares(JoinWhitelistMiddleware.middleware("<DocName>"))`.

See [`docs/features/joinWhitelist.md`](../features/joinWhitelist.md) and [`docs/features/ForeignKey.md`](../features/ForeignKey.md).

## RBAC

`src/generators/middlewares/RBACmiddleware.generator.ts` produces `RoleBaseAccessControl.gen.ts`, enforcing per-document CRUD permissions from the role JSON files. Role sources live in `src/roles/` (user-editable); `roleDefinitions.ts` keeps per-role files present with default permissions.

See [`docs/features/rbac.md`](../features/rbac.md).
