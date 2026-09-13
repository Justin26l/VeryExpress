# Template System

Two kinds of templates. Know which one you are editing — the failure modes differ.

## 1. Static templates (`src/templates/`)

Base files copied verbatim into the generated app. Copied to `dist/templates/` at build time by `scripts/copyTsTemplates.js`; the runtime reads them from `__dirname/templates`.

Copied groups (from `src/index.ts`):

| Template dir | Destination |
|---|---|
| `_controllers/` `_middlewares/` `_roles/` `_routes/` `_services/` `_types/` `_utils/` | `sysDir/<same name>` |
| `root/` | `rootDir` |
| `jsonSchema/` | `jsonSchemaDir` |
| `jsonSchemaRBAC/` | `jsonSchemaDir` (only when `useRBAC` is set) |

Files get a `.ts` → `.gen.ts` rename on copy, except `index.ts`.

**Hand-editing a `.gen.ts` file in `output/` does not survive.** Copies go through the same `writeFile()` as generated code:

- content identical after normalization (header comments stripped) → skipped, edit survives
- content differs → overwritten on the next `vex` run
- `.vex/meta.json` has `files[<relPath>].allowOverwrite: false` → skipped even when different

`allowOverwrite` defaults to `true`. It is per-file and read fresh each run, so flipping it between runs works — but `.vex/meta.json` is gitignored, so the flag resets on a fresh clone.

## 2. Template functions (`*.template.ts`)

Live beside their generator. Return a string built with placeholders.

```ts
content.replace(/{{placeholder}}/g, value)
```

| Syntax | Meaning |
|---|---|
| `{{placeholder}}` | Simple textual substitution |
| `FUNC{{ <code> }}` | Embeds **runnable JS** into the generated file |

### `FUNC{{ }}`

The formatter `src/utils/template.ts → format()` strips the wrapping `'FUNC{{...}}'`
quotes so the inner code is emitted as runnable JavaScript instead of a string
literal. It replaces every block in one pass, including multi-line bodies.

Use it when a function (validator, callback, hook) must exist inside generated output.
The generated file must itself be JS/TS.

**Status: currently unused by any template.** `format()` is applied to three
outputs — `dataIsolationRegistry.generator.ts`, `joinWhitelistRegistry.generator.ts`
and `controller.template.ts` — but no template in `src/` contains a `FUNC{{ }}`
block, so the call is a no-op today. The mechanism is wired up and unit-tested; if
you add the first real block, the golden tests will show the change in output.

See [`test/unit/template.test.ts`](../../test/unit/template.test.ts) for the exact
supported syntax.

## Which to use

| Need | Use |
|---|---|
| Whole file that is mostly fixed boilerplate | static template in `src/templates/` |
| File whose body varies per document/schema | generator + `*.template.ts` |
| Small snippet of fixed boilerplate inside a varied file | inline string in the template function |
| Executable function inside generated output | `FUNC{{ }}` |
