# UserContext — 请求作用域身份传递与审计字段强制 Design

Date: 2026-09-22
Status: Draft
Branch: TBD

## 1. Motivation

`createdBy` / `createdAt` 这类审计字段在生成的应用里**静默留下 NULL**，且没有任何信号。

RenoMaster 的实测现场：

- 23/24 个 schema 声明了 `createdBy` / `updatedBy`（`onCreateUserId` / `onUpdateUserId`）
- 只有 `User` 一个声明了 `dataIsolation`
- 生成的 18 个 controller 里，**0 个**挂了 `DataIsolationContext.middleware`
- → `als.run()` 从未执行 → `UserContext` 取不到 userId
- → `applyVexFields()` 里 `userId === undefined` → `if (value !== undefined)` 不成立 → **静默跳过**

`createdAt` / `updatedAt` 是 context-free 的，照写。**只有 `createdBy` / `updatedBy` 永远是 NULL。**

这里其实是**两个正交缺陷**叠在一起：

1. **挂载门**：`controller.template.ts:64` 用 `dataIsolation` 当作挂载条件，但审计字段和 `dataIsolation` 是两件独立的事（`docs/features/dataIsolation.md:52-56` 自己说的）。
2. **静默失败**：上下文缺失时，写路径不报错、不告警、不记录，只是安静地不写。

本 spec 同时修这两条，并把 `DataIsolationContext` 正名为 `UserContext`。

## 2. 现状（代码事实）

### 2.1 生产者 / 消费者 / 挂载点

| 角色 | 位置 |
|---|---|
| 生产者 | `src/templates/_middlewares/DataIsolationContext.ts`（37 行，包 `AsyncLocalStorage`） |
| 消费者 | `TypeOrmRepositoryAdapter.ts:58`（`applyVexFields`）、`:75`（`getOwnershipFilter`）、`:201`（`create` 归属盖章） |
| 消费者 | `MongooseRepositoryAdapter.ts:51`（`applyVexFields`，Mongoose 无隔离） |
| 挂载点 | `src/generators/controller/controller.template.ts:64` |
| req 来源 | `src/templates/_middlewares/Authentication.ts:29` — `req.user = tokenData` |

挂载点原文：

```ts
if (useAuth) {
    if (dataIsolation) classDecoratorLines.push("@Middlewares(DataIsolationContext.middleware)");
    classDecoratorLines.push("@Middlewares(Authentication.middleware)");
```

### 2.2 注册表

| 生成物 | 生成器 | 内容 |
|---|---|---|
| `VexFieldRegistry.gen.ts` | `vexFieldRegistry.generator.ts` | `entityVexFields: entity → [{field, type}]`、`vexUserIdField` |
| `DataIsolationRegistry.gen.ts` | `dataIsolationRegistry.generator.ts` | `entityIsolation: entity → {field}` |

`applyVexFields` 的 6 个调用点完全对称：

| 文件 | create | replace | update |
|---|---|---|---|
| `TypeOrmRepositoryAdapter.ts` | 208 | 218 | 230 |
| `MongooseRepositoryAdapter.ts` | 92 | 103 | 113 |

### 2.3 当前契约（将被推翻）

`docs/features/auditFields.md` §5 原文：

> Public / anonymous / internal calls have no ALS store … `onXXUserId` keywords → **skipped**, field left unset (NULL column). Never `"undefined"`, **never a throw**. Nothing in the write path raises because the context is missing.

改为 fail-loud 即推翻此契约，文档必须同步。

### 2.4 触发路径证明（RenoMaster）

```
$ grep -rln "DataIsolationContext.middleware" src/system/_controllers/ | wc -l
0
$ ls src/system/_controllers/*.gen.ts | wc -l
18
```

`JobController.gen.ts:22-25`：

```ts
@Route("job")
@Middlewares(RoleBaseAccessControl.middleware("Job"))
@Middlewares(Authentication.middleware)
export class JobController extends controllerFactory._ControllerFactory {
```

而 `VexFieldRegistry.gen.ts:54` 里 `"JobEntity"` 是存在的，`vexUserIdField = "_id"` 也正确。**registry 没问题、token 没问题、`req.user` 没问题，缺的只是那行中间件。**

## 3. 目标 / 非目标

### 目标

