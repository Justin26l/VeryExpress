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
        [`@SuccessResponse(200, "Success", typeof VexResponse<${documentName}[]>)`, "@Post(\"/search\")"],
        `public async getList${documentName}(@Body() body: { filter: Filter, join?: Join, select?: Select }): Promise<typeof VexResponse<${documentName}[]>>`,
        `const result = await this.repo.find(body.filter, body.join, body.select);
        throw new VexResponse(200, { result });`
    );

    const getRoute = buildMethod(
        methods.includes("get"),
        [`@SuccessResponse(200, "Success", typeof VexResponse<${documentName}>)`, "@Get(\"{id}\")"],
        `public async get${documentName}(${idParam}, @Query() join?: Join, @Query() select?: Select): Promise<typeof VexResponse<${documentName}>>`,
        `const result = await this.repo.findOne({ _id: id }, join, select);
        if (!result) throw new VexResponseError(404);
        throw new VexResponse(200, { result });`
    );

    const postRoute = buildMethod(
        methods.includes("post"),
        [`@SuccessResponse(201, "Created", typeof VexResponse<${documentName}>)`, "@Post()"],
        `public async create${documentName}(@Body() body: ${documentName}): Promise<typeof VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.create(body);
        if (!result) throw new VexResponseError(400);
        this.setStatus(201);
        throw new VexResponse(201, { result });`
    );

    const putRoute = buildMethod(
        methods.includes("put"),
        [`@SuccessResponse(200, "Success", typeof VexResponse<${documentName}>)`, "@Put(\"{id}\")"],
        `public async replace${documentName}(${idParam}, @Body() body: ${documentName}): Promise<typeof VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.replace(id, body);
        if (!result) throw new VexResponseError(404);
        throw new VexResponse(200, { result });`
    );

    const patchRoute = buildMethod(
        methods.includes("patch"),
        [`@SuccessResponse(200, "Success", typeof VexResponse<${documentName}>)`, "@Patch(\"{id}\")"],
        `public async update${documentName}(${idParam}, @Body() body: Partial<${documentName}>): Promise<typeof VexResponse<${documentName}>>`,
        `${cleanId}
        const result = await this.repo.update(id, body);
        if (!result) throw new VexResponseError(404);
        throw new VexResponse(200, { result });`
    );

    const deleteRoute = buildMethod(
        methods.includes("delete"),
        ["@SuccessResponse(204, \"No Content\")", "@Delete(\"{id}\")"],
        `public async delete${documentName}(${idParam}): Promise<void>`,
        `const existing = await this.repo.findOne({ _id: id });
        if (!existing) throw new VexResponseError(404);
        await this.repo.delete(id);
        throw new VexResponse(204);`
    );

    const source = `{{headerComment}}
import { ${decoratorNames.join(", ")} } from "tsoa";
import * as controllerFactory from "./_ControllerFactory.gen";
import { IVexRepository } from "../_types/IVexRepository.gen";
import { Select, Filter, Join } from "../_types/VexRequest.gen";
import VexResponse from "../_types/VexResponse.gen";
import VexResponseError from "../_types/VexResponseError.gen";
import VexDb from "../_services/VexDb.gen";

${optionalImports}

import { ${documentName}Entity } from "${modelPath}";
import { ${documentName} } from "${typePath}";

${classDecorators}export class ${documentName}Controller extends controllerFactory._ControllerFactory {
    private get repo(): IVexRepository<${documentName}> {
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
