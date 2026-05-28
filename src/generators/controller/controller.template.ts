import * as types from "../../types/types";
import utils from "~/utils";

export type TsoaFieldDef = {
    name: string;
    tsType: string;
    required: boolean;
};

export default function controllerTemplate(templateOptions: {
    modelPath: string;
    typePath: string;
    documentName: string;
    fields: TsoaFieldDef[];
    idType: string;
    restApiMethods: string[];
    restApiNoRelations?: boolean;
    restApiJoinWhitelist?: boolean;
    compilerOptions: types.compilerOptions;
    dataIsolation?: types.DataIsolationConfig;
}): string {
    const { documentName, idType, restApiMethods, restApiNoRelations, restApiJoinWhitelist, compilerOptions, modelPath, typePath, dataIsolation } = templateOptions;
    const useRBAC = !!compilerOptions.useRBAC;
    const useAuth = compilerOptions.auth.localAuth || utils.generator.OAuthProviders(compilerOptions).length > 0;
    const cleanId = compilerOptions.app.allowApiCreateUpdate_id
        ? ""
        : "if ((body as any)._id) delete (body as any)._id;";
    const routePath = documentName.toLowerCase();

    // body fields — exclude _id (auto-generated primary key)
    // const bodyFields = fields.filter(f => f.name !== "_id");

    // ── tsoa decorator imports ──────────────────────────────────────────────────
    const decoratorNames: string[] = [];
    decoratorNames.push("Route", "Tags", "Body", "Path", "Query", "SuccessResponse");
    if (useRBAC || restApiJoinWhitelist || dataIsolation) decoratorNames.push("Middlewares");
    if (useRBAC) decoratorNames.push("Security");
    if (restApiMethods.includes("get"))                                decoratorNames.push("Get");
    if (restApiMethods.includes("post") || restApiMethods.includes("getList")) decoratorNames.push("Post");
    if (restApiMethods.includes("put"))                                decoratorNames.push("Put");
    if (restApiMethods.includes("patch"))                              decoratorNames.push("Patch");
    if (restApiMethods.includes("delete"))                             decoratorNames.push("Delete");

    const optionalImports = [
        useRBAC ? "import RoleBaseAccessControl from \"../_middlewares/RoleBaseAccessControl.gen\";" : "",
        useAuth ? "import Authentication from \"../_middlewares/Authentication.gen\";" : "",
        restApiJoinWhitelist ? "import JoinWhitelistMiddleware from \"../_middlewares/JoinWhitelistMiddleware.gen\";" : "",
        dataIsolation ? "import DataIsolationContext from \"../_middlewares/DataIsolationContext.gen\";" : "",
    ].filter(Boolean).join("\n");

    // ── Class decorators ────────────────────────────────────────────────────────
    const classDecoratorLines: string[] = [];
    classDecoratorLines.push(`@Route("${routePath}")`);
    classDecoratorLines.push(`@Tags("${documentName}")`);
    if (useRBAC) classDecoratorLines.push(`@Middlewares(RoleBaseAccessControl.middleware("${documentName}"))`);
    if (useAuth) {
        if (dataIsolation) classDecoratorLines.push("@Middlewares(DataIsolationContext.middleware)");
        classDecoratorLines.push("@Middlewares(Authentication.middleware)");
        classDecoratorLines.push("@Security(\"BearerAuth\")");
        classDecoratorLines.push("@Security(\"AuthIndex\")");
    }
    const classDecorators = classDecoratorLines.length > 0 ? classDecoratorLines.join("\n") + "\n" : "";

    // ── id parameter ────────────────────────────────────────────────────────────
    const idParam = idType === "string" ? "@Path() id: string" : "@Path() id: number";

    // ── Vex type imports per route ──────────────────────────────────────────────
    const alwaysVexImports = ["VexRepository", "VexResponse", "VexResErr", "VexResOk", "Filter", "FieldFilter"];
    const routeVexImports: Record<string, string[]> = {
        getList: ["VexPagination", "PaginatedResult"],
        get: [],
        post: [],
        put: [],
        patch: [],
        delete: [],
    };
    const enabledVexImports = [...alwaysVexImports];
    for (const method of restApiMethods) {
        const add = routeVexImports[method];
        if (add) enabledVexImports.push(...add);
    }
    const vexImports = [...new Set(enabledVexImports)].join(", ");

    // ── Route method builder ────────────────────────────────────────────────────
    function buildMethod(
        enabled: boolean,
        decorators: string[],
        signature: string,
        body: string
    ): string {
        if (!enabled) return `// ${decorators[0].replace(/^@/, "")} disabled`;
        return `${decorators.join("\n    ")}\n    ${signature} {\n        ${body}\n    }`;
    }

    // Join whitelist decorator — only applied to routes that accept join params
    const joinWhitelistDecorator = restApiJoinWhitelist
        ? `@Middlewares(JoinWhitelistMiddleware.middleware("${documentName}"))`
        : null;

    const getListRoute = buildMethod(
        restApiMethods.includes("getList"),
        [
            "@Post(\"/search\")",
            `@SuccessResponse(200, "Success")`,
            ...(joinWhitelistDecorator ? [joinWhitelistDecorator] : []),
        ],
        `public async getList${documentName}(@Body() body: { filter: Filter${documentName}, join?: string[], select?: string[], pagination?: VexPagination }): Promise<VexResponse<${documentName}${restApiNoRelations ? '' : 'WithApiRelations'}[] | PaginatedResult<${documentName}${restApiNoRelations ? '' : 'WithApiRelations'}>>>`,
        `if (body.pagination) {
            const data = await this.repo.find(body.filter as Filter<${documentName}>, body.join, body.select, body.pagination);
            const total = await this.repo.count(body.filter as Filter<${documentName}>);
            throw new VexResOk(200, { result: { data, total, page: body.pagination.page || 1, perPage: body.pagination.perPage || 20 } });
        }
        const result = await this.repo.find(body.filter as Filter<${documentName}>, body.join, body.select);
        throw new VexResOk(200, { result });`
    );

    const getRoute = buildMethod(
        restApiMethods.includes("get"),
        [
            "@Get(\"{id}\")",
            `@SuccessResponse(200, "Success")`,
            ...(joinWhitelistDecorator ? [joinWhitelistDecorator] : []),
        ],
        `public async get${documentName}(${idParam}, @Query() join?: string[], @Query() select?: string[]): Promise<VexResponse<${documentName}${restApiNoRelations ? '' : 'WithApiRelations'}>>`,
        `const result = await this.repo.findOne({ _id: id }, join, select);
        if (!result) throw new VexResErr(404);
        throw new VexResOk(200, { result });`
    );

    const postRoute = buildMethod(
        restApiMethods.includes("post"),
        ["@Post()", `@SuccessResponse(201, "Created")`],
        `public async create${documentName}(@Body() body: ${documentName}): Promise<VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.create(body);
        if (!result) throw new VexResErr(400);
        this.setStatus(201);
        throw new VexResOk(201, { result });`
    );

    const putRoute = buildMethod(
        restApiMethods.includes("put"),
        ["@Put(\"{id}\")", `@SuccessResponse(200, "Success")`],
        `public async replace${documentName}(${idParam}, @Body() body: ${documentName}): Promise<VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.replace(id, body);
        if (!result) throw new VexResErr(404);
        throw new VexResOk(200, { result });`
    );

    const patchRoute = buildMethod(
        restApiMethods.includes("patch"),
        ["@Patch(\"{id}\")", `@SuccessResponse(200, "Success")`],
        `public async update${documentName}(${idParam}, @Body() body: Partial<${documentName}>): Promise<VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.update(id, body);
        if (!result) throw new VexResErr(404);
        throw new VexResOk(200, { result });`
    );

    const deleteRoute = buildMethod(
        restApiMethods.includes("delete"),
        ["@Delete(\"{id}\")", `@SuccessResponse(204, "No Content")`],
        `public async delete${documentName}(${idParam}): Promise<VexResponse<void>>`,
        `const existing = await this.repo.findOne({ _id: id });
        if (!existing) throw new VexResErr(404);
        await this.repo.delete(id);
        throw new VexResOk(204);`
    );

    const source = `{{headerComment}}
import { ${decoratorNames.join(", ")} } from "tsoa";
import * as controllerFactory from "./_ControllerFactory.gen";
import { ${vexImports} } from "../_types/vex";
import VexDb from "../_services/VexDb.gen";

${optionalImports}

import { ${documentName}Entity } from "${modelPath}";
import { ${documentName}, ${documentName}WithApiRelations } from "${typePath}";

// extra type defined due to tsoa cannot capture runtime generic types,
// this will make OAS have complete input parameters & correct validation
export type Filter${documentName} = { [K in keyof ${documentName}]?: FieldFilter<${documentName}[K]> } & Filter<${documentName}>;

${classDecorators}export class ${documentName}Controller extends controllerFactory._ControllerFactory {
    private get repo(): VexRepository<${documentName}> {
        return VexDb.getRepository(${documentName}Entity);
    }

    ${getListRoute}

    ${getRoute}

    ${postRoute}

    ${putRoute}

    ${patchRoute}

    ${deleteRoute}
}
`;

    return utils.template.format(source);
}
