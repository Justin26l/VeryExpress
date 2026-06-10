# tsoa → Ts.ED Migration Design

Date: 2026-06-10
Status: Draft
Branch: `migrate_to_tsed`

## 1. Motivation

当前 VeryExpress 用 tsoa 做路由注册 + OpenAPI 生成。tsoa 是编译期方案，读 TypeScript AST 从 `interface` 提取类型信息。缺点是：

- tsoa 维护长期不活跃，生态停滞
- 编译器方案在处理泛型和复杂类型时 edge case 多
- 不能控制运行时的请求解析和校验

Ts.ED 是运行时方案，通过类装饰器注册 metadata，直接生成 OAS。但迁移需要彻底重构 controller 生成模板和类型体系。

## 2. 核心架构决策

### 2.1 三层分离（安全边界）

```
┌─────────────────────────────────────────────────┐
│  OAS (OpenAPI Spec) ← Ts.ED 从 @Property() 生成    │
├─────────────────────────────────────────────────┤
│  Controller     ← Ts.ED @Controller, 引用 Dto     │
├─────────────────────────────────────────────────┤
│  Dto Layer      ← Ts.ED class @Property()         │
│  ┌─────────────────────────────────────────────┐ │
│  │ ClientDto (纯字段, 输入用)                     │ │
│  │ ClientDtoWithRelation (extends, +relation)   │ │
│  └─────────────────────────────────────────────┘ │
├─ 安全边界 ───────────────────────────────────────┤
│  Entity Layer   ← TypeORM class @Column(), 无     │
│                    @Property(), 含敏感字段        │
│  ┌─────────────────────────────────────────────┐ │
│  │ ClientEntity (DB 全量字段 + 全量 relation)   │ │
│  └─────────────────────────────────────────────┘ │
│  DB (PostgreSQL)                                  │
└─────────────────────────────────────────────────┘
```

Dto 和 Entity 完全独立生成（无继承关系），Entity 上的敏感字段永远不可能通过 Dto → OAS 链泄露。

### 2.2 每个 Schema 生成 5 个文件

| 文件 | 类型 | 装饰器 | 用途 |
|------|------|--------|------|
| `_types/dtos/{Doc}Dto.gen.ts` | class | `@Property()` | 输入 body、Filter、VexRepository 绑定 |
| `_types/dtos/{Doc}DtoWithRelation.gen.ts` | class extends `{Doc}Dto` | `@Property(() => Target)` | 输出 response、带 whitelist relation |
| `_models/{Doc}Model.gen.ts` | class | `@Entity/@Column/@XtoY` | DB 实体，无 @Property() |
| `_controllers/{Doc}Controller.gen.ts` | class | `@Controller/@Get/@BodyParams` | Ts.ED 路由 handler |
| `_types/{Doc}.gen.ts` | enum + 工具 type | 无 | 枚举声明、Filter 辅助类型 |

Dto 文件的位置受 preprocessor 和 route generator 的影响，调整 Dto 目录时要注意同步更新 controller generator 中的 import path。一致性由同一条生成器逻辑保证。

## 3. Dto 设计

### 3.1 ClientDto（输入用）

```ts
// _types/dtos/ClientDto.gen.ts
import { Property, Required } from "@tsed/schema";

export class ClientDto {
    @Property()
    @Required()
    name!: string;

    @Property()
    email?: string;

    @Property()
    clientType?: ClientTypeEnum;
}
```

- **不包含任何 relation 字段** — 保证 POST/PUT body 不接受 `profile: {...}`
- `@Required()` 对应 JSON Schema `required` 数组
- 枚举类型引用 `_types/{Doc}.gen.ts` 中生成的 enum
- `json-schema-to-typescript` 废弃 — 由自定义 DtoTemplate() 生成

### 3.2 ClientDtoWithRelation（输出用）

```ts
// _types/dtos/ClientDtoWithRelation.gen.ts
import { Property } from "@tsed/schema";
import { ProfileDtoWithRelation } from "./ProfileDtoWithRelation.gen";

export class ClientDtoWithRelation extends ClientDto {
    // whitelisted one-to-many
    @Property(() => ProfileDtoWithRelation)
    profiles?: ProfileDtoWithRelation[];

    // whitelisted many-to-one
    @Property(() => UserDtoWithRelation)
    user?: UserDtoWithRelation;
}
```