- `onCreateUserId` 字段在 create 时**永不为 NULL**；无法满足时 **fail loud**
- 移除挂载门，`UserContext` 覆盖面从「有 `dataIsolation` 的实体」扩到「所有挂了 auth 的 controller」
- 移除双中间件顺序的脆弱约定（当前依赖「源码逆序 == 执行序」这一隐式规则）
- `DataIsolationContext` → `UserContext` 正名

### 非目标

- **不强制 `onUpdateUserId`** —— `updatedBy` 允许 NULL（见 D1）
- **不引入显式注入**（`getRepository(target, actor)`）—— 决策 2，见 D2
- **不改底层 ALS 的用法** —— 仍是一个模块内的 `const als = new AsyncLocalStorage<UserContextData>()`，不额外抽象
- 不改变数据隔离的语义与功能
- 不做历史行 backfill
- 不做软删除（`delete()` 仍是真 DELETE，无行可审）
- 不做 Mongoose 的数据隔离（既有 gap）

## 4. 设计

### 4.1 UserContext 模块

替换 `src/templates/_middlewares/DataIsolationContext.ts`。
生成后为 `src/system/_middlewares/UserContext.gen.ts`。

```ts
// {{headerComment}}
import { AsyncLocalStorage } from "async_hooks";

/** Identity-bearing claims carried from the verified access token. */
export interface UserContextData {
    tokenData: Record<string, unknown>;
}

/**
 * Pure: identity value carried by a verified access token.
 * `vexUserId` is the schema-declared identity; `_id` keeps tokens issued
 * before that claim working.
 */
export function userIdOfToken(tokenData: Record<string, unknown> | undefined): string | undefined {
    return (tokenData?.vexUserId as string | undefined) ?? (tokenData?._id as string | undefined);
}

const als = new AsyncLocalStorage<UserContextData>();

class UserContext {
    /**
     * Enter the per-request context. Called ONLY by Authentication.middleware
     * after token verification succeeds.
     *
     * Never use enterWith(): it mutates the current execution context instead of
     * scoping a new one, and leaks into whatever runs next on the same tick.
     */
    run<T>(tokenData: Record<string, unknown>, fn: () => T): T {
        return als.run({ tokenData }, fn);
    }

    getStore(): UserContextData | undefined {
        return als.getStore();
    }

    /**
     * Normalized identity. The data layer MUST use this accessor and never read
     * the token shape directly — the token→identity mapping stays in one place.
     */
    get userId(): string | undefined {
        return userIdOfToken(als.getStore()?.tokenData);
    }
}

export default new UserContext();
```

与旧实现的差异：

| | `DataIsolationContext` | `UserContext` |
|---|---|---|
| 存储内容 | `{ userId: string }` | `{ tokenData }`（整个 access token payload） |
| 归一化时机 | 中间件内，写库前 | 读取时，由 `userId` getter 完成 |
| 无 userId 时 | 不 `run()` | **仍然 `run()`** |
| 额外导出 | — | `userIdOfToken()` 纯函数 |

**为什么存 payload 而不是只存 userId**：为后续 claim 读取（role 等）留通道。
**为什么保留归一化 getter**：避免 token 形状知识漏进数据层。这是本设计仍然保留 `vexUserIdField` 语义的唯一位置。
**`als` 变量本身不抽象**：需求上不存在第二个 ALS 实例，「把 ALS 再包一层并另起名字」不带来收益，反而多一个要同步的概念。保持一个模块、一个 `als`、一个默认导出的类。

**别名警告**：`als.run({ tokenData })` 持有的是**与 `req.user` 相同的对象引用**。任何中间件修改 `req.user` 会连带修改上下文。本 spec 接受该行为（二者本应一致），但要求实现处加注释说明。

**内存提示**：存储整个 payload 而非单个 string，会在「异步上下文泄漏」场景下放大泄漏体积。见 §6.3 与 D5。

### 4.2 Authentication 接线

`src/templates/_middlewares/Authentication.ts`：

```ts
const tokenData = this.JWTService.verifyToken(token, accessTokenIndex);
req.user = tokenData;
UserContext.run(tokenData, () => next());
```

要点：

