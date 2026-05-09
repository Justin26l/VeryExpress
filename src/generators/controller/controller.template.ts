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
    methods: string[];
    fields: TsoaFieldDef[];
    idType: string;
    skipRoute: boolean;
    compilerOptions: types.compilerOptions;
}): string {
    const { documentName, fields, methods, idType, compilerOptions, skipRoute, modelPath, typePath } = templateOptions;
    const useRBAC = !!compilerOptions.useRBAC;
    const useAuth = compilerOptions.auth.localAuth || utils.generator.OAuthProviders(compilerOptions).length > 0;
    const cleanId = compilerOptions.app.allowApiCreateUpdate_id
        ? ""
        : "if ((body as any)._id) delete (body as any)._id;";
    const routePath = documentName.toLowerCase();

    // body fields — exclude _id (auto-generated primary key)
    const bodyFields = fields.filter(f => f.name !== "_id");

    // ── tsoa decorator imports ──────────────────────────────────────────────────
    const decoratorNames: string[] = [];
    if (!skipRoute) {
        decoratorNames.push("Route", "Tags", "Body", "Path", "Query", "SuccessResponse");
        if (useRBAC) decoratorNames.push("Middlewares", "Security");
        if (methods.includes("get"))                                decoratorNames.push("Get");
        if (methods.includes("post") || methods.includes("getList")) decoratorNames.push("Post");
        if (methods.includes("put"))                                decoratorNames.push("Put");
        if (methods.includes("patch"))                              decoratorNames.push("Patch");
        if (methods.includes("delete"))                             decoratorNames.push("Delete");
    }

    const optionalImports = [
        useRBAC && !skipRoute ? "import RoleBaseAccessControl from \"../_middlewares/RoleBaseAccessControl.gen\";" : "",
        useAuth && !skipRoute ? "import Authentication from \"../_middlewares/Authentication.gen\";" : ""
    ].filter(Boolean).join("\n");

    // ── Class decorators ────────────────────────────────────────────────────────
    const classDecoratorLines: string[] = [];
    if (!skipRoute) {
        classDecoratorLines.push(`@Route("${routePath}")`);
        classDecoratorLines.push(`@Tags("${documentName}")`);
        if (useRBAC) classDecoratorLines.push(`@Middlewares(new RoleBaseAccessControl("${documentName}").middleware)`);
        if (useAuth) {
            classDecoratorLines.push("@Middlewares(new Authentication().middleware)");
            classDecoratorLines.push("@Security(\"BearerAuth\")");
            classDecoratorLines.push("@Security(\"AuthIndex\")");
        }
    }
    const classDecorators = classDecoratorLines.length > 0 ? classDecoratorLines.join("\n") + "\n" : "";

    // ── id parameter ────────────────────────────────────────────────────────────
    const idParam = idType === "string" ? "@Path() id: string" : "@Path() id: number";

    // ── Route method builder ────────────────────────────────────────────────────
    function buildMethod(
        enabled: boolean,
        decorators: string[],
        signature: string,
        body: string
    ): string {
        if (!enabled || skipRoute) return `// ${decorators[decorators.length - 1].replace(/^@/, "")} disabled`;
        return `${decorators.join("\n    ")}\n    ${signature} {\n        ${body}\n    }`;
    }

    const getListRoute = buildMethod(
        methods.includes("getList"),
        ["@Post(\"/search\")", `@SuccessResponse(200, "Success")`],
        `public async getList${documentName}(@Body() body: { filter: Filter${documentName}, join?: string[], select?: string[] }): Promise<VexResponse<${documentName}WithRelations[]>>`,
        `const result = await this.repo.find(body.filter as Filter<${documentName}>, body.join, body.select);
        throw new VexResOk(200, { result });`
    );

    const getRoute = buildMethod(
        methods.includes("get"),
        ["@Get(\"{id}\")", `@SuccessResponse(200, "Success")`],
        `public async get${documentName}(${idParam}, @Query() join?: string[], @Query() select?: string[]): Promise<VexResponse<${documentName}WithRelations>>`,
        `const result = await this.repo.findOne({ _id: id }, join, select);
        if (!result) throw new VexResErr(404);
        throw new VexResOk(200, { result });`
    );

    const postRoute = buildMethod(
        methods.includes("post"),
        ["@Post()", `@SuccessResponse(201, "Created")`],
        `public async create${documentName}(@Body() body: ${documentName}): Promise<VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.create(body);
        if (!result) throw new VexResErr(400);
        this.setStatus(201);
        throw new VexResOk(201, { result });`
    );

    const putRoute = buildMethod(
        methods.includes("put"),
        ["@Put(\"{id}\")", `@SuccessResponse(200, "Success")`],
        `public async replace${documentName}(${idParam}, @Body() body: ${documentName}): Promise<VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.replace(id, body);
        if (!result) throw new VexResErr(404);
        throw new VexResOk(200, { result });`
    );

    const patchRoute = buildMethod(
        methods.includes("patch"),
        ["@Patch(\"{id}\")", `@SuccessResponse(200, "Success")`],
        `public async update${documentName}(${idParam}, @Body() body: Partial<${documentName}>): Promise<VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.update(id, body);
        if (!result) throw new VexResErr(404);
        throw new VexResOk(200, { result });`
    );

    const deleteRoute = buildMethod(
        methods.includes("delete"),
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
import { VexRepository, VexResponse, VexResErr, VexResOk, Select, Filter, Join, FieldFilter } from "../_types/vex";
import VexDb from "../_services/VexDb.gen";

${optionalImports}

import { ${documentName}Entity } from "${modelPath}";
import { ${documentName}, ${documentName}WithRelations } from "${typePath}";

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
