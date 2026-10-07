# Implementation plan — vex-side account deletion (tombstone)

Scope: the identity domain only. Business rows, uploaded objects, third-party identities (Firebase,
etc.) and legal copy belong to the application.

Decisions:

| ID | Requirement | Source |
|---|---|---|
| R1 | `User` is **soft-deleted** — row survives, `_id` stays FK-resolvable | requirement |
| R2 | `UserAuthProfiles` / `UserRole` / `Session` are **hard-deleted** | requirement |
| R3 | Delete-account is an **API** | requirement |
| R4 | `/delete_account` **HTML page** | requirement |
| R5 | Gate in `vex.config.json`, **default enabled** | requirement |
| R6 | Self-only, idempotent, structured result | requirement |
| R7 | Business domain, object storage, Firebase, legal pages | **out of scope** — the application |
| R8 | ~~Grace period~~ **WITHDRAWN** | superseded |
| R9 | Deleting logs the client out; **auth must re-check the token's user against the soft-delete state** | requirement |

Revisions applied after review:

- Soft delete is declared **on the property**: `"x-vexData": "softDelete"` on a boolean field
  (e.g. `User.deleted`). No `x-documentConfig.softDelete`, no `deletedAt`, no `deletedBy` — the
  existing `updatedAt` / `updatedBy` audit fields carry the when / who.
- Tombstone = **`deleted: true`**, nothing else. Adapter-layer filtering is controlled by the global
  `app.showSoftDeleted` switch (unset → tombstones filtered out; `true` → filtering disabled).
  **Decided: keep the global switch** (§1.2, §10.2).
- **No `deleteAccountPlaceholder` config** — the tombstone label is the constant `"Deleted user"`.
- **R8 withdrawn.** A shutdown/undo window keyed on the client's token was rejected: the moment the
  user logs out (or the app clears storage) the "grace" is already destroyed, so the window is not a
  real guarantee. Deletion is therefore **single-phase and immediate** (§4), and the residual risk R8
  existed to patch — a still-valid access token after deletion — is handled head-on by an
  **identity state check on the authenticated request path** (§3).

---

## 1. Config (R5)

### 1.1 Feature gate — `auth.deleteAccount`, default `true`

```json
"auth": {
    "localAuth": true,
    "deleteAccount": true
}
```

Rules:

- Boolean read with `??`, never `||` (hard rule — `x || true` swallows an explicit `false`).
- The feature also requires auth to be on. Single gate, mirroring `isRbacEnabled`:

```ts
// src/utils/generator.ts
export function isAccountDeletionEnabled(compilerOptions: types.compilerOptions): boolean {
    return isAuthEnabled(compilerOptions) && (compilerOptions.auth.deleteAccount ?? true);
}
```

- Add `deleteAccount: true` to `defaultCompilerOptions.auth`; `types.compilerOptions.auth.deleteAccount?: boolean`.
- No other knob: the tombstone label is the literal `"Deleted user"`.

### 1.2 Adapter filter — `app.showSoftDeleted`, unset = `false`

```json
"app": {
    "showSoftDeleted": false
}
```

- Unset means "hide soft-deleted rows" — the safe default, no config change required for existing projects.
- `true` disables the adapter-layer filter entirely (tombstone rows become visible/queryable like any
  other row). It is an **app-wide** switch, not a request-level one: it is baked into the generated
  registry, so no HTTP client can turn it on.
- Add `showSoftDeleted?: boolean` to `types.compilerOptions.app`; resolve with `?? false`; add
  `showSoftDeleted: false` to `defaultCompilerOptions.app` for discoverability.
- **Decided (review): keep the global switch.** Per-controller / per-table granularity was rejected as
  the wrong layer — a `Filter`-level flag is client-forgeable, and a per-controller generator config
  does not constrain an application's hand-written controllers. See §10.2.