- **无条件 `run()`** —— 删除旧 `if (userId) als.run(...) else next()` 的分支
- 身份只在 `Authentication.middleware` 里建立。`tsoaAuthentication.gen.ts` 只检查 header 是否存在并返回 `{}`，**不设 `req.user`**，不提供身份
- `run()` 包裹 `next()`，因此整个下游（RBAC → controller → adapter）都在同一上下文内
- 验签失败抛 `VexResErr` 发生在 `run()` 之前，不进上下文

### 4.3 挂载门移除

删除 `src/generators/controller/controller.template.ts:64`：

```diff
 if (useAuth) {
-    if (dataIsolation) classDecoratorLines.push("@Middlewares(DataIsolationContext.middleware)");
     classDecoratorLines.push("@Middlewares(Authentication.middleware)");
```

连带清理：

- `controller.template.ts:43` 的 `Middlewares` 导入条件去掉 `|| dataIsolation`
- `:55` 的 `DataIsolationContext` 可选 import 删除
- 不再生成独立的上下文中间件 —— `UserContext` 从 middleware 降级为 helper 模块（只剩 `run()` / `getStore()` / `userId`）

**为什么这是从构造上消除挂载门**：`Authentication.middleware` 本来就挂在每个 `useAuth` 的 controller 上（生成 18 个 + RenoMaster 手写 17 个里的 14 个）。没有第二处需要记得挂的装饰器，就没有「忘了挂」这一态。

### 4.4 Adapter 强制规则

**只在 create 阶段强制 `onCreateUserId`。** 两个 adapter 各加一份。

`TypeOrmRepositoryAdapter.ts` / `MongooseRepositoryAdapter.ts`，在 `applyVexFields()` 内、`fields.length === 0` 早退之后：

```ts
/**
 * Fail loud when an entity declares a create-phase user field but no identity is
 * in scope. `onUpdateUserId` is deliberately NOT enforced — `updatedBy` is allowed
 * to stay NULL.
 */
private assertCreateIdentity(fields: VexFieldEntry[]): void {
    if (!fields.some(f => f.type === "onCreateUserId")) return;
    if (UserContext.userId) return;

    throw new VexResErr(500, undefined,
        `${this.getEntityName()} declares onCreateUserId but UserContext carries no user identity`);
}

private applyVexFields(data: Partial<T>, phase: writePhase): void {
    const fields = entityVexFields[this.getEntityName()] ?? [];
    if (fields.length === 0) return;

    if (phase === "create") this.assertCreateIdentity(fields);

    const userId = UserContext.userId;
    // ... 其余不变
}
```

其余调用点同步替换：

| 旧 | 新 |
|---|---|
| `DataIsolationContext.getStore()?.userId` | `UserContext.userId` |
| `DataIsolationContext.getStore()`（`getOwnershipFilter`） | `UserContext.getStore()` |
| `import DataIsolationContext from "../_middlewares/DataIsolationContext.gen"` | `import UserContext from "../_middlewares/UserContext.gen"` |

需新增 `VexResErr` import（当前 adapter 只从 `../_types/vex` 引入类型）。

**约束**：

- 早退顺序必须是 `fields.length === 0` → `assertCreateIdentity` → 取值。纯 timestamp 实体（`PushDevice`、`SystemNotification`）不受任何影响
- `delete()` / `deleteWhere()` 不参与 —— 真 DELETE，无审计
- `repo.native` 直连绕过 guard，接受（与 raw SQL 绕过同类）

### 4.5 错误语义

- 类型：`VexResErr(500, ...)` —— 服务端不变量被破坏，**不是客户端错误**
- 消息：必须同时给出 **entity 名**和**缺失的字段类型**，便于定位
- 不做「dev warn / prod silent」的降级 —— 静默正是本次要根除的缺陷

### 4.6 命名

| 名字 | 归属 | 说明 |
|---|---|---|
| `UserContext` | 模块 / 类 / 默认导出 | 保留的名字 |
| `UserContextData` | 存储类型 | `{ tokenData }` |
| `userId` | getter | 归一化身份访问器 |
| `als` | 模块内私有常量 | 保持原样，不另行命名、不额外抽象 |

`UserContext` 在 `src/` 里无命名冲突（已 grep 确认）。

### 4.7 新增生成期校验（R8）

