# Project Guidelines — VeryExpress

VeryExpress is a **code generator** that reads JSON Schema files and produces a complete Express.js REST API (with Mongoose, RBAC, OAuth2, Swagger). The CLI entry is `src/cli.ts`; the orchestrator is `src/index.ts` → `generate()`.

## Architecture

```
jsonSchema/*.json  →  preprocess  →  generators  →  templates  →  output/
```

| Directory | Role |
|-----------|------|
| `src/generators/` | Async `compile()` functions that call templates and write files |
| `src/templates/` | Static base files copied verbatim (with `.gen.ts` suffix) to output |
| `src/preprocess/` | Schema validation & normalisation before generation |
| `src/types/types.ts` | Core interfaces: `compilerOptions`, `jsonSchema`, `jsonSchemaPropsItem` |
| `src/utils/` | File I/O, logging, JSON-schema helpers, template formatter |
| `output/` | Generated Express app — **do not hand-edit `*.gen.ts` files** |

## Build and Test

```bash
npm run dev          # compile (esbuild → dist/index.js) + run CLI
npm run build        # lint + compile (production)
npm run lint         # eslint --fix
```

- Build bundles everything into a single `dist/index.js` via esbuild (platform: node, target: es2016).
- `scripts/copyTsTemplates.js` copies static templates into `output/` after compilation.
- No test suite exists yet; validate changes by running `npm run dev` and inspecting `output/`.

## Conventions

### Generator pattern

Every generator exports an async `compile(options)` that:
1. Validates / extracts data from options
2. Calls a `*Template()` function returning a string
3. Writes the result with `utils.common.writeFile()`

### Template pattern

- Template functions live in `*.template.ts` beside their generator.
- Use `{{placeholder}}` syntax replaced via `.replace(/{{placeholder}}/g, value)`.
- `FUNC{{ <code> }}` embeds runnable JS in generated output (processed by `utils/template.ts → format()`).

### Naming

| Artifact | Convention | Example |
|----------|-----------|---------|
| Generated files | `{DocName}{Type}.gen.ts` | `UserController.gen.ts` |
| Controller class | PascalCase | `UserController` |
| REST endpoint | lowercase `documentName` | `/user`, `/userContact` |
| Template function | camelCase default export | `controllerTemplate()` |
| Role class | `Role{Name}` | `RoleAdmin` |

### JSON Schema extensions

Custom `x-*` properties drive generation — see [docs/vexJsonSchema.md](../docs/vexJsonSchema.md):

- `x-documentConfig` — REST methods, document name
- `x-foreignKey` / `x-foreignValue` — relationships ([docs/ForeignKey.md](../docs/ForeignKey.md))
- `x-vexData: "role"` — marks role field for RBAC
- `x-format: "ObjectId"` — MongoDB ObjectId handling

### Path aliases

`tsconfig.json` maps `~/*` → `src/*`. Use `~/generators/...` style imports.

## Key docs (link, don't duplicate)

- [docs/vexJsonSchema.md](../docs/vexJsonSchema.md) — full schema definition guide
- [docs/ForeignKey.md](../docs/ForeignKey.md) — foreign-key joins and `_join`/`_select` params
- [docs/appGenerated/auth.md](../docs/appGenerated/auth.md) — JWT rolling keys, OAuth2 setup
- [docs/developmentNote.md](../docs/developmentNote.md) — dev conventions, `FUNC{{ }}` syntax
- [docs/roadMap/](../docs/roadMap/) — released features and upcoming plans

## Pitfalls

- **`output/` is regenerated** — never edit `*.gen.ts` files by hand; changes will be overwritten on next `vex` run.
- **Schema ↔ filename mismatch** — `x-documentConfig.documentName` must match the JSON schema filename (e.g. `User.json` → `"documentName": "User"`).
- **`required` field format** — the preprocessor normalises `required: true` on individual properties into a root-level `required: string[]`, but source schemas should use the array form.
- **No test runner** — confirm changes by running `npm run dev` and inspecting `output/`.


## Core Rule

Respond like smart caveman. Cut articles, filler, pleasantries. Keep all technical substance.

## Grammar

- Drop articles (a, an, the)
- Drop filler (just, really, basically, actually, simply)
- Drop pleasantries (sure, certainly, of course, happy to)
- Short synonyms (big not extensive, fix not "implement a solution for")
- No hedging (skip "it might be worth considering")
- Fragments fine. No need full sentence
- Technical terms stay exact. "Polymorphism" stays "polymorphism"
- Code blocks unchanged. Caveman speak around code, not in code
- Error messages quoted exact. Caveman only for explanation

## Code Style
- always consider readability and maintainability.
- actively split different workflow's code into functions instead of large monolithic blocks.
- define types, avoid use `any` or `unknown` as possible.
- name variables, functions, interface, classes descriptively. 