- Two mitigations are part of the work, because the switch is intentionally a big red lever:
  - **Loud at generation time**: `isShowSoftDeleted()` emits `log.warn` listing every entity that
    declares a marker, so an enabled switch shows up in every generation log instead of being a
    silent toggle. The generated registry repeats it as a comment above `showSoftDeleted`.
  - **Closed for clients, always**: the value is a generation-time constant. `Filter<T>` never gains a
    soft-delete key, so no request body can flip it per call — the only way in is editing
    `vex.config.json` and regenerating.
- Note: with the filter off, a tombstone row becomes writable through the ordinary CRUD path again.
  Acceptable for an app that deliberately wants tombstones addressable; it is the one behavior the
  switch costs.

Touched: `src/types/types.ts`, `src/utils/generator.ts`.

---

## 2. Soft delete as a generator primitive (R1)

The tombstone needs three framework-level things a hand-written controller cannot do safely: the
marker must not be client-writable, it must survive a PATCH, and the tombstone must stop being
readable as a live account by the auth flows. So soft delete is a first-class, opt-in schema
feature — off for every project that declares no `x-vexData: "softDelete"` field (zero behavior change).

### 2.1 Schema declaration — a property marker

```jsonc
// src/templates/jsonSchema/User.json
"properties": {
    ...
    "deleted": {
        "type": "boolean",
        "default": false,
        "x-vexData": "softDelete",
        "description": "Soft-delete marker. Framework-managed; never client-writable."
    },
    ...
},
"required": [ "name", "active", "deleted" ]
```

- `xVexDataType` gains `SoftDelete = "softDelete"`; the existing `checkVexDataValues()` validator in
  `src/preprocess/auditFields.ts` already rejects unknown `x-vexData` values, so a typo fails loud.
- New validation, in the same cross-document pass as `validateAuditFields`:
  - at most **one** `x-vexData: "softDelete"` field per document (mirrors the single-`userId` rule,
    but scoped per document rather than globally);
  - the field must be `"type": "boolean"`;
  - it must be declared `default: false` and listed in `required`, which makes the generated SQL
    column `boolean NOT NULL DEFAULT false`. This matters for the filter term below: `NOT (deleted = true)`
    excludes NULL rows, so a nullable column would make every pre-existing row vanish after migration.
- **No new audit columns.** `updatedAt` / `updatedBy` (declared with the existing reserved `default`
  keywords) answer "when / by whom the tombstone was written" through the normal update-phase path.

**Propagation is automatic.** `userSchema.generator.compile()` merges every template `User.json`
property key that is missing from the project's `User.json` — since the marker lives on the property
(not in `x-documentConfig`), `deleted` reaches existing projects with no hand edit.

### 2.2 Client cannot write the marker

Extend `collectRequestManagedFields()` (`src/preprocess/auditFields.ts`) to also omit the declared
soft-delete field. `User` already emits `PayloadUser` (it has reserved audit defaults), so the
generated `PATCH /api/user/{id}` and `POST /api/user` bodies stop advertising / accepting `deleted`
for free — a client cannot soft-delete, resurrect, or pre-tombstone an account through the CRUD API.

### 2.3 Query semantics — hide tombstones from the entity's own queries

When `app.showSoftDeleted` is not `true`, every repository read adds the entity's soft-delete term:
`{ deleted: Not(true) }` (TypeORM) / `{ deleted: { $ne: true } }` (Mongoose). Both are deliberate
about the declared column shape — SQL needs `NOT NULL DEFAULT false` (§2.1), Mongo's `$ne: true`
also tolerates documents written before the field existed.

- Applied inside the adapters' filter composition (`mergeFilter`), so it covers
  `find` / `findOne` / `findOneWhere` / `count` / `update` / `replace` / `delete` / `deleteWhere`
  with no call-site changes. A tombstoned user's live access token therefore cannot PATCH itself back
  to life — the write matches zero rows and the controller 404s.
- **Not** applied to TypeORM `relations:` loading, so `ChatMessage.senderId` → `User` still resolves
  the tombstone and renders "Deleted user" . That is precisely why the marker is a plain
  `@Column` and **not** `@DeleteDateColumn` — the soft-delete decorator nulls relation loads and would
  break the retained conversations.