- extends `ClientDto` — 继承纯字段，按需添加 relation
- `@Property(() => TargetDtoWithRelation)` — Ts.ED 用 thunk 延迟解析，避免循环 import 的 TDZ
- 只包含 `joinWhitelist` 内的 relation
- 生成的 import 由 build-time 的 FK metadata 决定

### 3.3 Enum 声明（保留独立文件）

```ts
// _types/Client.gen.ts
export enum ClientTypeEnum {
    basic = "basic",
    premium = "premium"
}
```

被 `ClientDto` 和 `ClientEntity` 两方引用。

## 4. Entity 设计

```ts
// _models/ClientModel.gen.ts
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, JoinColumn } from "typeorm";
import { ClientTypeEnum } from "../_types/Client.gen";

@Entity("client")
export class ClientEntity {
    @PrimaryGeneratedColumn("uuid")
    _id!: string;

    @Column({ type: "varchar", length: 100 })
    name!: string;

    @Column({ type: "text", nullable: true })
    email?: string;

    // 敏感字段 — 不在 Dto 中
    @Column({ type: "varchar" })
    passwordHash!: string;

    // 全量 relation — 不对应 DtoWithRelation 的 whitelist
    @OneToMany(() => ProfileEntity, profile => profile.client)
    profiles?: ProfileEntity[];

    @Column({ type: "enum", enum: ClientTypeEnum })
    clientType?: ClientTypeEnum;
}
```

- **无 `@Property()`** — 不做 OAS 源头
- 含全部 DB 字段 + 全部 relation
- 含不会暴露给 API 的内部字段（passwordHash, ownerId, version 等）
- 当前 `export * from "../_types/...` pattern 废弃 — Dto 独立 import

## 5. Controller 设计

### 5.1 装饰器映射

```ts
// tsoa → Ts.ED
@Route("client")           → @Controller("/client")
@Tags("Client")            → @Tag("Client")
@Get("{id}")               → @Get("/:id")
@Post()                    → @Post()
@Put("{id}")               → @Put("/:id")
@Patch("{id}")             → @Patch("/:id")
@Delete("{id}")            → @Delete("/:id")
@Body() body: Client       → @BodyParams() body: ClientDto
@Path() id: string         → @PathParams("id") id: string
@Query() join              → @QueryParams("join") join: string[]
@Middlewares(Auth.mid)     → @UseBefore(AuthMiddleware)
@Security("BearerAuth")    → @Security("BearerAuth")  // 同名但由 Ts.ED 处理
```

### 5.2 Controller 输出示例

```ts
// _controllers/ClientController.gen.ts
import { Controller, Get, Post, Put, Patch, Delete, BodyParams,
         PathParams, QueryParams, UseBefore } from "@tsed/common";
import { Tag, Security } from "@tsed/schema";

// import Dto class, 不 import Entity
import { ClientDto } from "../_types/dtos/ClientDto.gen";
import { ClientDtoWithRelation } from "../_types/dtos/ClientDtoWithRelation.gen";
import { ClientEntity } from "../_models/ClientModel.gen";

import { VexRepository, VexResponse, Filter } from "../_types/vex";
import VexDb from "../_services/VexDb.gen";

export type FilterClientDto = { [K in keyof ClientDto]?: FieldFilter<ClientDto[K]> } & Filter<ClientDto>;

@Controller("/client")
@Tag("Client")
@UseBefore(AuthenticationMiddleware)
export class ClientController {
    private get repo(): VexRepository<ClientDto> {
        return VexDb.getRepository(ClientEntity);  // 底层还是 Entity
    }

    @Post("/search")
    getList(@BodyParams() body: { filter: FilterClientDto, join?: string[] }): VexResponse<ClientDtoWithRelation[]> {
        const data = await this.repo.find(body.filter, body.join);
        return { result: { data } };
    }

    @Get("/:id")
    get(@PathParams("id") id: string): VexResponse<ClientDtoWithRelation> {
        const result = await this.repo.findOne({ _id: id });
        if (!result) throw new VexResErr(404);
        return { result };
    }

    @Post()
    create(@BodyParams() body: ClientDto): VexResponse<ClientDto> {
        const result = await this.repo.create(body);
        return { result };
    }

    @Put("/:id")
    replace(@PathParams("id") id: string, @BodyParams() body: ClientDto): VexResponse<ClientDto> {
        const result = await this.repo.replace(id, body);
        return { result };
    }

    @Patch("/:id")
    update(@PathParams("id") id: string, @BodyParams() body: Partial<ClientDto>): VexResponse<ClientDto> {
        const result = await this.repo.update(id, body);
        return { result };
    }

    @Delete("/:id")
    delete(@PathParams("id") id: string): VexResponse<void> {
        const existing = await this.repo.findOne({ _id: id });
        if (!existing) throw new VexResErr(404);
        await this.repo.delete(id);
        return { result: undefined };
    }
}
```

