# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run

```bash
npm run dev          # compile (esbuild → dist/index.js) + run CLI
npm run build        # lint + compile
npm run lint         # eslint --fix on src/**/*.ts
npm start            # run dist/index.js directly
```

Build bundles everything into a single `dist/index.js` (esbuild, platform: node, target: es2016). `scripts/copyTsTemplates.js` then copies static templates from `src/templates/` into `dist/templates/` — the runtime reads templates from `__dirname/templates/`.

No test suite. Validate changes by running `npm run dev` and inspecting `output/`.

**Working on this project vs. using it:** this repo is the *generator itself*. Running `vex` reads schema files, runs the generator pipeline, and writes `output/` — a standalone Express app. The output has its own `package.json` and dependencies. Changes to generator source (`src/`) need `npm run compile` before `vex` picks them up.

## Docs

Project documentation lives in `docs/`. Key references:

| Document | Content |
|----------|---------|
| `docs/vexJsonSchema.md` | Full JSON Schema reference — `x-documentConfig`, `x-foreignKey`, `x-format`, `x-vexData` |
| `docs/apiUsage.md` | API client guide — pagination, search, response format |
| `docs/appGenerated/auth.md` | Auth system — JWT rolling keys, OAuth2 providers |
| `docs/features/rbac.md` | Role-based access control — role files, permission model |
| `docs/features/dataIsolation.md` | Row-level ownership — declarative per-entity query scoping |
| `docs/features/filterOperators.md` | Filter query operators — `$and`, `$or`, `$like`, `$in`, comparison |
| `docs/features/joinWhitelist.md` | Join whitelist — restricting relation joins at the API level |
| `docs/ForeignKey.md` | Foreign-key joining via API `join` parameter |
| `docs/roadMap/` | Future plans and version milestones |

## Architecture

VeryExpress is a **code generator** — it reads JSON Schema files and produces a complete Express.js REST API.

```
jsonSchema/*.json  →  preprocess (validate/normalize)  →  generators  →  output/
```

| Directory | Role |
|-----------|------|
| `src/cli.ts` | CLI entry (`vex` command), minimal config parsing, delegates to `generate()` |
| `src/index.ts` | Orchestrator — creates dirs, copies static templates, preprocesses schemas, runs all generators in order |
| `src/generators/` | Async `compile()` functions that generate code files into `output/` |
| `src/templates/` | Static base files copied verbatim (renamed `.ts` → `.gen.ts`) into the generated app |
| `src/preprocess/` | Schema validation, normalization, FK metadata wiring before generation |
| `src/types/types.ts` | Core interfaces: `compilerOptions`, `jsonSchema`, `jsonSchemaPropsItem`, `documentConfig` |
| `src/utils/` | File I/O, logging, JSON-schema helpers, template formatter, config defaults |

### Generation pipeline (in `src/index.ts → generate()`)

1. Validate config, set up directories
2. Copy static templates into `output/src/system/`
3. Preprocess schemas — normalize `required` arrays, validate FK configs, sync role enums
4. For each JSON schema file in parallel: generate TypeScript interface, DB model (Mongoose or TypeORM), and controller
5. Generate join whitelist registry, SQL migrations (if `dbType === "sql"`)
6. Generate routes, server entrypoint, and project settings files (package.json, tsoa.json, env config)

### Generator pattern

Every generator exports an async `compile(options)` that:
1. Extracts/validates data from options
2. Calls a `*Template()` function that returns a string
3. Writes with `utils.common.writeFile()` — it compares normalized content (stripping header comments) and skips if unchanged

### Template system

Two kinds of templates:

- **Static templates** in `src/templates/` — copied as-is to `output/`, with `.ts` → `.gen.ts` renaming (except `index.ts`). Generated files are considered write-once (hand-editable between runs).
- **Template functions** in `*.template.ts` beside their generator — use `{{placeholder}}` syntax replaced via `.replace()`.

`FUNC{{ <code> }}` syntax embeds runnable JS in generated output. The formatter in `src/utils/template.ts` strips the wrapping `'FUNC{{...}}'` quotes so the inner code runs as JavaScript in the generated file.

### Path aliases

`tsconfig.json` maps `~/*` → `src/*`. Imports can use `~/generators/...`, `~/utils/...`, `~/types/...`.

### DB targets

Controlled by `vex.config.json` → `dbType`:
- `"mongo"` — Mongoose models (`src/generators/db/mongooseModel.generator.ts`)
- `"sql"` — TypeORM entities + Knex SQL migrations (`src/generators/db/typeormEntity.generator.ts`, `src/generators/db/sqlMigration.generator.ts`)

### TSOA integration (current branch)

Generates `tsoa.json` in output root so `tsoa` CLI produces routes + OpenAPI spec. Controller decorators use `@Route`, `@Security`, `@Tags`, etc. The authentication middleware at `src/templates/_middlewares/tsoaAuthentication.ts` handles `BearerAuth` and `AuthIndex` security schemes.