- This is also what makes the token check in §3 cheap to express: the tombstone is simply not there.

### 2.4 Repository surface

```ts
// src/templates/_types/vex/VexRepository.ts
softDelete(id: string | undefined, data?: Partial<T>): Promise<T | null>;
findOneWithDeleted(filter: Filter<T>, join?: Join, select?: Select): Promise<T | null>;
```

- `softDelete` runs the normal update-phase field machinery (`updatedAt` / `updatedBy` are stamped,
  caller values for framework-owned fields are stripped) and then writes `{ [marker]: true, ...data }`.
  `data` carries the app-level redaction (§4) — the adapter stays generic.
- `findOneWithDeleted` is the framework-internal read that skips **only** the soft-delete term and
  keeps the ownership (`dataIsolation`) filter. It exists for the deletion service's idempotency
  probe.
- Neither is expressible through `Filter<T>`: `Filter` is the shape of every HTTP `filter` body, so a
  filter-level escape hatch would be a client-side bypass of soft delete.

### 2.5 Registry + adapter work

No new registry file: extend the existing `VexFieldRegistry.gen.ts` (both adapters already import it).
`src/generators/middlewares/vexFieldRegistry.generator.ts` additionally scans `allSchemas` for the
marker and emits:

```ts
/** Entity class name → the field that carries the soft-delete marker. */
export const entitySoftDeleteFields: Record<string, string> = {
    "UserEntity": "deleted",
};

// WARNING: app.showSoftDeleted is on — soft-deleted rows are visible to every API query.
export const showSoftDeleted = false;
```

Adapter changes (`TypeOrmRepositoryAdapter`, `MongooseRepositoryAdapter`): `softDelete`,
`findOneWithDeleted`, and the `mergeFilter` term. Mongoose adapter is TODO-grade today; implement the
same semantics there for parity and keep the golden scenario honest.

Touched: `VexRepository.ts`, both adapters, `vexFieldRegistry.generator.ts`, `auditFields.ts`,
`types.ts` (`xVexDataType.SoftDelete`), template `User.json`.

---

## 3. Identity state check on the authenticated path (R9)

`Authentication.middleware` today verifies the JWT signature and nothing else, so a deleted user's
unexpired access token (default `1h`) keeps passing every authenticated request. R9 closes exactly
that gap: the token's user id is re-checked against the soft-delete state.

### 3.1 Generated guard

New generated file `src/system/_services/auth/AccountStateGuard.gen.ts`
(generator `src/generators/services/accountStateGuard.generator.ts`, written on every run because
`cleanupStaleFiles()` deletes anything in `sysDir` not written by the current run).

Emitted when the document holding `x-vexData: "userId"` also declares a soft-delete marker — i.e.
exactly when the check can mean something. The marker's emitted field name comes from the registry
(`entitySoftDeleteFields`):

```ts
import { userIdOfToken } from "../../_middlewares/UserContext.gen";
import { UserEntity } from "../../_models/UserModel.gen";
import VexDb from "../VexDb.gen";
import { Filter } from "../../_types/vex";

/**
 * Whether the identity carried by a verified token still maps to a live account.
 *
 * Reads the marker field off the identity row directly: the answer must depend on the marker
 * value alone, never on `app.showSoftDeleted`, which governs adapter *visibility* — an ordinary
 * repository read answers "not deleted" whenever that switch is on.
 */
export async function isActiveIdentity(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;
    const row = await VexDb.getRepository(UserEntity)
        .findOneWithDeleted({ _id: userId } as Filter<UserEntity>, undefined, ["_id", "deleted"]);
    return row !== null && (row as { deleted?: boolean }).deleted !== true;
}
```

Two details that make this correct:

- `findOneWithDeleted` (§2.4) skips the adapter's soft-delete term, so the row is found whether or
  not `showSoftDeleted` is on. Inside the repository (not a raw query) so the ownership filter still
  applies.
- `select: ["_id", "deleted"]` keeps it one narrow, indexed read; the marker projection also makes
  the TypeORM entity partial-typed, hence the cast.