`validateAuditFields()` 目前只保证「有 `onXXUserId` 就必须有身份源（tag）」，**不保证身份源真的能被填上**。改成 fail-loud 之后，这个缺口会从「静默 NULL」升级成「运行时 500」，所以必须在生成期先挡掉。

新增规则 R8（`docs/features/auditFields.md` §6 规则表顺延）：

> 声明了 `onCreateUserId` / `onUpdateUserId`，但编译器配置里**完全没有开启认证**
> （`auth.localAuth !== true` 且 `oauthProviders` 全部为 false）→ 生成期报错。

**理由**：没有 auth 就没有 `Authentication.middleware`，任何 controller 都不会建立 `UserContext`。此时声明审计用户字段是自相矛盾的配置 —— 要么补 auth，要么删关键字。放在生成期报错符合既有哲学：`validateAuditFields()` 已经是「一次收集、统一报错」，`log.error` 直接终止生成。

**实现落点**：`src/preprocess/auditFields.ts`。

```ts
/** Identity can only ever exist if the app has a way to authenticate. */
function checkAuthenticationAvailable(ctx: validationContext, compilerOptions: types.compilerOptions): void {
    const usesUserIdKeyword = ctx.documents.some(doc => collectVexFields(doc.schema).some(
        f => f.type === types.vexDefaultKeyword.OnCreateUserId
            || f.type === types.vexDefaultKeyword.OnUpdateUserId
    ));
    if (!usesUserIdKeyword) return;

    const hasAuth = compilerOptions.auth?.localAuth === true
        || Object.values(compilerOptions.auth?.oauthProviders ?? {}).some(Boolean);
    if (hasAuth) return;

    ctx.problems.push(
        `Schema declares "onCreateUserId" / "onUpdateUserId" but the app enables no authentication ` +
        `(auth.localAuth is false and no oauth provider is on) — no request can ever carry an identity. ` +
        `Enable an auth method or remove the keywords.`
    );
}
```

**签名影响**：`validateAuditFields(documents)` 当前拿不到 compiler 配置，需要补一个 `compilerOptions` 参数；调用点（`src/index.ts`）相应调整。

**边界**：这条规则只看 **app 层面有没有 auth**。它**判断不了**某个具体实体的 create 路径是否有 auth —— 那正是 D2 的 open question，只能在运行时由 `assertCreateIdentity` 兜住。两条防线互补，不能互相替代。

## 5. 决策记录

### D1 — 只强制 `onCreateUserId`，不强制 `onUpdateUserId`

**决定**：`assertCreateIdentity` 只看 `onCreateUserId`。

**理由**：`updatedBy` 在语义上允许 NULL（新建行尚无更新）。强制它会要求 create 时同时盖章 `updatedAt` / `updatedBy`，那是另一项语义变更，用户明确排除。

**必须记录的副作用**：实体声明了 `onUpdateUserId` 时，一次**无上下文的 update** 不会把该列写成 NULL，而是**保留旧值**（stale）：

| 适配器 | update | replace |
|---|---|---|
| TypeORM | `repo.update(where, enriched)` — 部分更新，缺省字段不动 → 保留旧值 | `repo.merge(existing, enriched)` → 保留旧值 |
| Mongoose | `$set: enriched` → 保留旧值 | `overwrite: true` → **整文档替换，缺省字段被清空/回落默认值** |

Mongoose `replace` 与其余三者行为不一致。本 spec 接受，但要求在 `docs/features/auditFields.md` 明确写出：**无上下文的 update 会静默保留过期的 `updatedBy`** —— 这是「不写」而非「写错」，但会让审计列说谎。

### D2 — 不引入显式注入

**决定**：不提供 `getRepository(target, actor)` 这类显式身份通道。

**代价（明确接受）**：**没有逃生口**。任何处于请求链之外的写（seed、后台 job、tsoa 注册路径）都无法声明身份，只能硬失败或静默 NULL。

**影响面（RenoMaster 实测）**：`VexDb.getRepository(...)` 构造点 79 处，其中写路径 19 处（4 处直连写 + 15 处 `this.repo`）。选 ALS 路线意味着这 79 处**零改动**。

**已识别的硬冲突**：RenoMaster 的注册路径在**无 auth** 的 controller 里 create `User`：

| 位置 | 装饰器 |
|---|---|
| `src/system/_controllers/AuthController.gen.ts:21` `@Route("auth")` | 无 `@Middlewares` |
| `src/controllers/FirebaseAuthController.ts:16` `@Route("auth")` | 无 `@Middlewares` |

