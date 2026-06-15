# tsoa → Ts.ED Migration Design

Date: 2026-06-10
Status: Draft
Branch: `migrate_to_tsed`

## 1. Motivation

当前 VeryExpress 用 tsoa 做路由注册 + OpenAPI 生成。tsoa 是编译期方案，读 TypeScript AST 从 `interface` 提取类型信息。缺点是 tsoa 维护长期不活跃，生态停滞。Ts.ED 是运行时方案，通过类装饰器注册 metadata，直接生成 OAS。

## 2. 核心架构

### 2.1 三层分离（安全边界）

Dto 和 Entity 完全独立生成（无继承关系），Entity 上的敏感字段不可能通过 Dto → OAS 链泄露。

```
OAS ← Ts.ED 从 @Property() 生成
  │
Controller ← Ts.ED @Controller, 引用 Dto
  │
Dto Layer  ← Ts.ED class @Property()
  ├── ClientDto                 — 纯字段, 输入用 (POST/PUT body, Filter, VexRepository)
  └── ClientDtoWithRelation     — extends ClientDto, + whitelist relation, 输出用 (GET response)
  │
─── 安全边界 ───
  │
Entity Layer ← TypeORM class @Column(), 无 @Property(), 含敏感字段
  └── ClientEntity              — DB 全量字段 + 全量 relation
  │
DB (PostgreSQL)
```

### 2.2 每个 Schema 生成 5 个文件

| 文件 | 类型 | 装饰器 | 用途 |
|------|------|--------|------|
| `_types/dtos/{Doc}Dto.gen.ts` | class | `@Property()` | 输入 body、Filter、VexRepository 绑定 |
| `_types/dtos/{Doc}DtoWithRelation.gen.ts` | class extends `{Doc}Dto` | `@Property(() => Target)` | 输出 response、带 whitelist relation |
| `_models/{Doc}Model.gen.ts` | class | `@Entity/@Column/@XtoY` | DB 实体，无 `@Property()` |
| `_controllers/{Doc}Controller.gen.ts` | class | `@Controller/@Get/@BodyParams` | Ts.ED 路由 handler |
| `_types/{Doc}.gen.ts` | enum + 工具 type | 无 | 枚举声明、Filter 辅助类型 |

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

- 不包含任何 relation 字段 — 保证 POST/PUT body 不接受 `profile: {...}`
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

### 3.3 枚举

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
import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";
import { ClientTypeEnum } from "../_types/Client.gen";

@Entity("client")
export class ClientEntity {
    @PrimaryGeneratedColumn("uuid")
    _id!: string;

    @Column({ type: "varchar", length: 100 })
    name!: string;

    @Column({ type: "varchar" })
    passwordHash!: string;           // 敏感字段 — 不在 Dto 中

    @Column({ type: "enum", enum: ClientTypeEnum })
    clientType?: ClientTypeEnum;
}
```

- 无 `@Property()` — 不做 OAS 源头
- 含全部 DB 字段 + 全量 relation
- 当前 `export * from "../_types/..."` 废弃 — Dto 独立 import

## 5. Controller 设计

### 5.1 装饰器映射

| tsoa | Ts.ED |
|------|-------|
| `@Route("client")` | `@Controller("/client")` |
| `@Tags("Client")` | `@Tag("Client")` |
| `@Get("{id}")` | `@Get("/:id")` |
| `@Post()` | `@Post()` |
| `@Put("{id}")` | `@Put("/:id")` |
| `@Patch("{id}")` | `@Patch("/:id")` |
| `@Delete("{id}")` | `@Delete("/:id")` |
| `@Body() body: Client` | `@BodyParams() body: ClientDto` |
| `@Path() id: string` | `@PathParams("id") id: string` |
| `@Query() join` | `@QueryParams("join") join: string[]` |
| `@Middlewares(Auth.mid)` | `@UseBefore(AuthMiddleware)` |
| `@Security("BearerAuth")` | `@Security("BearerAuth")` |

### 5.2 Controller 模板输出

```ts
// _controllers/ClientController.gen.ts
import { Controller, Get, Post, BodyParams, PathParams, QueryParams, UseBefore } from "@tsed/common";
import { Tag, Security, Property, Required } from "@tsed/schema";