### 5.3 `_ControllerFactory` 基类

当前 `_ControllerFactory` extends tsoa `Controller`：

```ts
import { Controller } from "tsoa";
export class _ControllerFactory extends Controller {
    protected isObjectId(id: string): boolean { ... }
}
```

迁移后改为 extends Ts.ED `Controller`（`@tsed/common`），isObjectId 保持：

```ts
import { Controller } from "@tsed/common";
export class _ControllerFactory extends Controller {
    protected isObjectId(id: string): boolean { ... }
}
```

### 5.4 `VexRepository<ClientDto>` 绑定的是 Dto 而非 Entity

Repository 的类型泛型绑定到 `ClientDto`（纯字段 type），但底层 `VexDb.getRepository()` 接受 `ClientEntity`（ORM metadata）。

当前 Controller template 第 200-202 行：
```ts
private get repo(): VexRepository<${documentName}> {
    return VexDb.getRepository(${documentName}Entity);
}
```

迁移后：
```ts
private get repo(): VexRepository<${documentName}Dto> {
    return VexDb.getRepository(${documentName}Entity);
}
```

`VexDb.getRepository()` 签名需同时接受 class+type 参数，或保持 `getRepository(ClientEntity)` 返回 `VexRepository<ClientDto>`（通过类型断言或双重泛型 `getRepository<TEntity, TDto>`）。生成器在 import 时需要同时引用 Dto 和 Entity。

## 6. 静态模板迁移

### 6.1 Middlewares

| 当前文件 | 当前模式 | 迁移后 |
|---------|---------|--------|
| `tsoaAuthentication.ts` | `expressAuthentication()` | ❌ 废弃 |
| `Authentication.ts` | Express middleware | Ts.ED `@Middleware()` class |
| `DataIsolationContext.ts` | Express middleware | Ts.ED `@Middleware()` |
| `JoinWhitelistMiddleware.ts` | Express middleware class | Ts.ED `@Middleware()` |

以 Authentication 为例：

```ts
// 迁移前 (Express middleware)
export async function authentication(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Missing token" });
    req.user = verifyToken(token);
    next();
}

// 迁移后 (Ts.ED @Middleware)
import { Middleware, Context } from "@tsed/common";

@Middleware()
export class AuthenticationMiddleware {
    async use(@Context() ctx: Context) {
        const token = ctx.request.headers.authorization;
        if (!token) throw new VexResErr(401, undefined, "Missing token");
        ctx.set("user", verifyToken(token));
    }
}
```

### 6.2 Routes

| 文件 | 当前 | 迁移后 |
|------|------|--------|
| `authController.template.ts` | tsoa `@Route` | Ts.ED `@Controller` |
| `authRoute.template.ts` | Express Router (OAuth redirect) | 保留 Express Router |
| `LoginUI.ts` | Express Router (HTML pages) | 保留 Express Router |
| `OAuthRouteFactory.ts` | Express Router (passport callbacks) | 保留 Express Router |
| `routes.template.ts` | RegisterRoutes() + app.use() | **废弃**，由 @Configuration.mount 替代 |

### 6.3 Server entrypoint 迁移详细

**迁移前** (`server.template.ts`):
```ts
import { RegisterRoutes } from "./system/_routes/tsoa_routes";

async function main() {
    const app = express();
    app.use(vexDB.middleware);
    RegisterRoutes(app);              // tsoa 生成的路由
    app.use("/api/auth", AuthRoute.getRouter());  // OAuth router
    app.use("/", loginUI.getRouter());
    app.listen(port);
}
```

