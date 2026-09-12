# Database Targets, Repository Layer & Data Isolation

## Target selection

`vex.config.json → dbType`:

| Value | Model generator |
|---|---|
| `"mongo"` | `src/generators/db/mongooseModel.generator.ts` |
| `"sql"` | `src/generators/db/typeormEntity.generator.ts` |

The generated app's DB target is fixed at generation time.

### SQL schema creation

Schemas come from TypeORM `synchronize` at generated-app startup, controlled by the `SQL_SYNCHRONIZE` env var and wired in `_services/VexDbConnector.ts`.

The Knex-based `src/generators/db/sqlMigration.generator.ts` is **legacy/disabled**. Both its import and its call in `src/index.ts` are commented out, along with the `sqlMigrations` runner in `VexDbConnector.ts`. Do not treat it as live code.

## Repository adapter pattern

Controllers never touch the ORM/ODM directly. They call `VexDb.getRepository(Entity)`, which returns a `VexRepository<T>`.

Interface: `src/templates/_types/vex/VexRepository.ts`

```ts
find(filter, join?, select?, pagination?)  count(filter)
findOne(filter, join?, select?)            findOneWhere(filter, join?, select?)
create(data)                               replace(id, data)
update(id, data)                           delete(id)
deleteWhere(filter)
```

`join` and `select` are optional on the `find` variants; the generic `U` parameter carries the joined/selected shape.

| Adapter | Target | Notes |
|---|---|---|
| `src/templates/_services/TypeOrmRepositoryAdapter.ts` | SQL | Maps `$and` / `$or` / `$like` / `$gt` etc. → TypeORM `FindOptions`. Applies the data-isolation ownership filter |
| `src/templates/_services/MongooseRepositoryAdapter.ts` | Mongo | Thin wrapper. Join, select, pagination and count are largely TODO — Mongoose support is less mature than SQL |

Both are static templates — file extensions are `.ts` in-repo, copied as `.gen.ts` into the generated app.

## Filter operators

The SQL adapter maps the filter DSL (`$and`, `$or`, `$like`, `$in`, comparison operators) onto TypeORM `FindOptions`. See [`docs/features/filterOperators.md`](../features/filterOperators.md).

## Data isolation (row-level ownership)

Declared per entity in `x-documentConfig.restApi → dataIsolation: { field: "ownerId" }`.

Generation produces three pieces:

1. `DataIsolationRegistry.gen.ts` (`src/generators/middlewares/dataIsolationRegistry.generator.ts`) — entity → ownership-field map
2. `DataIsolationContext.ts` middleware — `AsyncLocalStorage` carrying the current user through the request pipeline
3. The TypeORM adapter reads the user ID from that context and injects `{ [field]: userId }` into every query — transparent row-level ownership, no per-controller code

Full guide: [`docs/features/dataIsolation.md`](../features/dataIsolation.md).

## Join whitelist

`src/generators/middlewares/joinWhitelistRegistry.generator.ts` emits a static entity → allowed-joins map consumed by `JoinWhitelistMiddleware.ts`. Populated from `x-documentConfig.restApi.joinWhitelist`; auto-filled by `jsonSchemaForeignKeys.ts` when unset. Controllers with a whitelist get `@Middlewares(JoinWhitelistMiddleware.middleware("<DocName>"))`.

See [`docs/features/joinWhitelist.md`](../features/joinWhitelist.md) and [`docs/ForeignKey.md`](../ForeignKey.md).

## RBAC

`src/generators/middlewares/RBACmiddleware.generator.ts` produces `RoleBaseAccessControl.gen.ts`, enforcing per-document CRUD permissions from the role JSON files. Role sources live in `src/roles/` (user-editable); `roleDefinitions.ts` keeps per-role files present with default permissions.

See [`docs/features/rbac.md`](../features/rbac.md).