import { ClientDto } from "../_types/dtos/ClientDto.gen";
import { ClientDtoWithRelation } from "../_types/dtos/ClientDtoWithRelation.gen";
import { ClientEntity } from "../_models/ClientModel.gen";

import { VexRepository, VexResponse, Filter, FieldFilter } from "../_types/vex";
import VexDb from "../_services/VexDb.gen";
import * as controllerFactory from "./_ControllerFactory.gen";

export type FilterClientDto = { [K in keyof ClientDto]?: FieldFilter<ClientDto[K]> } & Filter<ClientDto>;

@Controller("/client")
@Tag("Client")
@UseBefore(AuthenticationMiddleware)
export class ClientController extends controllerFactory._ControllerFactory {
    private get repo(): VexRepository<ClientDto> {
        return VexDb.getRepository(ClientEntity) as VexRepository<ClientDto>;
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

```ts
// 当前: import { Controller } from "tsoa";
// 迁移后:
import { Controller } from "@tsed/common";

export class _ControllerFactory extends Controller {
    protected isObjectId(id: string): boolean {
        return /^[0-9a-fA-F]{24}$/.test(id);
    }
}
```

### 5.4 VexRepository 绑定 Dto

Controller 的 repo 绑定到 `ClientDto`（纯字段），底层 `VexDb.getRepository(ClientEntity)` 执行 ORM 操作。通过类型断言桥接：

```ts
private get repo(): VexRepository<ClientDto> {
    return VexDb.getRepository(ClientEntity) as VexRepository<ClientDto>;
}
```

### 5.5 Filter 类型

`keyof ClientDto` 在纯数据 class 上等价于 `keyof` interface—类型完整：

```ts
export type FilterClientDto = { [K in keyof ClientDto]?: FieldFilter<ClientDto[K]> } & Filter<ClientDto>;
```

Filter 类型是编译期类型工具，不影响 OAS。

## 6. 静态模板迁移

### 6.1 Middlewares

| 当前文件 | 迁移后 |
|---------|--------|
| `tsoaAuthentication.ts` | ❌ 废弃 |
| `Authentication.ts` | Ts.ED `@Middleware()` class |
| `DataIsolationContext.ts` | Ts.ED `@Middleware()` |
| `JoinWhitelistMiddleware.ts` | Ts.ED `@Middleware()` + 补充循环路径检测 |

Authentication 迁移示例：

```ts
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

| 文件 | 迁移后 |
|------|--------|
| `authController.template.ts` | Ts.ED `@Controller` |
| `authRoute.template.ts` | 保留 Express Router (OAuth redirect) |
| `LoginUI.ts` | 保留 Express Router (HTML pages) |
| `OAuthRouteFactory.ts` | 保留 Express Router (passport callbacks) |
| `routes.template.ts` | **废弃** — 由 `@Configuration.mount` 替代 |

### 6.3 Server entrypoint

**迁移前**:
```ts
import { RegisterRoutes } from "./system/_routes/tsoa_routes";
async function main() {
    const app = express();
    RegisterRoutes(app);
    app.use("/api/auth", AuthRoute.getRouter());
    app.use("/", loginUI.getRouter());
}
```

**迁移后**:
```ts
import { PlatformExpress } from "@tsed/platform-express";
import { Configuration } from "@tsed/common";

@Configuration({
    mount: { "/": [ClientController, AuthController] },
    swagger: [{ path: "/swagger", specVersion: "3.0.3" }],
})
export class AppModule {}

async function main() {
    const platform = await PlatformExpress.bootstrap(AppModule);
    const app = platform.expressApp;
    app.use("/api/auth", AuthRoute.getRouter());
    app.use("/", loginUI.getRouter());
    await platform.listen();
}
```

### 6.4 Services

所有 services 保持 static class，不引入 `@Injectable()`：
`VexDb`、`VexSystem`、`JWTService`、`JWTKeyStore`、`OAuthStrategyService`、`TypeOrmRepositoryAdapter`、`MongooseRepositoryAdapter`

### 6.5 OAS 生成

Ts.ED 从 `@Property()` 装饰器注册的 metadata 自动生成 OpenAPI spec，在 `@Configuration.swagger` 中指定 mount 路径。不再生成 `tsoa.json`。

## 7. 循环引用处理

### 7.1 现状（interface）

```ts
type ClientWithRelations = Client & {
    profile?: Omit<ProfileWithRelations, 'client'>;
}
```

Omit 切断类型展开递归。

### 7.2 Class 方案（TypeScript 层面）

Class property 惰性解析，不需要 Omit：

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

TypeScript 不会贪心展开 class property chain。循环 import 由 thunk `() => Target` 解决（调用时模块已加载）。

### 7.3 OAS 双向 \$ref（开放问题）

当 A 和 B 都在彼此的 whitelist 中时：
- `ClientDtoWithRelation.profile → $ref ProfileDtoWithRelation`
- `ProfileDtoWithRelation.client → $ref ClientDtoWithRelation`

OAS 3.x spec 本身不会因此循环展开——$ref 是静态引用定义。但某些 code generator 在解析双向 $ref 时可能出问题。

**状态**：与 tsoa→Ts.ED 迁移正交，不阻塞 migration，单独跟踪。

## 8. 迁移范围

### 8.1 Generator 改动

| 文件 | 改动 |
|------|------|
| `src/generators/interface/generator.ts` | **废弃** |
| `src/generators/dto/dto.generator.ts` | **新建** — JSON Schema → Dto class |
| `src/generators/dto/dto.template.ts` | **新建** — Dto 模板 |
| `src/generators/dto/dtoWithRelation.template.ts` | **新建** — DtoWithRelation 模板 |
| `src/generators/db/typeormEntity.generator.ts` | 移除 `export *`、移除 `Partial<Client>` |
| `src/generators/controller/controller.template.ts` | tsoa → Ts.ED 装饰器全套替换 |
| `src/generators/controller/controllers.generator.ts` | import path `_types/` → `_types/dtos/` |
| `src/generators/middlewares/RBACmiddleware.generator.ts` | 引用路径调整 |
| `src/generators/routes/routes.template.ts` | **废弃** |
| `src/generators/routes/authController.template.ts` | tsoa → Ts.ED |
| `src/generators/projectSettings/tsoaConfig.generator.ts` | **废弃** |
| `src/generators/projectSettings/package.template.json` | tsoa deps → Ts.ED deps |
| `src/generators/app/server.template.ts` | RegisterRoutes → PlatformExpress.bootstrap |
| `src/index.ts` (pipeline) | 删 interface generator, 加 dto generator |

### 8.2 静态模板改动

| 文件 | 改动 |
|------|------|
| `_middlewares/tsoaAuthentication.ts` | **删除** |
| `_middlewares/Authentication.ts` | 重写为 Ts.ED `@Middleware()` |
| `_middlewares/DataIsolationContext.ts` | 注册模式改 Ts.ED |
| `_middlewares/JoinWhitelistMiddleware.ts` | 注册模式改 Ts.ED |
| `_controllers/_ControllerFactory.ts` | tsoa `Controller` → Ts.ED `Controller` |
| `_projectSettings/package.json` | +Ts.ED deps, -tsoa |

## 9. 依赖变化

generated app 的 `package.json`：
```json
// 移除
"tsoa": "^6.x"
// 添加
"@tsed/common": "^8.x",
"@tsed/platform-express": "^8.x",
"@tsed/schema": "^8.x",
"@tsed/swagger": "^8.x"
```

本 repo 移除 `json-schema-to-typescript`。

## 10. 迁移策略

全量做完再切：在 `migrate_to_tsed` 分支上完成所有 generator 改动，一次合并到 main。

### 上线检查清单

- [ ] `_types/dtos/*` 生成正确
- [ ] ClientDto 不包含敏感字段、不包含未 whitelisted relation
- [ ] ClientDtoWithRelation 包含 whitelisted relation
- [ ] Entity 独立生成且与 Dto 无继承关系
- [ ] Controller 用 `@BodyParams() body: ClientDto`（非 Entity）
- [ ] Controller 返回用 `ClientDtoWithRelation`（非 Entity）
- [ ] Ts.ED 启动正常
- [ ] OAS 完整且不含 DB 内部字段
- [ ] POST body 不接受 relation 字段
- [ ] joinWhitelist middleware 正常工作
- [ ] OAuth 登录流程正常
- [ ] LoginUI 页面正常
