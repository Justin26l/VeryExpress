# AGENTS.md

Canonical agent guide for this repo. `CLAUDE.md` and `.github/copilot-instructions.md` point here.

## What this is

VeryExpress is a **code generator**. It reads JSON Schema files and writes a complete Express.js REST API (Mongoose or TypeORM, RBAC, OAuth2, Swagger) into `output/`.

Always distinguish the two sides:

| | What | Where |
|---|---|---|
| **The generator** | This repo, TypeScript | `src/` → built to `dist/` |
| **The generated app** | Standalone Express app, own `package.json` | `output/` |

Most of `output/` is gitignored. **Exception:** `output/jsonSchema/` is tracked — it holds the working sample schemas.

## Build / run

```bash
npm run dev      # compile (esbuild → dist/index.js) + run CLI
npm run build    # lint + compile
npm run lint     # eslint --fix on src/**/*.ts
npm run compile  # build only: scripts/build.js + scripts/copyTsTemplates.js
npm start        # run dist/index.js directly
```

Bundled to a single `dist/index.js` (esbuild, platform: node, target: es2016). `scripts/copyTsTemplates.js` then copies `src/templates/` → `dist/templates/`; the runtime reads templates from `__dirname/templates`.

**Editing `src/` changes nothing until you `npm run compile`** — `vex` executes `dist/index.js`.

### Tests

```bash
npm test              # compile, then run every test
npm run test:update   # recompile and rewrite the golden files
npm run test:watch    # vitest in watch mode (no compile step)
npm run test:e2e      # boot a real generated app + Postgres and drive it over HTTP (slow)
```

`test/unit/` covers pure internals. `test/golden.test.ts` runs a full generation per
scenario in an isolated temp dir and compares the whole output tree against a
committed golden file — this is the main regression net for generator and template
changes. `npm test` compiles first because the golden tests spawn `dist/index.js`.

`test/e2e/contract.test.ts` is opt-in (`test:e2e`): it installs the generated app's
own dependencies, boots it against a Docker Postgres and asserts the HTTP contract.
Too slow for `npm test`, but it is the only layer that proves a generated app actually
compiles, starts and serves. See [`test/README.md`](test/README.md).

When a golden changes, decide whether the new output is correct before running
`test:update`.

## Input schemas

Read from `vex.config.json → jsonSchemaDir` (this repo: `./output/jsonSchema`). `src/templates/jsonSchema/` and `src/templates/jsonSchemaRBAC/` hold a fresh sample set, re-copied into `jsonSchemaDir` on every generation run — **edits to `output/jsonSchema/*.json` are overwritten unless you also edit the template**. Working schemas you want kept belong in the template dir.

## Hard rules

- **Never hand-edit `*.gen.ts`.** Regenerated on the next `vex` run. If a generated file genuinely needs a manual change, prefer fixing the generator or template.
- **`x-documentConfig.documentName` must match the JSON filename** — `User.json` → `"documentName": "User"`.
- **Never hand-place files under `sysDir`.** `cleanupStaleFiles()` deletes every file there not written during the current run.
- **`required` in source schemas uses the root array form.** Per-prop `required: true` is normalized into `required: string[]` by the preprocessor — do not write it that way.
- **`src/` is ESM-style TypeScript with `~/*` → `src/*` aliasing.** Use `~/generators/...`, `~/utils/...`, `~/types/...` for intra-repo imports.
- **Only `one-to-one` and `many-to-one` are declared in `x-foreignKey`.** `one-to-many` is derived from the other side and must not be hand-written.
- **RBAC is opt-in.** `utils.generator.isRbacEnabled()` is the single gate for every RBAC code path. Absent `useRBAC`, or `roles: []`, means RBAC off — never "RBAC with zero roles". Never branch on `compilerOptions.useRBAC` directly.
- **Boolean config defaults use `??`, not `||`.** `x || true` swallows an explicit `false`.

## Conventions

| Artifact | Convention | Example |
|---|---|---|
| Generated files | `{DocName}{Type}.gen.ts` | `UserController.gen.ts` |
| Controller class | PascalCase | `UserController` |
| REST route | `documentName.toLowerCase()` | `/user` |
| Template function | camelCase default export beside its generator | `controllerTemplate()` |
| Role class | `Role{Name}` | `RoleAdmin` |

## Code style

- Prefer readability and maintainability.
- Split distinct workflows into functions — no large monolithic blocks.
- Define types. Avoid `any` / `unknown` where possible.
- Name variables, functions, interfaces, classes descriptively.
- Idiomatic TypeScript. Code stays idiomatic even when prose does not.

## Reply style

Smart caveman. Drop articles, filler, pleasantries, hedging. Fragments fine. Keep all technical substance.

- Technical terms stay exact — "polymorphism" stays "polymorphism".
- Code blocks unchanged. Caveman around code, not in code.
- Error messages quoted exact.

## Documentation map

This file covers only what every session needs. Deeper material lives in `docs/`:

| Document | Content |
|---|---|
| [`test/README.md`](test/README.md) | Test layout, golden scenarios, how to update/add |
| [`docs/architecture/generatorPipeline.md`](docs/architecture/generatorPipeline.md) | Pipeline steps, source layout, generator contract, meta tracking, migrations, preprocessors |
| [`docs/architecture/templates.md`](docs/architecture/templates.md) | Static vs function templates, `FUNC{{ }}`, `allowOverwrite` |
| [`docs/architecture/databaseTargets.md`](docs/architecture/databaseTargets.md) | mongo vs sql, repository adapter, data isolation, join whitelist |
| [`docs/architecture/authAndRouting.md`](docs/architecture/authAndRouting.md) | tsoa, auth routes, swagger, RBAC |
| [`docs/vexJsonSchema.md`](docs/vexJsonSchema.md) | Full JSON Schema reference — `x-documentConfig`, `x-foreignKey`, `x-format`, `x-vexData` |
| [`docs/apiUsage.md`](docs/apiUsage.md) | API client guide — pagination, search, response format |
| [`docs/ForeignKey.md`](docs/ForeignKey.md) | FK joins via the API `join` parameter |
| [`docs/developmentNote.md`](docs/developmentNote.md) | Why no ts-node, esbuild/dist working dir, `FUNC{{ }}` intent |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Setup, branch/PR workflow, PR checklist |
| [`docs/features/`](docs/features/) | rbac, dataIsolation, filterOperators, joinWhitelist, auditFields |
| [`docs/appGenerated/auth.md`](docs/appGenerated/auth.md) | JWT rolling keys, OAuth2 providers |
| [`docs/roadMap/`](docs/roadMap/) | Released features and version milestones |
| [`docs/releaseNote/`](docs/releaseNote/) | Per-version release notes |

When you learn something non-obvious that a future session needs every time, add it above. When it is deep or situational, put it in `docs/` and link it here.