生成侧源码：`src/generators/routes/authController.template.ts:116`

```ts
const user = await this.userRepo.create({ name: email.split("@")[0], email, active: true })
```

注册路径**按定义**是 pre-auth 的，鸡生蛋，`@Middlewares(Authentication.middleware)` 无法挂。

**当前安全的原因**：`User.json` 只有 `updatedBy`（`onUpdateUserId`），**没有 `createdBy`**。这是巧合。

**定时炸弹**：给 `User.json` 加 `createdBy`（对用户表极自然）→ 注册流程立刻 500。

**待决 —— 三选一，是本文档唯一的 open question**：

| | 方案 | 说明 |
|---|---|---|
| A | 接受 | 注册路径禁止创建带 `createdBy` 的实体；需要时自行 self-stamp 成自己的 `_id` |
| B | `UserContext.runAsSystem(fn)` | ALS 作用域 helper，显式标 `system`。**不是 db adapter 注入**，与 D2 不冲突。**推荐** |
| C | dev 只 warn | 保留静默 NULL —— 本次要根除的正是它。**排除** |

### D3 — `run()` 无条件执行

**决定**：验签成功即 `run()`，不检查 userId 是否存在。

**理由**：`Authentication.middleware` 只在验签成功后走到这里，所以**必定有一个 token**。旧的 `if (userId) ... else next()` 分支唯一会触发的情况是「验签通过但 payload 既无 `vexUserId` 也无 `_id`」—— 这是畸形 token，不是正常的匿名请求。用分支去兼容它，代价是让「有上下文但没有身份」和「根本没进上下文」两种情况无法区分，而 guard 恰恰需要区分这两者才能给出准确错误。

**顺带**：`getStore()` 的类型因此恒为 `UserContextData | undefined`，undefined 只代表「不在请求上下文里」。

### D4 — 归一化放在 getter，不放中间件

**决定**：`{ tokenData }` 原样入 store，`vexUserId ?? _id` 的推导放在 `userId` getter。

**理由**：存 payload 是为后续 claim 读取留通道；但若把归一化也推给数据层，`vexUserIdField` 的语义就会散落到所有消费者。getter 保证归一化仍只有一处。

### D5 — 存储体积换取扩展性

**决定**：存整个 `tokenData` payload，而非单个 `userId` string。

**已接受的代价**：异步上下文若发生泄漏（§6.3），被滞留的对象体积从「一个 string」变成「整个 payload」。这是本次设计引入的**新**风险，缓解措施见 §6.3。

## 6. 风险

### 6.1 注册路径（高）

见 D2。当前 RenoMaster 安全，但依赖「`User` 没有 `createdBy`」这一巧合。必须在 D2 的 A/B/C 中做出选择后才能认为风险闭环。

### 6.2 请求链外的写入（中）

`src/services/*` 中的写路径无请求上下文。RenoMaster 实测：

| 位置 | 写入 | 该实体是否有 `onCreateUserId` |
|---|---|---|
| `PushNotificationService.ts:71` | `deviceRepo.update(id, { active: false })` | `PushDevice` 只有 `createdAt` → 不受影响 |
| `DealSnapshotService.ts` | 无写操作 | — |

今天安全，同样依赖具体 schema。guard 上线后，此类写入若命中带 `onCreateUserId` 的实体将**硬失败**（这是期望行为，但下游会看到 500）。

### 6.3 ALS 的并发与内存（需在文档中回答的常见疑问）

**Express 能跑并发请求吗？** 能。Node 单线程 + 事件循环：请求 A 在 `await` I/O 时，事件循环执行请求 B 的代码。这是**交错并发**，不是并行（除非用 worker_threads / cluster）。

**ALS 为什么能扛住交错？** 它绑定的不是全局变量，而是**异步资源链**。`als.run(data, fn)` 建立一个新的 async context；`fn` 内部产生的所有 `await` 续体、回调、Promise 都属于该 context。因此 A 的续体里 `getStore()` 拿到 A 的数据，B 的续体里拿到 B 的 —— 这正是模块级全局变量会串号的地方。

