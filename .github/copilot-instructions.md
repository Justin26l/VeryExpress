# Project Guidelines — VeryExpress

VeryExpress is a **code generator**: JSON Schema files in, complete Express.js REST API out.

Full agent guide: [`AGENTS.md`](../AGENTS.md). Architecture deep-dives: [`docs/architecture/`](../docs/architecture/).

## Build and test

```bash
npm run dev      # compile (esbuild → dist/index.js) + run CLI
npm run build    # lint + compile
npm run lint     # eslint --fix on src/**/*.ts
npm run compile  # build only — required before `vex` picks up src/ changes
npm test         # compile, then run all tests
```

`test/unit/` covers pure internals. `test/golden.test.ts` runs a full generation per scenario and compares the output tree against a committed golden file — the main regression net. `npm run test:update` rewrites goldens; check the diff is intended first. See [test/README.md](../test/README.md).

## Hard rules

- **Never hand-edit `*.gen.ts`** — regenerated on the next `vex` run. Fix the generator or template instead.
- **`x-documentConfig.documentName` must match the JSON filename** — `User.json` → `"documentName": "User"`.
- **Never hand-place files under `sysDir`** — `cleanupStaleFiles()` deletes anything there not written during the current run.
- **`required` in source schemas uses the root array form** — per-prop `required: true` is normalized into `required: string[]` server-side.
- **Only `one-to-one` / `many-to-one` are declared in `x-foreignKey`** — `one-to-many` is derived from the other side.

## Conventions

| Artifact | Convention | Example |
|---|---|---|
| Generated files | `{DocName}{Type}.gen.ts` | `UserController.gen.ts` |
| Controller class | PascalCase | `UserController` |
| REST route | `documentName.toLowerCase()` | `/user` |
| Template function | camelCase default export beside its generator | `controllerTemplate()` |

`tsconfig.json` maps `~/*` → `src/*`. Use `~/generators/...` style imports.

## JSON Schema extensions

Custom `x-*` properties drive generation — see [docs/vexJsonSchema.md](../docs/vexJsonSchema.md):

- `x-documentConfig` — REST methods, document name, `restApi.joinWhitelist`, `restApi.dataIsolation`
- `x-foreignKey` — relationships ([docs/ForeignKey.md](../docs/ForeignKey.md))
- `x-vexData: "role"` — marks role field for RBAC
- `x-format: "ObjectId"` — MongoDB ObjectId handling

## Code style

- Prefer readability and maintainability.
- Split distinct workflows into functions — no large monolithic blocks.
- Define types. Avoid `any` / `unknown` where possible.
- Name variables, functions, interfaces, classes descriptively.

## Reply style

Smart caveman. Cut articles, filler, pleasantries. Keep all technical substance.

- Technical terms stay exact — "polymorphism" stays "polymorphism".
- Code blocks unchanged. Caveman around code, not in code.
- Error messages quoted exact.