- `row.deleted !== true` (not `!row.deleted`) so a legacy row created before the column existed —
  `deleted` undefined — still counts as live, matching the Mongo-friendly `$ne: true` semantics.

Otherwise the same file is emitted as a no-op, so the import in §3.2 always resolves and
soft-delete-free projects pay nothing:

```ts
export async function isActiveIdentity(_userId: string | undefined): Promise<boolean> { return true; }
```

### 3.2 Middleware wiring

`src/templates/_middlewares/Authentication.ts`:

- Keep the exported `middleware` function **synchronous**. Both call sites are express chains —
  `@Middlewares(Authentication.middleware)` (spread as a plain RequestHandler in the generated
  `tsoa_routes.ts`) and `this.router.use(Authentication.middleware)` in `routes.template.ts` where
  auth is on. Express 4 does not catch a rejected promise, so an `async` middleware would turn every
  401 into an unhandled rejection.
- Restructure as: sync `middleware` → private `async handle()` → `.catch(err => next(toVexErr(err)))`.
  Failures then reach `VexSystem.responseHandler` on both call paths, which is the existing behavior.
- Add the check after verification, before entering the request context:

```ts
const tokenData = this.JWTService.verifyToken(token, accessTokenIndex);
if (!(await isActiveIdentity(userIdOfToken(tokenData)))) {
    throw new VexResErr(401, undefined, "Account is not active");
}
req.user = tokenData;
UserContext.run(tokenData, () => next());
```

### 3.3 What this does and does not cover

| Path | Covered by |
|---|---|
| access-token requests (every controller) | **§3.1/§3.2 guard** — new |
| `POST /api/auth/refresh` | already fails: `findOne({_id})` is soft-filtered → 404 |
| `POST /api/auth/token` (OAuth exchange) | already fails: same lookup |
| `POST /api/auth/local` (email login) | already fails: `email` is wiped to NULL |
| OAuth callback | already fails: user lookups are soft-filtered, and `email` is NULL so no re-bind |
| client state | `/delete_account` clears the tokens (§6); credentials are gone server-side |

Cost: one narrow indexed read of the identity row per authenticated request, only in projects that
declare a soft-delete marker on the identity document. No cache in this plan (see §10.1).

Independence from `app.showSoftDeleted`: the guard reads the marker value, so turning the adapter
filter off does **not** disable it (§10.2).

Touched: `src/templates/_middlewares/Authentication.ts`, `src/generators/services/accountStateGuard.generator.ts` (new), `src/index.ts`.

---

## 4. Delete flow (R2, R6)

One generated service, `src/system/_services/account/AccountDeletionService.gen.ts`
(generator `src/generators/services/accountDeletion.generator.ts`). Why a service and not just a
controller method: the intended order puts vex's identity erasure at step 4 of a flow the application
must drive (business tables → stored objects → identity). Same process, so the reusable unit is an
importable service.

`deleteSelf()` — single phase, immediate and irreversible:

1. `userId = UserContext.userId`; no identity → `VexResErr(401)`. **No id in path or body, ever.**
2. Idempotency probe: `userRepo.findOneWithDeleted({ _id: userId })`; not found → `VexResErr(404)`;
   `deleted === true` → return `{ alreadyDeleted: true, ... }` without writing.
3. Count then hard-delete credentials, in this order:
   - `userAuthProfilesRepo` — `count({userId})` then `deleteWhere({userId})`;
   - `userRoleRepo` (RBAC only) — same;
   - `sessionRepo` — same.
   Any failure aborts **before** the tombstone with 500 + the partial counts, so the caller can retry
   while the account is still intact.
4. Tombstone last: `userRepo.softDelete(userId, TOMBSTONE)`.

```ts
const TOMBSTONE: Partial<User> = {
    name: "Deleted user",               // required column -> placeholder, not null
    email: null as unknown as string,   // nullable -> NULL, not ""
    locale: null as unknown as string,
    profileErrors: null as unknown as string,
    active: false,
};
```