**会内存泄漏吗？** ALS 自身**不会**按请求泄漏。store 随 async context 存活：请求完成、其所有异步续体结束且不可达后，context 可被 GC。

真实的泄漏模式（与 ALS 无关，但 ALS 会让后果变大）：

1. **在请求内创建长生命周期异步资源** —— `setInterval`、常驻 `EventEmitter` 监听、未清理的 timer。它们捕获了创建时的 async context，从而永久持有 store
2. **未 await 的 `als.run()` / 未 settle 的 Promise** —— 挂起的 Promise 让 context 一直存活
3. **把请求内创建的 Promise / 对象缓进模块级缓存** —— 经典 Express 泄漏模式，ALS 只是让滞留数据更多
4. **`enterWith()` 误用** —— 污染当前执行上下文而非新建作用域。本 spec 明令禁止，只用 `run()`

**对本项目的具体要求**：

- 只用 `run()`，禁用 `enterWith()`
- 不要在请求内注册脱离请求生命周期的 timer / listener；无法避免时需显式退出（或在 context 外创建）
- 不要把请求内创建的 Promise 缓进模块作用域
- 保持 store 小 —— 这是 D5 列出代价的原因

**性能**：`AsyncLocalStorage` 每次异步操作有固定开销。Node 16+ 有原生快路径；本项目运行 Node 24（`node -v` = v24.20.0），开销可接受。**不在此处承诺具体 benchmark 数字** —— 上线前应做一次负载对比，而不是引用记忆中的数字。

### 6.4 中间件顺序（已消除）

当前依赖「class decorator 自下而上应用 ⇒ 执行序 == 源码逆序」这一隐式规则（`@tsoa/runtime` 的 `Middlewares` 是 `[...current, ...mws]` 追加）。任何人「顺手把装饰器排个序」就会静默破坏顺序。本设计删除了第二个上下文中间件，该规则不再影响正确性。

### 6.5 Mongoose `replace` 的 `overwrite: true`（低）

见 D1 表格。与本设计正交，但审计字段语义文档应标注。

## 7. 兼容性与破坏性变更

| 变更 | 性质 | 影响 |
|---|---|---|
| `DataIsolationContext` → `UserContext` | **破坏性** | 下游若直接 import 生成文件的该模块，需改名 |
| 上下文缺失时 create 抛 `VexResErr(500)` | **破坏性** | 任何无身份的 create of `onCreateUserId` 实体从「静默 NULL」变为 500 |
| 删除生成的 `@Middlewares(DataIsolationContext.middleware)` | 破坏性（生成物） | 下游需重新 `vex`；旧的 `DataIsolationContext.gen.ts` 会被 `cleanupStaleFiles()` 清理 |
| `pipeline` 生成 `UserContext.gen.ts` | 新增 | — |
| 数据隔离功能 | 无变化 | 覆盖面顺带扩大（所有 authed controller） |
| **数据隔离第一次真正生效** | **破坏性（下游可见）** | `entityIsolation` 里的实体，此前若其 controller 没挂中间件就不过滤；改后任何 authed controller 访问它都会过滤。`mergeFilter` 是 `{ ...mapped, ...ownership }`，**ownership 覆盖调用方 filter 的 `_id`** → 按 id 查/改的接口会静默变成「操作自己那一行」。**这是各 app 自己的接口问题，修复不在本卡范围** —— RenoMaster 的实例见其项目卡片 `t-mucc8ot0-9s8rfc` |

**迁移**：下游跑一次 `vex`。历史 NULL 行**不会**被回填 —— 需要各应用自行决定值（`createdBy` 有些可由关系推导，RenoMaster 的 owner 是 `Client` 而 `createdBy` 语义是 `User`，推不出来）。

## 8. 测试计划

### 8.1 Golden

5 个 golden 含 `AsyncLocalStorage` 段落，全部需 `npm run test:update` 后**逐个 review**：

```
test/golden/sql-noauth.txt
test/golden/sql-auth-oauth-rbac.txt
test/golden/sql-noswagger.txt
test/golden/mongo-auth-rbac.txt
test/golden/sql-norbac.txt
```

（`sql-noauth.txt` 有 `AsyncLocalStorage` 但无 `.middleware` 装饰器 —— auth 关闭时不生成。）

### 8.2 单元测试（实现后修订）