**迁移后**:
```ts
import { PlatformExpress } from "@tsed/platform-express";
import { Configuration, Inject } from "@tsed/common";

@Configuration({
    port: process.env.APP_PORT,
    mount: {
        "/": [
            ClientController,
            AuthController,
            // ... 所有 @Controller 类自动发现
        ],
    },
    swagger: [{
        path: "/swagger",
        specVersion: "3.0.3",
    }],
})
export class AppModule {
    @Inject()
    vexDB: VexDb;   // 可选 — Ts.ED 管理的 lifecycle

    $onInit() {
        this.vexDB.connect();
    }
}

async function main() {
    const platform = await PlatformExpress.bootstrap(AppModule);

    // 手动挂载 Express Router（OAuth/LoginUI 保留）
    const app = platform.expressApp;
    app.use("/api/auth", AuthRoute.getRouter());
    app.use("/", loginUI.getRouter());

    await platform.listen();
}
```

非 REST API 路由保留 Express Router 模式，Ts.ED 的 `platform.expressApp` 暴露原生 Express 实例供手动挂载。

### 6.3 OAS 生成

tsoa 流程：
```
jsonSchema → tsoa spec → swagger.json (需要 tsoa.json 配置)
```

Ts.ED 流程：
```
Controller @Property() metadata → Ts.ED spec builder → swagger.json (无 tsoa.json)
```

Ts.ED 在 `@Configuration` 中配置 OAS mount。不再生成 `tsoa.json`。

### 6.4 Routes 注册

当前 `routes.template.ts` 生成 `ApiRouter`类，把每个 Controller 的 `.router` 挂到 Express：

```ts
import ClientController from "...";
this.router.use("/client", ClientController.router);
```

Ts.ED 模式下，**`routes.template.ts` 废弃**。Controller 的路由由 `@Controller("/client")` 定义，Ts.ED 的 `@Configuration` 挂载所有控制器：

```ts
// server.template.ts 中生成的 AppModule
@Configuration({
    mount: {
        "/": [ClientController, AuthController, ...],
    },
    swagger: [{ path: "/swagger", specVersion: "3.0.3" }],
})
class AppModule {}
```

Express Router（AuthRouter/OAuth/LoginUI）通过 Ts.ED 的 `acceptMountedPath` 或启动后手动 `app.use()`挂载，与 `@Configuration.mount` 并行。

### 6.5 Services

所有 services 保持 static class，不引入 `@Injectable()`：

- `VexDb.ts`
- `VexSystem.ts`
- `JWTService.ts`
- `JWTKeyStore.ts`
- `OAuthStrategyService.ts`
- `TypeOrmRepositoryAdapter.ts`
- `MongooseRepositoryAdapter.ts`

### 6.5 VexRepository 适配

`VexRepository<T>` 保持通用。Controller 绑定 `VexRepository<ClientDto>`，底层 `TypeOrmRepositoryAdapter` 用 `ClientEntity` 做 ORM 操作。

VexDb 提供双类型参数重载：

```ts
// VexDb.ts
getRepository(entityClass: new () => TEntity): VexRepository<TDto>
```

Controller 模板中直接生成：

```ts
import { ClientDto } from "../_types/dtos/ClientDto.gen";
import { ClientEntity } from "../_models/ClientModel.gen";

private get repo(): VexRepository<ClientDto> {
    return VexDb.getRepository(ClientEntity) as VexRepository<ClientDto>;
    // ↑ 类型断言：运行时返回的数据结构满足 ClientDto 的 shape
}
```

TypeORM 返回的对象含全部字段（包括 Dto 不关心的），但只要 Dto 引用的字段存在，运行时就是安全的。

### 6.6 `keyof` 在 class 上的行为

`Filter<ClientDto>` 中 `keyof ClientDto`：

- Class `ClientDto` 只含 `@Property() name!: string` 这类数据声明，无 methods
- `keyof` 返回类属性名的 union，与 `keyof` interface 完全一致
- 生成器确保 Dto class 是纯数据 class（无方法），所以 Filter 类型工作正常

### 6.7 Filter 类型生成

当前在 controller 模板中生成：

```ts
export type Filter${documentName} = { [K in keyof ${documentName}]?: FieldFilter<${documentName}[K]> } & Filter<${documentName}>;
```

迁移后，`${documentName}` 替换为 `${documentName}Dto`：

```ts
export type FilterClientDto = { [K in keyof ClientDto]?: FieldFilter<ClientDto[K]> } & Filter<ClientDto>;
```

### 6.8 Filter 类型的位置

