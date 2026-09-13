# Test

```
npm test              # compile, then run every test
npm run test:watch    # vitest in watch mode (no compile step)
npm run test:update   # recompile and rewrite the golden files
npm run test:e2e      # end-to-end contract test of a generated app (slow, needs Docker)
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
| `test/e2e/contract.test.ts` | Boots a real generated app against Postgres and drives it over HTTP |
| `test/helpers/` | Harness: run generation, dump tree, normalize, e2e orchestration |

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

## End-to-end contract test

`npm run test:e2e` is opt-in and deliberately **not** part of `npm test`: it installs
the generated app's own dependency tree and boots a real server against a real
Postgres, so it costs seconds-to-minutes rather than milliseconds.

What it does:

1. Generates an app from a fixed config into `test/.e2e/app/`
2. `npm install` in it — skipped when `node_modules` already exists, so repeat runs
   are fast (first run ~35s, later runs ~6s)
3. `tsoa spec-and-routes` + `tsc` — this alone catches generated code that does not
   compile, e.g. references to types that were never imported
4. Boots a Postgres (Docker container `vex-e2e-pg` on port 55432) unless
   `VEX_E2E_DB_URL` is set, then runs `node dist/server.js` and waits for the
   TypeORM connection
5. Drives it over HTTP and asserts against the emitted `swagger.json`

Assertions: the spec is served and matches the file on disk; every operation the
spec declares is actually routed; register → local login → code → token exchange;
secured operations reject unauthenticated calls; the user is read back and updated,
with the response body checked against the spec's own response schema.

State lives in `test/.e2e/` (gitignored). Deleting it forces a clean reinstall.
The harness strips `npm_config_allow_scripts` from child environments — npm 11
rejects an env-provided `allow-scripts` outright in project-scoped installs.

### Auth contract

Secured operations require **both** credentials — `Authorization: Bearer <token>` and
`X-Auth-Index: <accessTokenIndex>`. Controllers express this as a single
`@Security({ BearerAuth: [], AuthIndex: [] })` decorator, which OpenAPI reads as AND.
Two separate `@Security(...)` decorators would document them as alternatives, which
contradicted the middleware. The suite asserts the spec declaration and that either
credential alone is rejected.

### Compile variants (`compile.test.ts`)

Type-checks a generated app for each config combination, reusing the shared
`node_modules` through a symlink so a variant costs a generation plus `tsc` (~3s):

`rbac-on-auth-on`, `rbac-off-auth-on`, `rbac-on-auth-off`, `rbac-off-auth-off`

This is the cheapest guard against a bug class the golden tests cannot see: generated
code referencing something that does not exist in that configuration. "RBAC off +
auth on" contained three such bugs — an unimported `UserRole` type, an unimported
`@Security` decorator, and a `userRole` relation on `UserWithRelations`. All three are
invisible to text comparison and all three were caught by compiling.

The **Mongoose target is a known gap**, asserted with `it.fails`: it does not
type-check at all today (8 errors with auth off, 11 with it on). See
[`docs/architecture/databaseTargets.md`](../docs/architecture/databaseTargets.md).
When it starts compiling that test turns red, and the variant should move into the
matrix above.

### Normalization of `.vex/meta.json`

`meta.json`'s key order follows the order files happened to be written in — pure
implementation detail. Reordering two `copyDir` calls once rewrote four golden files
while the generated output was byte-identical, so its keys are sorted before
comparison. The golden still pins which files are tracked and their `allowOverwrite`
and version values; it just no longer pins incidental write order.