原计划直接单测两个 adapter —— **不可行**：adapter 是模板（`src/templates/_services/*.ts`），import 的是 `"../_middlewares/UserContext.gen"` 这类只在生成产物里存在的路径，本仓无法加载。

实际落地的是三层：

| 层 | 文件 | 覆盖 |
|---|---|---|
| 单元 | `test/unit/userContext.test.ts`（8 条） | `userIdOfToken` 归一化（`vexUserId` 优先 / `_id` 兜底 / 空）；`run()` 作用域进出与恢复；payload 可读；跨 `await` 存活；**并发隔离** |
| 单元 | `test/unit/auditFields.test.ts`（5 条） | R8 全部四个分支 + 无关键字不触发 |
| 生成产物 | `test/golden/*.txt` | 生成的 `Authentication.gen.ts` 调 `UserContext.run`；adapter 的 `assertCreateIdentity`；控制器不再带 `DataIsolationContext` 装饰器 |
| 类型检查 | `test/e2e/compile.test.ts`（5 条） | auth on/off × RBAC on/off + mongo 下**生成的 app 全部 `tsc --noEmit` 通过** |

`UserContext.ts` 之所以能直接单测：它的唯一 import 是 `async_hooks`，不含 `.gen` 路径。这是把它做成独立模块的额外收益。

### 8.3 E2E（未执行 —— 环境受限）

`test/e2e/contract.test.ts` 需要 Docker Postgres，本机 daemon 未运行，**本轮未跑**。

另有一处结构性限制：e2e 的 schema 目录 `test/.e2e/schemas/` 每次生成都会被 `src/templates/jsonSchema/` **无条件覆盖**，所以「声明 `onCreateUserId` 但没有 `dataIsolation` 的实体」无法作为 e2e 专属 fixture 存在 —— 要加就得改共享的模板 schema 集，那会同时改变所有 golden。因此该场景的运行时证明留待有 Docker 的环境补。

### 8.4 并发验证（已下沉到单元层）

原计划做成并发契约用例，实际实现在 `test/unit/userContext.test.ts`：三个不同身份的 `run()` 交错 `await`，断言各自读回自己的身份。这正是「ALS 而非模块级变量」要防的串号，且不需要数据库。

### 8.5 生成期校验（R8）

已实现于 `test/unit/auditFields.test.ts`：

| 用例 | 结果 |
|---|---|
| `onCreateUserId` + `localAuth: true` | 通过 |
| `onCreateUserId` + 仅 oauth provider 开启 | 通过 |
| `onCreateUserId` + 完全无认证 | 报错，消息点名关键字与配置 |
| `onUpdateUserId` + 完全无认证 | **通过**（R8 只认 create 关键字） |
| 无任何审计关键字 + 完全无认证 | 通过 |

**实现时收窄了 R8**：初版写成「任何 `onXXUserId` + 无 auth 即报错」，结果 `sql-noauth` golden 场景直接生成失败 —— 因为模板自带的 `User.json` 声明了 `updatedBy`（`onUpdateUserId`），而它被无条件复制进每个 app。收窄为只认 `onCreateUserId` 后，规则与运行时 guard 严格对齐：只挡「真的会抛」的配置。这个理由已写进 `docs/features/auditFields.md` §6。

## 9. 文档同步清单

| 文件 | 改动 |
|---|---|
| `docs/features/auditFields.md` §5 | **推翻契约** —— 「never a throw」→ create 阶段 `onCreateUserId` 缺失即 throw；补充 D1 的 stale-update 说明 |
| `docs/features/auditFields.md` §4 | 更新 registry 与 adapter 的读取来源名 |
| `docs/features/auditFields.md` §6 | 规则表新增 **R8**：声明 `onXXUserId` 但 app 未开任何认证 → 生成期报错 |
| `docs/releaseNote/` | 新版本条目：`createdBy` 恒 NULL 的修复、`UserContext` 改名、create 缺身份即 fail loud、数据隔离首次生效对下游接口的影响 |
| `docs/features/dataIsolation.md:9-11` | `DataIsolationContext` → `UserContext`；「runs before request handlers」→「由 `Authentication.middleware` 建立」 |
| `docs/architecture/databaseTargets.md:74` | 同上 |
| `docs/superpowers/specs/2026-06-10-tsoa-to-tsed-migration-design.md:258,395` | 引用改名（该 spec 未落地，仅保持引用一致） |
| `AGENTS.md` | 若新增「审计字段强制」这一硬规则，登记到 Hard rules |