### Preprocessing

Three preprocessors run before generation, in `src/preprocess/`:

| File | Role |
|------|------|
| `jsonschemaFormat.ts` | Validate schema structure (`x-documentConfig`, FK config, `x-format` type constraints). Normalize per-prop `required: true` into root `required: string[]`. For SQL target, convert `ObjectId` → `Primary` on `_id`, warn on nested index/FK/vexData. |
| `jsonSchemaForeignKeys.ts` | Wire reverse-relation metadata (`one-to-many` derived from other side's `many-to-one`). Auto-populate `restApi.joinWhitelist` if not set. |
| `roleDefinitions.ts` | For RBAC schemas, ensure per-role JSON files exist with default CRUD permissions for each resource document. |

### Interface generation

Uses `json-schema-to-typescript` to emit TypeScript interfaces from each JSON schema. Then injects FK relation types (`{DocName}Relations`, `{DocName}ApiRelations`, `{DocName}WithRelations`, `{DocName}WithApiRelations`) and generates enums for fields with `enum` arrays.

### Repository adapter pattern

Controllers never touch ORM/ODM directly. They call `VexDb.getRepository(Entity)` which returns a `VexRepository<T>` (an interface in `src/templates/_types/vex/`). Two adapters implement it:

| Adapter | DB target | Notes |
|---------|-----------|-------|
| `TypeOrmRepositoryAdapter` | SQL | Maps `$and`/`$or`/`$like`/`$gt` etc. → TypeORM `FindOptions`. Applies data isolation ownership filter if configured. |
| `MongooseRepositoryAdapter` | Mongo | Thin wrapper. Many features (join, select, pagination, count) are TODO — Mongoose support is less mature. |

The `VexRepository<T>` interface defines: `find`, `count`, `findOne`, `findOneWhere`, `create`, `replace`, `update`, `delete`, `deleteWhere`.

### Data isolation

Entities can declare `dataIsolation: { field: "ownerId" }` in `x-documentConfig.restApi`. This generates:

1. A `DataIsolationRegistry.gen.ts` mapping entity → ownership field
2. The `DataIsolationContext` middleware (AsyncLocalStorage) injected into the request pipeline
3. The TypeORM adapter reads the current user ID from context and injects `{ [field]: userId }` into every query — transparent row-level ownership

The RBAC middleware generator (`src/generators/middlewares/RBACmiddleware.generator.ts`) produces `RoleBaseAccessControl.gen.ts` which enforces per-document CRUD permissions based on role JSON files.

### Routing & auth generation

The route generator (`src/generators/routes/`) produces three kinds of routes:

- **API routes** — generated by tsoa from controller decorators (`@Route`, `@Get`, `@Post`, etc.)
- **Auth routes** — `AuthController.gen.ts` (tsoa-based: login, register, token refresh) and `AuthRouter.gen.ts` (express OAuth passport redirect flows)
- **Swagger UI** — `SwaggerRouter.gen.ts` serving OpenAPI spec + Swagger UI

### Migration system

`src/migration.ts` runs pending migrations before generation. Each migration in `src/migrations/<version>.ts` exports `run(jsonSchemaDir: string): void`. Versions are compared semver-wise against `lastGeneratedVersion` in `.vex/meta.json`. To add a migration, import it in `src/migration.ts` and push to the `migrations` array.

### Project settings generation

`src/generators/projectSettings/` produces non-code files: `package.json`, `.env`, tsoa config, build scripts (for the *generated* app, not this repo).

### Meta tracking

`.vex/meta.json` in the generated project root tracks `lastGeneratedVersion` and per-file `allowOverwrite` flags. On version major/minor change, `sysDir` is wiped for clean regeneration. The migration system (`src/migration.ts`) runs pending version-bumped migrations before generation.

## JSON Schema extensions (custom `x-*` properties)

- `x-documentConfig` — REST methods, document name (must match filename)
- `x-foreignKey` — relationships, only `one-to-one` and `many-to-one` on owning side; `one-to-many` auto-derived
- `x-vexData: "role"` — marks field for RBAC
- `x-format: "ObjectId"` — MongoDB ObjectId, auto-converted to `"Primary"` for SQL target
- Full reference: `docs/vexJsonSchema.md`

## Key conventions

- Generated files: `{DocName}{Type}.gen.ts` — never hand-edit (regenerated on next `vex` run)
- Controller class: PascalCase (e.g. `UserController`)
- REST endpoint: lowercase documentName (e.g. `/user`)
- `required` fields: preprocessor normalizes `required: true` on individual props into root-level `required: string[]`, but source schemas use the array form
- `interface.fkProps` on each schema holds reverse-relation metadata populated during preprocessing

## Style

Caveman speak — drop articles, filler, pleasantries. Short, direct, technical. Code itself remains idiomatic TypeScript.
