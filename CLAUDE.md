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