Filter 类型定义在 controller 模板中，作为 controller 文件的一部分，不对接到 OAS（仅用于 TypeScript 编译期类型安全）。Ts.ED 只关心 `@BodyParams() body: FilterClientDto` 的结构类型匹配，不影响 OAS 生成。

## 7. Circular Dependency 处理

### 7.1 现状（interface 方案）

```ts
type ClientWithRelations = Client & {
    profile?: Omit<ProfileWithRelations, 'client'>;  // Omit 切反指
}
```

`Omit<..., 'client'>` 阻止 TypeScript intersection type 的贪心展开导致 infinite type recursion。

### 7.2 迁移后（class 方案）

```ts
class ClientDtoWithRelation extends ClientDto {
    @Property(() => ProfileDtoWithRelation)
    profile?: ProfileDtoWithRelation;
}

class ProfileDtoWithRelation extends ProfileDto {
    @Property(() => ClientDtoWithRelation)
    client?: ClientDtoWithRelation;
}
```

Class 的 property type 是惰性解析的，TypeScript 在访问 `c.profile.client.profile` 时不会展开整个类型图，所以 class 不会触发 infinite type recursion。

### 7.3 Node.js 循环 import

`ClientDto.gen.ts` import `ProfileDtoWithRelation.gen.ts` → `ProfileDtoWithRelation.gen.ts` import `ClientDto.gen.ts` → 形成循环。

`@Property(() => ProfileDtoWithRelation)` 是函数 thunk — 调用时机在模块加载完成后（Ts.ED 扫描装饰器时），此时所有模块已在内存中，TDZ 不会触发。

**必要条件**（由生成器保证）：
1. 所有跨文件 class 引用必须用 thunk `() => Target`
2. `extends` 链不跨文件（`ClientDtoWithRelation extends ClientDto` 同文件）
3. 不在静态初始化上下文中解引用 cross-file class

### 7.4 OAS 双向 $ref（开放问题）

**问题描述**：当 A 和 B 都在彼此的 whitelist 中时：

- `ClientDtoWithRelation.profile → $ref ProfileDtoWithRelation`
- `ProfileDtoWithRelation.client → $ref ClientDtoWithRelation`

OAS 3.x spec 本身不会因此循环展开—$ref 是静态引用定义。但某些 code generator 或文档导出工具在处理双向 $ref 时可能递归爆炸。

**当前的接口方案**用 `Omit<ProfileWithRelations, 'client'>` 切掉反指字段解决。class 方案无法用 `Omit`，因为 class 属性存在就是存在。

**状态**：这是与 tsoa→Ts.ED 迁移正交的 OAS 设计问题，migration 中不阻塞，单独跟踪。暂不在本次 migration 中解决。备选方案包括：
- 生成"裁剪版" DtoWithRelation（每方向一个变体）
- 在 Ts.ED 的 `@Hidden()` 层按上下文控制
- 保持双向 $ref，接受 OAS 工具的行为

## 8. 迁移范围

### 8.1 Generator 改动清单

| 文件 | 改动 |
|------|------|
| `src/generators/interface/generator.ts` | **废弃** — 不再用 json-schema-to-typescript |
| `src/generators/dto/dto.generator.ts` | **新建** — JSON Schema → Dto class 生成器 |
| `src/generators/dto/dto.template.ts` | **新建** — Dto 模板函数 |
| `src/generators/dto/dtoWithRelation.template.ts` | **新建** — DtoWithRelation 模板函数 |
| `src/generators/db/typeormEntity.generator.ts` | 移除 `export *` pattern、移除 `Partial<Client>` |
| `src/generators/controller/controller.template.ts` | tsoa → Ts.ED 装饰器全套替换 |
| `src/generators/controller/controllers.generator.ts` | import path 从 `_types/` 改为 `_types/dtos/` |
| `src/generators/middlewares/RBACmiddleware.generator.ts` | 引用路径调整 |
| `src/generators/routes/routes.template.ts` | 废弃 tsoa `RegisterRoutes()` |
| `src/generators/routes/authController.template.ts` | tsoa → Ts.ED |
| `src/generators/projectSettings/tsoaConfig.generator.ts` | **废弃** — 不再生成 tsoa.json |
| `src/generators/projectSettings/package.template.json` | 替换 tsoa deps → Ts.ED deps |
| `src/generators/app/server.template.ts` | 从 `RegisterRoutes()` → `PlatformExpress.bootstrap()` |
| `src/generators/routes/routes.template.ts` | **废弃** — Ts.ED 无需 routes generator，控制器由 @Configuration.mount 管理 |
| `src/index.ts` (pipeline) | 删除 interface generator，加入 dto generator |