> `email` MUST be `NULL`, not `""`. `User.json` declares `uniqueIndex: [["email"]]`; the second
> deletion would collide on `""`. Postgres allows unlimited `NULL`s in a unique index. It is also
> what lets the same email register a fresh account immediately .

Ordering rationale: credentials first, tombstone last. Tombstoning first would leave OAuth login by
`UserAuthProfiles.provider` / `oauthId` resolvable, i.e. a deleted account could still log into its
own tombstone. Doing the marker last also means a mid-flight failure leaves a still-live account the
caller can delete again.

```ts
export interface deleteAccountResponse {
    userId: string;
    alreadyDeleted: boolean;
    tombstonedAt: string;   // the row's updatedAt, stamped by the soft-delete write
    deleted: { authProfiles: number; userRoles: number; sessions: number };
}
```

**Firebase is not vex's to delete** — vex has no Firebase dependency. See §9.4.

---

## 5. API endpoint (R3) — where to put it

**Recommendation: `POST /api/auth/delete-account` in the generated `AuthController`** (`@Route("auth")`).

```ts
@Post("delete-account")
@Middlewares(Authentication.middleware)
@Security({ BearerAuth: [], AuthIndex: [] })
async deleteAccount(): Promise<VexResponse<deleteAccountResponse>> {
    const result = await this.accountDeletionService.deleteSelf();
    throw new VexResOk(200, { result });
}
```

Why `AuthController`:

- The identity domain, and the only generated controller that already injects the
  `User` / `UserAuthProfiles` / `UserRole` / `Session` repositories.
- Same credential contract as the rest of `/api/auth/*` — one Bearer token + `X-Auth-Index`.
- `@Security({ BearerAuth: [], AuthIndex: [] })` as a single object, matching `controller.template.ts`:
  two separate `@Security(...)` decorators mean OR in OpenAPI, one object means AND.
- tsoa's method-level `@Middlewares` + `@Security` are supported on v7 (already used at method level
  for `JoinWhitelistMiddleware`).

Rejected alternatives:

| Option | Why not |
|---|---|
| New generated `AccountController` @ `account` | Collides with an application's hand-written `AccountController` (same `@Route('account')`, same class name) — tsoa route/name clash. |
| `UserController` (`PATCH`/`DELETE /api/user/{id}`) | Generic CRUD controller; identity erasure would ride the `dataIsolation` "silently retarget to caller" path the data-isolation caveat warns about, and `DELETE /user/{id}` invites a caller-supplied id. |
| `DELETE /api/auth/account` | Verb is fine but returns no useful body and some proxies strip bodies on DELETE; `POST` keeps the structured result and is safely retryable. |
| An application-only endpoint | Splits the identity domain out of vex and breaks standalone vex apps. |

`AuthController` changes in `src/generators/routes/authController.template.ts`: conditional imports
(`Middlewares`, `Security`, `Authentication`, `UserContext`, the service) and the method emitted only
when `isAccountDeletionEnabled()`.

---

## 6. `/delete_account` page (R4)

