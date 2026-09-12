# Test

```
npm test              # compile, then run every test
npm run test:watch    # vitest in watch mode (no compile step)
npm run test:update   # recompile and rewrite the golden files
```

`npm test` compiles first: the golden tests spawn the real `dist/index.js`, so
`dist/` must be current.

## Layout

| Path | Purpose |
|---|---|
| `test/golden.test.ts` | Runs a full generation per scenario, compares to a golden file |
| `test/golden/<scenario>.txt` | Committed expected output — one normalized text document per scenario |
| `test/fixtures/scenarios/<name>/vex.config.json` | One generation config per scenario |
| `test/unit/` | Unit tests for pure generator internals |
| `test/helpers/` | Harness: run generation, dump tree, normalize |

## Golden tests

Each scenario generates into an isolated temp dir and its whole `out/` tree is
serialized into a single normalized text document. One file per scenario keeps a
regression visible as a small hunk rather than a diff across hundreds of files.

Normalization strips only noise: the generator version in header comments is
pinned to `<version>`, absolute temp paths are removed, CRLF is folded. Anything
else is compared exactly — if a golden changes, a real generator behaviour changed.

### Adding a scenario

1. Create `test/fixtures/scenarios/<name>/vex.config.json`.
   Use relative paths (`"./schemas"`, `"./out"`) so the harness can relocate it.
2. Optional: add `jsonSchema/*.json` for fixtures specific to the scenario. Note
   the generator always copies `src/templates/jsonSchema` in as well, so a
   scenario runs the shipped sample schemas plus anything you add.
3. `npm run test:update`
4. Review the new golden file before committing it — it is the contract.

### Debugging a failure

The failure message names the first differing file and line, and keeps the actual
dump next to the temp project:

```
diff <tmp>/actual.golden.txt test/golden/<scenario>.txt
```

Run with `KEEP_TMP=1` to stop the temp dirs being deleted, and `UPDATE_GOLDEN=1`
(equivalently `npm run test:update`) to accept the new output.

### Scenario coverage

| Scenario | Exercises |
|---|---|
| `sql-auth-oauth-rbac` | TypeORM entities, local auth + OAuth providers, 3-role RBAC |
| `sql-noauth` | SQL with auth disabled — no `AuthController`, no cookie-parser |
| `mongo-auth-rbac` | Mongoose models instead of TypeORM entities |
| `sql-noswagger` | `app.enableSwagger: false` — no `SwaggerRouter.gen.ts`, no swagger wiring in `server.ts` |
| `sql-norbac` | `useRBAC` omitted — RBAC fully off: no `RoleBaseAccessControl`, no `_roles/`, no `UserRole` model/controller |
