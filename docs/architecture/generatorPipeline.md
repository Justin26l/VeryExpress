# Generator Pipeline

VeryExpress is a **code generator**. It reads JSON Schema files and writes a complete Express.js REST API into `output/`.

```
jsonSchema/*.json  →  preprocess (validate/normalize)  →  generators  →  output/
```

Two distinct things live in this repo — do not confuse them:

| | What it is | Where |
|---|---|---|
| **The generator** | This repo. TypeScript source in `src/`. | `src/`, built to `dist/` |
| **The generated app** | A standalone Express app with its own `package.json`. | `output/` |

Editing `src/` does nothing until `npm run compile` runs — `vex` executes `dist/index.js`.

## Source layout

| Path | Role |
|---|---|
| `src/cli.ts` | CLI entry (`vex`). Parses config, runs migrations, delegates to `generate()` |
| `src/index.ts` | Orchestrator — `generate()` runs the whole pipeline |
| `src/generators/` | Async `compile()` functions that write code files into `output/` |
| `src/templates/` | Static base files copied verbatim into the generated app |
| `src/preprocess/` | Schema validation, normalization, FK metadata wiring |
| `src/migrations/` | Version-bumped schema migrations, run before generation |
| `src/migration.ts` | Migration index — decides which migrations are pending |
| `src/types/types.ts` | Core interfaces: `compilerOptions`, `jsonSchema`, `jsonSchemaPropsItem`, `documentConfig` |
| `src/utils/` | File I/O, meta tracking, logging, JSON-schema helpers, template formatter, config defaults |

## Pipeline steps (`src/index.ts → generate()`)

1. Validate config (`utils.configChecker.checkConfigValid`) and create directories
2. Copy static templates into the system dir (`output/src/system/`) and sample schemas into `jsonSchemaDir`
3. Generate `userSchema`; run `formatJsonSchemaRoleDefinition` to sync RBAC role files
4. Read + format every `*.json` in `jsonSchemaDir`; non-JSON files warned and skipped. A failing schema logs an error and is dropped, generation continues
5. `applyFkMetadata(documents)` — wire reverse relations across all schemas at once
6. Generate roles + permissions
7. Per document (in parallel): TypeScript interface, DB model, controller
8. Generate join-whitelist registry and data-isolation registry (static maps in `_middlewares/`)
9. Generate routes, server entrypoint, project settings
10. `saveVexMeta()` then `cleanupStaleFiles()`

## Generated directory map

All under `vex.config.json → sysDir` (default `output/src/system`):

`_controllers/` `_middlewares/` `_models/` `_roles/` `_routes/` `_services/` `_types/` `_utils/`

Plus `src/roles/` (user-editable role sources) and the output root files.

## Generator contract

Every generator exports an async `compile(options)` that:

1. Validates / extracts data from `options`
2. Calls a `*Template()` function that returns a string
3. Writes via `utils.common.writeFile()`

`writeFile()` compares normalized content (header comments stripped) and **skips the write when unchanged**. It also records the file in the run's written-files set.

## `cleanupStaleFiles()` — sysDir is reconciled every run

After generation, every file under `sysDir` **not written during the current run is deleted**. Consequences:

- Never hand-place a file under `sysDir` — it disappears on the next `vex` run.
- Renaming a generator output removes the old file automatically; no manual cleanup needed.

## Meta tracking (`.vex/meta.json`)

Written to `<rootDir>/.vex/meta.json` (gitignored). Holds:

- `lastGeneratedVersion` — the package version that last completed a full generation
- `files[<relPath>].allowOverwrite` — per-file override, **default `true`**

When `allowOverwrite` is `false` for a file, `writeFile()` skips it if it already exists — the escape hatch for keeping hand-edits in a generated file. The value is read per-file on each run and rewritten immediately after a write, so edits between runs take effect.

## Migrations

`src/migration.ts` exports `runMigrations()`, called by `src/cli.ts` **before** generation. It reads `lastGeneratedVersion` from `.vex/meta.json` and runs every migration whose version is newer.

Each migration is `src/migrations/<version>.ts` exporting:

