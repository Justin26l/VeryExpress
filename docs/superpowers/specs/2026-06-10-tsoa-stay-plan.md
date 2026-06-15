# 保留 tsoa + WoType 修复方案

Date: 2026-06-10
Status: Pre-implementation plan

## 问题

tsoa 不解析 `Omit<ProfileWithApiRelations, 'client'>[]`，OAS 输出退化为 `Object[]`，relation 字段在 OAS 中丢失 schema 结构。

## 修复：WoType（extends + 反指字段置 null）

用生成器产出一个 `Wo{BackRef}` 后缀的 interface，`extends` 原 type，覆盖反指字段为 `null`：

```ts
// _types/Client.gen.ts（新增）

interface ProfileWithApiRelationsWoClient extends ProfileWithApiRelations {
    client?: null;
}

interface ClientApiRelations {
    profile?: ProfileWithApiRelationsWoClient[];
}

export type ClientWithApiRelations = Client & ClientApiRelations;
```

```ts
// _types/Profile.gen.ts（新增）

interface ClientWithApiRelationsWoProfile extends ClientWithApiRelations {
    profile?: null;
}

interface ProfileApiRelations {
    client?: ClientWithApiRelationsWoProfile;
}

export type ProfileWithApiRelations = Profile & ProfileApiRelations;
```

### 为什么可行

- tsoa 能解析 `extends`——原生语法
- `client?: null` 在 OAS 中为 `type: null`，**不产生 `$ref` 回路**
- extends 继承正常字段的 OAS schema，relation 结构完整
- TypeScript 层面 `profile.client` 类型为 `null`，访问有 lint 警告，需要 `as` 绕过

## 改动

### 1. `src/generators/interface/generator.ts`

`applyFkToInterface()` 中：

```diff
- const typeString = `Omit<${interfaceName}, '${utils.common.camelCase(currentDocumnetName)}'>`;
+ const backRefName = utils.common.camelCase(currentDocumnetName);
+ const woTypeName = `${interfaceName}Wo${utils.common.pascalCase(backRefName)}`;
+ const typeString = `${woTypeName}${isArray}`;
```

收集所有 woTypes，在 ApiRelations 块之前输出：

```ts
interface ${woTypeName} extends ${interfaceName} {
    ${backRefName}?: null;
}
```

预计算 import — `interfaceName` (e.g. `ProfileWithApiRelations`) 需要 import，woType 本身在本文件内不额外 import。

### 2. `_middlewares/JoinWhitelistMiddleware.ts`

加 visited set 防止 join 路径循环：

```ts
const visited = new Set([rootDocumentName]);
// 每段 join 后检查 currentDoc 是否 visited
```

## 总改动

| 文件 | 改动 | 行数 |
|------|------|------|
| `src/generators/interface/generator.ts` | `applyFkToInterface()` Omit → WoType `extends + null` | ~30 |
| `_middlewares/JoinWhitelistMiddleware.ts` | visited set 循环检测 | ~5 |
