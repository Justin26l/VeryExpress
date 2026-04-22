import * as types from "../../types/types";
import utils from "~/utils";

export type TsoaFieldDef = {
    name: string;
    tsType: string;
    required: boolean;
};

export default function controllerTemplate(templateOptions: {
    modelPath: string;
    documentName: string;
    methods: string[];
    fields: TsoaFieldDef[];
    idType: "string" | "number";
    skipRoute: boolean;
    compilerOptions: types.compilerOptions;
}): string {
    const { documentName, fields, methods, idType, compilerOptions, skipRoute, modelPath } = templateOptions;
    const useRBAC = !!compilerOptions.useRBAC;
    const cleanId = compilerOptions.app.allowApiCreateUpdate_id
        ? ""
        : `if ((body as any)._id) delete (body as any)._id;`;
    const routePath = documentName.toLowerCase();

    // body fields — exclude _id (auto-generated primary key)
    const bodyFields = fields.filter(f => f.name !== "_id");

    // ── tsoa decorator imports ──────────────────────────────────────────────────
    const decoratorNames: string[] = [];
    if (!skipRoute) {
        decoratorNames.push("Route", "Tags");
        if (methods.includes("get"))                               decoratorNames.push("Get");
        if (methods.includes("post") || methods.includes("getList")) decoratorNames.push("Post");
        if (methods.includes("put"))                               decoratorNames.push("Put");
        if (methods.includes("patch"))                             decoratorNames.push("Patch");
        if (methods.includes("delete"))                            decoratorNames.push("Delete");
        decoratorNames.push("Body", "Path");
        if (useRBAC) decoratorNames.push("Middlewares");
    }

    const tsoaImportLine = decoratorNames.length > 0
        ? `import { ${decoratorNames.join(", ")} } from "tsoa";`
        : "";

    const rbacImportLine = useRBAC && !skipRoute
        ? `import RoleBaseAccessControl from "../_middlewares/RoleBaseAccessControl.gen";`
        : "";

    // ── Class decorators ────────────────────────────────────────────────────────
    const classDecoratorLines: string[] = [];
    if (!skipRoute) {
        classDecoratorLines.push(`@Route("${routePath}")`);
        classDecoratorLines.push(`@Tags("${documentName}")`);
        if (useRBAC) classDecoratorLines.push(`@Middlewares(new RoleBaseAccessControl("${documentName}").middleware)`);
    }
    const classDecorators = classDecoratorLines.length > 0 ? classDecoratorLines.join("\n") + "\n" : "";

    // ── Request body interfaces ─────────────────────────────────────────────────
    const renderFields = (partial: boolean) =>
        bodyFields.map(f => `    ${f.name}${partial || !f.required ? "?" : ""}: ${f.tsType};`).join("\n");

    const bodyInterfaces = bodyFields.length === 0 ? "" : `
interface ${documentName}Body {
${renderFields(false)}
}

interface ${documentName}PartialBody {
${renderFields(true)}
}
`;

    // ── id parameter ────────────────────────────────────────────────────────────
    const idParam = idType === "string" ? "@Path() id: string" : "@Path() id: number";

    // ── Route method builder ────────────────────────────────────────────────────
    function buildMethod(enabled: boolean, decorator: string, signature: string, body: string): string {
        if (!enabled || skipRoute) return `// ${decorator.replace(/^@/, "")} disabled`;
        return `${decorator}\n    ${signature} {\n        ${body}\n    }`;
    }

    const getListRoute = buildMethod(
        methods.includes("getList"),
        `@Post("/search")`,
        `public async getList${documentName}(@Body() body: { _filter?: Record<string, unknown> }): Promise<{ result: unknown[] }>`,
        `const result = await this.repo.find({ where: body._filter as FindOptionsWhere<${documentName}Entity> });\n        return { result };`
    );

    const getRoute = buildMethod(
        methods.includes("get"),
        `@Get("{id}")`,
        `public async get${documentName}(${idParam}): Promise<{ result: ${documentName}Entity }>`,
        `const result = await this.repo.findOne({ where: { _id: id } as FindOptionsWhere<${documentName}Entity> });\n        if (!result) throw new VexResponseError(404, utils.response.code.err_not_found);\n        return { result };`
    );

    const postRoute = buildMethod(
        methods.includes("post"),
        `@Post()`,
        `public async create${documentName}(@Body() body: ${documentName}Body): Promise<{ result: ${documentName}Entity }>`,
        `${cleanId}\n        const result = await this.repo.save(this.repo.create(body as DeepPartial<${documentName}Entity>));\n        if (!result) throw new VexResponseError(400, utils.response.code.err_create);\n        this.setStatus(201);\n        return { result };`
    );

    const putRoute = buildMethod(
        methods.includes("put"),
        `@Put("{id}")`,
        `public async replace${documentName}(${idParam}, @Body() body: ${documentName}Body): Promise<{ result: ${documentName}Entity }>`,
        `${cleanId}\n        const existing = await this.repo.findOne({ where: { _id: id } as FindOptionsWhere<${documentName}Entity> });\n        if (!existing) throw new VexResponseError(404, utils.response.code.err_update);\n        const result = await this.repo.save(this.repo.merge(existing, body as DeepPartial<${documentName}Entity>));\n        return { result };`
    );

    const patchRoute = buildMethod(
        methods.includes("patch"),
        `@Patch("{id}")`,
        `public async update${documentName}(${idParam}, @Body() body: ${documentName}PartialBody): Promise<{ result: ${documentName}Entity }>`,
        `${cleanId}\n        await this.repo.update({ _id: id } as FindOptionsWhere<${documentName}Entity>, body as DeepPartial<${documentName}Entity>);\n        const result = await this.repo.findOne({ where: { _id: id } as FindOptionsWhere<${documentName}Entity> });\n        if (!result) throw new VexResponseError(404, utils.response.code.err_update);\n        return { result };`
    );

    const deleteRoute = buildMethod(
        methods.includes("delete"),
        `@Delete("{id}")`,
        `public async delete${documentName}(${idParam}): Promise<{ result: ${documentName}Entity }>`,
        `const existing = await this.repo.findOne({ where: { _id: id } as FindOptionsWhere<${documentName}Entity> });\n        if (!existing) throw new VexResponseError(404, utils.response.code.err_delete);\n        await this.repo.delete({ _id: id } as FindOptionsWhere<${documentName}Entity>);\n        this.setStatus(204);\n        return { result: existing };`
    );

    const source = `{{headerComment}}
import * as controllerFactory from "./_ControllerFactory.gen";
${tsoaImportLine}
import { FindOptionsWhere, DeepPartial } from "typeorm";

import utils from "./../../system/_utils";
import VexResponseError from "../_types/VexResponseError.gen";
import VexDb from "../_services/VexDb.gen";
${rbacImportLine}
import { ${documentName}Entity } from "${modelPath}";
${bodyInterfaces}
${classDecorators}export class ${documentName}Controller extends controllerFactory._ControllerFactory {
    private get repo() {
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