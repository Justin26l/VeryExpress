## Plan: Data Isolation Code Generation

Config in `vex.config.json` maps schema → FK column → JWT source field. Controller generator reads matching rule and injects isolation logic into all 5 route operations. Column must have `x-foreignKey`.

---

### Phase 1: Types & Config

**Step 1** — Add `DataIsolationRule` interface to [src/types/types.ts](src/types/types.ts):
```
{ schema: string, column: string, source: string }
```
- `schema` → documentName to isolate
- `column` → FK column on that schema (must have `x-foreignKey`)
- `source` → field name from `req.user` (e.g. `"_id"`, `"tenantId"`)

**Step 2** — Add `dataIsolation?: DataIsolationRule[]` to `compilerOptions` in same file.

**Step 3** — Add validation in `src/utils/configChecker.ts`:
- each rule's `schema` must match a loaded documentName
- each rule's `column` must exist on that schema **with** `x-foreignKey`

---

### Phase 2: Generator Pass-through

**Step 4** — In [src/generators/controller/controllers.generator.ts](src/generators/controller/controllers.generator.ts): look up matching `DataIsolationRule` from `compilerOptions.dataIsolation` for current schema, pass as `isolationRule?` to `controllerTemplate()`.

**Step 5** — Extend `controllerTemplate()` options type to accept `isolationRule?: DataIsolationRule`.

---

### Phase 3: Template Code Generation

**Step 6** — When `isolationRule` present, add `"Request"` to tsoa decorator imports and `import express from "express"`.

**Step 7** — Inject private method into generated class:
```typescript
private buildIsolationFilter(request: express.Request): Partial<Post> {
    const user = (request as any).user;
    if (!user) throw new VexResErr(401);
    return { userId: user['_id'] };   // values baked in at generation time
}
```

**Step 8** — Inject `@Request() request: express.Request` param and isolation into all 5 routes:
| Route | Change |
|---|---|
| `getList` | Spread `buildIsolationFilter(request)` into `body.filter` before `repo.find()` |
| `get` | Merge into `findOne({ _id: id, ...isolationFilter })` |
| `post` | Auto-set `body[column] = user[source]` before `repo.create()` |
| `put / patch` | Pre-verify with `findOne({ _id: id, ...isolationFilter })` before mutate |
| `delete` | Pre-verify with `findOne({ _id: id, ...isolationFilter })` before delete |

---

### Relevant Files
- [src/types/types.ts](src/types/types.ts) — new interface + `compilerOptions` field
- [src/utils/configChecker.ts](src/utils/configChecker.ts) — startup validation
- [src/generators/controller/controllers.generator.ts](src/generators/controller/controllers.generator.ts) — rule lookup
- [src/generators/controller/controller.template.ts](src/generators/controller/controller.template.ts) — all template changes

### Verification
1. Add to `vex.config.json`: `"dataIsolation": [{ "schema": "Post", "column": "userId", "source": "_id" }]`
2. Run `npm run dev`
3. Inspect generated `PostController.gen.ts` — confirm `buildIsolationFilter()` in class body and `@Request()` param in all routes
4. Check a non-isolated schema (e.g. `User`) — controller unchanged