```ts
export function run(jsonSchemaDir: string): void
```

To add one: create the file, then add an entry to the `migrations` array in `src/migration.ts` with `version`, an explicit semver-sortable `order` tuple `[major, minor, patch, preIndex]`, and `run`. Version comparison is numeric-tuple — pre-release sorts below release.

Fresh project (no `meta.json`) → all migrations run.

## JSON Schema extensions

Custom `x-*` properties drive generation. Full reference: [`docs/vexJsonSchema.md`](../vexJsonSchema.md).

| Property | Purpose |
|---|---|
| `x-documentConfig` | `documentName` (must match filename), `restApi.methods`, `restApi.joinWhitelist`, `restApi.noRelations`, `restApi.dataIsolation`, `uniqueIndex`, `keyPrefix` |
| `x-foreignKey` | Relations. Only `one-to-one` / `many-to-one` declared on the owning side; `one-to-many` is auto-derived |
| `x-vexData: "role"` | Marks the field used for RBAC |
| `x-format: "ObjectId"` | MongoDB ObjectId; converted to `"Primary"` for the SQL target |

## Preprocessors (`src/preprocess/`)

| File | Role |
|---|---|
| `jsonschemaFormat.ts` | Validate schema structure (`x-documentConfig`, FK config, `x-format` type constraints). Normalize per-prop `required: true` into root `required: string[]`. For SQL target: convert `ObjectId` → `Primary` on `_id`, warn on nested index/FK/vexData |
| `jsonSchemaForeignKeys.ts` | Wire reverse-relation metadata (`one-to-many` derived from the other side's `many-to-one`). Auto-populate `restApi.joinWhitelist` when unset |
| `roleDefinitions.ts` | Ensure per-role JSON files exist with default CRUD permissions for each resource document |

## Interface generation

Uses `json-schema-to-typescript` to emit a TypeScript interface per schema, then injects FK relation types — `{DocName}Relations`, `{DocName}ApiRelations`, `{DocName}WithRelations`, `{DocName}WithApiRelations` — and generates enums for fields with `enum` arrays. `interface.fkProps` on each schema holds reverse-relation metadata populated during preprocessing.

## Project settings generation

`src/generators/projectSettings/` produces non-code files **for the generated app**: `package.json`, `.env`, `tsoa.json`, build scripts, `userSchema`. Not for this repo.

## CLI config normalization (`src/cli.ts`)

The CLI rewrites `vex.config.json` on every run, filling in defaults before
`generate()` sees the config. Two consequences are worth knowing, both verified
by running the CLI:

| Setting | Behaviour |
|---|---|
| `app.enableSwagger` | `config.app.enableSwagger = config.app.enableSwagger \|\| true` — `false \|\| true` is `true`, so **swagger cannot be turned off** through config despite `routeGen` honouring the flag |
| `useRBAC` | `config.useRBAC = config.useRBAC \|\| { roles: [], default: "user" }` — **always set**, so omitting the key yields an empty role list rather than disabling RBAC |

### Known issue: empty `useRBAC.roles` aborts generation

`src/preprocess/roleDefinitions.ts` syncs the `UserRole.role` enum from
`useRBAC.roles`. With an empty list the enum is `[]`, and
`json-schema-to-typescript` renders an empty enum as `role: ()`, which is not
valid TypeScript:

```
SyntaxError: '=>' expected. (5:1)
  3 | userId: string
  4 | role: ()
> 5 | }
```

Because the CLI always injects `useRBAC`, **a `vex.config.json` that simply omits
`useRBAC` fails to generate.** Workaround: always declare at least one role.

## Conventions

- Generated files: `{DocName}{Type}.gen.ts` — never hand-edit
- Controller class: PascalCase (`UserController`)
- `@Route()` path: `documentName.toLowerCase()` (`UserController` → `/user`)
- `@Tags()`: the raw `documentName`
- REST endpoint casing in `x-documentConfig.restApi` follows the lowercase route
- `required` fields: source schemas use the root-level array form; per-prop `required: true` is normalized into it