Follow the existing LoginUI pattern (inline CSP-nonce'd HTML + a static JS asset) rather than a
static file, because `express.static("public")` would serve `public/delete_account.html` at
`/delete_account.html`, not `/delete_account`.

1. `src/templates/_routes/LoginUI.ts`
   - `LoginUIConfig` gains `deleteAccount?: boolean` — **optional**, defaulting to `true`
     (`this.config.deleteAccount ?? true`). An application's `server.ts` is pinned with `allowOverwrite: false`
     and will not be regenerated, so a required ctor field would be a compile break there.
   - `registerRoutes()`: `if (deleteAccountEnabled) router.get("/delete_account", ...)`.
   - `deleteAccountPage()`: nonce + CSP header, warning text (**irreversible** — no undo window), the
     "type `DELETE` to confirm" input, a button, a `<pre>` result area, back-to-home link. Copy must
     match in substance: content kept (posts/quotes/reviews/**conversations**), author shown
     as "Deleted user", **viewing appointments kept but deactivated with address and notes cleared**,
     **chat attachments removed**. Never "delete all your data".
   - Home page: add the `/delete_account` link only when enabled.
2. New static `src/templates/root/public/js/deleteaccount.js` — `credentials: "include"` for the
   httpOnly-cookie mode, else `Authorization: Bearer <localStorage accessToken>` +
   `X-Auth-Index: <accessTokenIndex>`; `POST /api/auth/delete-account`.
   **On success the client logs itself out (R9): clear the four localStorage keys**, then show the
   counts and a link back to home. (The existing `/logout` page is exactly this localStorage clear,
   and the repo has no cookie-clearing path today — `useHttpOnlyCookieToken` is declared but unused.)
   Copied into `public/js` with `overwrite: false` (root templates), so a project can restyle it.
3. `src/generators/app/server.template.ts` — `ConfigLoginUiRouter(...)` passes the resolved flag so a
   regenerated `server.ts` disables the route.

When disabled: no route (404), no home link, no API method, no service file.

---

## 7. Files touched (summary)

Generator (vex):

| Area | File |
|---|---|
| Config | `src/types/types.ts`, `src/utils/generator.ts` |
| Schema validation / payload | `src/preprocess/auditFields.ts` |
| Registry | `src/generators/middlewares/vexFieldRegistry.generator.ts` |
| Repo contract | `src/templates/_types/vex/VexRepository.ts` |
| Adapters | `src/templates/_services/TypeOrmRepositoryAdapter.ts`, `MongooseRepositoryAdapter.ts` |
| Sample schema | `src/templates/jsonSchema/User.json` |
| Token guard | `src/generators/services/accountStateGuard.generator.ts` (new), `src/templates/_middlewares/Authentication.ts`, `src/index.ts` |
| Delete service | `src/generators/services/accountDeletion.generator.ts` (new) |
| API | `src/generators/routes/authController.template.ts`, `routes.generator.ts` |
| Types | `src/templates/_types/auth.ts` |
| UI | `src/templates/_routes/LoginUI.ts`, `src/templates/root/public/js/deleteaccount.js` (new), `src/generators/app/server.template.ts` |
| Docs | `docs/features/accountDeletion.md` (new), `docs/vexJsonSchema.md` (`x-vexData: "softDelete"`, `app.showSoftDeleted`), `AGENTS.md` doc map |

---

## 8. Tests

- `test/unit/configOptions.test.ts` — `isAccountDeletionEnabled`: default `true`; explicit `false`
  wins; `false` when auth is off. Plus `showSoftDeleted` default resolution.
- New `test/unit/softDelete.test.ts` — marker validation (two markers in one document, non-boolean,
  missing `default: false`, not in `required`), and that the marker lands in
  `collectRequestManagedFields`.
- New `test/unit/userContext.test.ts` case — `userIdOfToken` still resolves `vexUserId` then `_id`
  (the guard depends on it).
- Golden: new scenario `sql-auth-delete-account-off` (config `false`) pinning "no method / no route /
  no service" **and** the no-op `AccountStateGuard`; regenerate the five existing goldens after
  reviewing the diff (`npm run test:update`) — every scenario gains `User.deleted`, the registry
  exports, the repo methods, the guard, the LoginUI route and the AuthController method. Add a
  `showSoftDeleted: true` variant assertion if a scenario can carry it.
- Optional e2e (`test/e2e/contract.test.ts`, docker + Postgres, opt-in): register → call an
  authenticated endpoint → delete → assert `deleted = true`, credentials/session rows gone,
  `email IS NULL`, `name = "Deleted user"` → the **same access token now 401s** → login and refresh
  both fail → register the same email again succeeds as a new account. This is the only layer that
  proves the SQL and the guard actually run.

Verification (vex half): `User` row still present with `name = "Deleted user"`, `email`
NULL, `deleted = true`; `UserAuthProfiles` / `UserRole` / `Session` rows gone; re-login with the same
Google account yields a **new** account; repeat delete call idempotent; caller-A cannot affect
caller-B; a deleted user's live access token is rejected.

---

## 9. Rollout notes for a consuming application (not vex code, but blocks it)

1. **Schema reaches the project automatically.** `deleted` is a missing *property* in the project's
   `jsonSchema/User.json`, and `userSchema.generator` merges missing properties from the template — no
   hand edit needed.
2. **`allowOverwrite: false` files with stale content.** Check `.vex/meta.json`: a pinned
   `UserModel.gen.ts` / `newUser.gen.ts` pair must gain the `deleted` column by hand, or its meta entry
   cleared. `server.ts` needs no edit as long as the LoginUI field stays optional.
   `Authentication.gen.ts`, `AccountStateGuard.gen.ts`, `VexFieldRegistry.gen.ts` and
   `*RepositoryAdapter.gen.ts` are overwrite-enabled and pick up the guard and the new registry exports
   automatically.
3. **DB column**: dev is `SQL_SYNCHRONIZE=true`; production needs a real migration —
   `ALTER TABLE "user" ADD COLUMN "deleted" boolean NOT NULL DEFAULT false`.
4. **Firebase account deletion is the application's job** — vex cannot do it. Capture the provider uid
   before calling the service, then delete the Firebase account as the last step of the application's
   flow, with retry: if the DB erasure succeeded and Firebase failed, re-login must not re-bind to the
   tombstone (it cannot: the profile rows are gone and `email` is NULL, so the next Google login creates
   a new account), but the orphaned Firebase account is a compliance item until the retry lands.
5. **The business domain stays in the application.** Recommended shape: the application's own
   `AccountController` calls `AccountDeletionService.deleteSelf()` (same process, import from
   `src/system/_services/account/...`) after its own steps, instead of round-tripping over HTTP. The
   generated endpoint remains for standalone apps.
6. **Per-request cost**: every authenticated request now costs one extra indexed read of `user` (the §3
   guard). Measure before rolling out to production traffic.
7. **Legal and store copy is the application's**, and the `/delete_account` page copy must match what
   the service actually does. There is no undo window to describe.

---

## 10. Open questions

1. **Guard caching.** The §3 check is one narrow indexed read per authenticated request. If that is
   too hot, the follow-ups are (a) a short-TTL in-process cache keyed by user id, or (b) a token
   version claim minted at login and bumped on deletion. Both add invalidation complexity; not in
   this plan.
2. **`showSoftDeleted: true` in practice (decided: keep the switch).** Residual risks accepted:
   all-or-nothing across entities, including tables added later, and tombstone rows becoming writable
   through the ordinary CRUD path again (§1.2). Mitigations: generation-time warn, no runtime/HTTP
   path to the flag, and the §3 guard reading the marker directly so it is unaffected by the switch.
3. **Redaction scope.** This plan derives the tombstone payload from the standard `User` fields
   (`email`/`name`/`locale`/`profileErrors`/`active`). If custom `User` properties also carry PII,
   promote the wipe to `x-vexData` markers (`tombstoneName` / `tombstoneRedact` /
   `tombstoneDeactivate`) with validation in `validateAuditFields`.
4. **Vex-side sign-off document** : this plan is the candidate content for
   `docs/superpowers/specs/2026-xx-account-deletion-scope.md`.

---

## 11. Suggested commit sequence

1. config gates: `isAccountDeletionEnabled`, `app.showSoftDeleted` + generation-time warn
   (+ unit tests).
2. soft-delete primitive: `x-vexData: "softDelete"` validation, registry exports, `VexRepository`
   (`softDelete`, `findOneWithDeleted`), adapters, template `User.json` (+ unit tests).
3. token guard: `AccountStateGuard` generator + `Authentication.middleware` restructure
   (+ unit test for the sync/async error forwarding).
4. `AccountDeletionService` + `_types/auth.ts` response type.
5. `AuthController` endpoint.
6. `/delete_account` page + JS asset (logout on success) + server template wiring.
7. goldens + docs (`docs/features/accountDeletion.md`, `AGENTS.md` map) + new golden scenario.