## 10. 实施步骤

按依赖序，每步可独立验证：

1. **`UserContext` 模块** —— 新增 `src/templates/_middlewares/UserContext.ts`，删除 `DataIsolationContext.ts`
2. **Authentication 接线** —— `Authentication.ts` 内 `UserContext.run(tokenData, () => next())`
3. **挂载门移除** —— `controller.template.ts` 删 `:64` 行及关联 import
4. **Adapter 改造** —— 两个 adapter 替换读取来源
5. **`assertCreateIdentity`** —— 两个 adapter 加 guard
6. **R8 校验**（§4.7）—— `validateAuditFields()` 补 `compilerOptions` 参数 + `checkAuthenticationAvailable()`
7. **解决 D2 open question**（A / B / C）—— **未决，见 §11**
8. **文档同步**（§9）
9. **golden 更新 + review**（§8.1）
10. **单元 + e2e 测试**（§8.2、§8.3）
11. `npm run compile` → `npm test` → `npm run test:e2e`

**注意**：`src/` 的改动不生效，直到 `npm run compile`。`vex` 跑的是 `dist/index.js`。

### 10.1 落地状态（2026-09-22）

| 步 | 状态 | 备注 |
|---|---|---|
| 1 `UserContext` 模块 | ✅ | 删 `DataIsolationContext.ts`，新增 `UserContext.ts` |
| 2 Authentication 接线 | ✅ | 无条件 `run()` |
| 3 挂载门移除 | ✅ | 连带摘掉模板里的 `dataIsolation` 参数，控制器层不再认识它 |
| 4 Adapter 改造 | ✅ | 两个 adapter 改用 `UserContext.userId` |
| 5 `assertCreateIdentity` | ✅ | 两个 adapter，phase-aware（只认 `onCreateUserId`） |
| 6 R8 校验 | ✅ | 收窄为只认 `onCreateUserId`，见 §8.5 |
| 7 D2 三选一 | ⏸ **未决** | 见 §11 —— 实施者无法替用户决定是否引入逃生口 |
| 8 文档同步 | ✅ | auditFields / dataIsolation / databaseTargets / AGENTS / releaseNote |
| 9 golden | ✅ | 5 个场景 `test:update` 并逐段 review；**吸收了一笔先前遗留的漂移**（HEAD 已是 `0.8.1` 而 golden 仍是 `0.8.0`） |
| 10 单元测试 | ✅ | 13 条（`userContext` 8 + `auditFields` 5）；e2e 因无 Docker 未跑，见 §8.3 |
| 11 编译 + 测试 | ✅ | `npm test` 39 passed / 19 skipped；`VEX_E2E=1 compile.test.ts` 5/5 |

版本 bump 至 **0.8.2**，release note 见 `docs/releaseNote/v0-8-2.md`。

## 11. 开放问题

1. **D2 三选一**（A 接受 / B `runAsSystem` / C 排除）—— **仍然未决，是唯一的阻塞项**。当前实现的后果：`User` 一旦加上 `createdBy`，注册路径（`AuthController.gen.ts` / `FirebaseAuthController.ts`，都无 `@Middlewares`）就会 500。今天没事只因为 `User` 恰好没有 `createdBy`。推荐 B（`UserContext.runAsSystem()`）—— 它是 ALS 作用域 helper，不是 db adapter 注入，与 D2 不冲突。
2. **是否需要在 generation 阶段告警** —— 生成时列出所有声明了 `onCreateUserId` 的实体，提示「这些实体的 create 路径必须有身份」。属噪音还是有用信号，待定。
3. **D5 的缓解深度** —— 是否需要 dev 模式下对 store 做体积/生命周期检查（如超阈值告警），或仅靠代码规范。
4. **e2e 运行时证明** —— 需要在有 Docker 的环境补一条「声明 `onCreateUserId` 且无 `dataIsolation` 的实体，create 后 `createdBy` 非空」的断言。前置条件是解决 §8.3 说的 schema 覆盖问题（要么给 e2e 一个不被覆盖的 schema 目录，要么给模板 schema 集加这样一个实体）。