### 8.2 静态模板改动清单

| 文件 | 改动 |
|------|------|
| `_middlewares/tsoaAuthentication.ts` | **删除** |
| `_middlewares/Authentication.ts` | 重写为 Ts.ED `@Middleware()` class |
| `_middlewares/DataIsolationContext.ts` | 注册模式改为 Ts.ED |
| `_middlewares/JoinWhitelistMiddleware.ts` | 注册模式改为 Ts.ED |
| `_controllers/_ControllerFactory.ts` | 从 tsoa base class 改为 Ts.ED base controller |
| `_services/TypeOrmRepositoryAdapter.ts` | `VexRepository<T>` 兼容双类型参数 |
| `_types/vex/VexRepository.ts` | 保持 interface，泛型不变 |
| `_projectSettings/package.json` | +Ts.ED deps, -tsoa, -terser? |

## 9. 依赖变化

`package.json`（generated app，非本 repo）：

```json
// 移除
"tsoa": "^6.x",
"tsoa-express": "^...",

// 添加
"@tsed/common": "^8.x",
"@tsed/platform-express": "^8.x",
"@tsed/schema": "^8.x",
"@tsed/swagger": "^8.x",
```

本 repo 的 devDependencies 移除 `json-schema-to-typescript`（不再用于 interface 生成）。

## 10. Risky 区域

### 10.1 DtoWithRelation 反指字段导致 OAS 膨胀

如果 `ClientDtoWithRelation.profile` → `ProfileDtoWithRelation.client` → `ClientDtoWithRelation.profile`，Ts.ED 在 OAS 中生成双向引用。`$ref` 自身能处理，但 Swagger UI 展开时可能过深。

**缓解**：在 `ProfileDtoWithRelation` 上对 `client` 字段加 `@Hidden()` 或单独配置，按需控制反指是否进入 OAS。生成器可通过 FK metadata 判断是否生成反指的 `@Property()`。

### 10.2 VexRepository<Dto> 和 TypeORM<Entity> 之间的类型映射

`VexDb.getRepository(ClientEntity)` 当前返回 `VexRepository<ClientEntity>`（因为泛型从实体推断）。迁移后 Controller 需要 `VexRepository<ClientDto>`。

**缓解**：`VexDb.getRepository()` 添加显式泛型参数重载，或用 `as VexRepository<ClientDto>` 断言。在生成器中直接生成断言。

### 10.3 现有 output 目录用户 hand-edit 的 controller 文件

全量切换后，旧的 tsoa controller 文件与新的 Ts.ED controller 完全不兼容。用户如果在 output 里手改过 controller，迁移后全部失效。

**缓解**：在 CHANGELOG/tag 中标记 breaking change。用户需备份自定义 controller，重新生成后手动迁移自定义逻辑到 Ts.ED 模式。新版的 `.vex/meta.json` 增加 do-not-overwrite 标记用于处理"已经在 output 手改过的文件"。

## 11. 迁移策略

全量做完再切（在 `migrate_to_tsed` 分支上完成所有 generator 改动，一次合并到 main）。

### 上线检查清单

- [ ] 用一组典型 JSON Schema 跑 `vex`，确认 `_types/dtos/*` 生成正确
- [ ] 确认 `ClientDto` 不包含敏感字段、不包含未 whitelisted 的 relation
- [ ] 确认 `ClientDtoWithRelation` 包含 whitelisted relation
- [ ] 确认 `ClientEntity` 独立生成且与 Dto 无继承关系
- [ ] 确认 Controller 用 `@BodyParams() body: ClientDto`（非 Entity）
- [ ] 确认 Controller 返回类型用 `ClientDtoWithRelation`（非 Entity）
- [ ] 启动 generated app，确认 Ts.ED 启动正常
- [ ] 访问 `/swagger`，确认 OAS 完整且不含 DB 内部字段
- [ ] 测试 POST body 不接受的字段被 Ts.ED 自动忽略/拒绝
- [ ] 测试 GET 返回含 whitelisted relation
- [ ] 测试 joinWhitelist middleware 拒绝未授权的 relation join
- [ ] 确认 OAuth 登录流程正常（保留 Express Router）
- [ ] 确认 LoginUI 页面正常
