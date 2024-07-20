import * as types from "../../types/types";

export default function RBACmiddlewareTemplate(options: {
    template?: string,
    role: string,
    roleContent: any,
    RoleAccessActionString: string[],
    compilerOptions: types.compilerOptions,
}): string {

    let template: string = options.template || `{{headerComment}}
import * as roleFactory from "./../../system/_roles/_RoleFactory.gen";

export type accessAction{{role}} = {{RoleAccessActionString}};

const {{role}}AccessControl: roleFactory.accessControl<accessAction{{role}}> = {{roleContent}};

export default class Role{{role}} extends roleFactory._RoleFactory<accessAction{{role}}> {
    constructor() {
        super({{role}}AccessControl);
    }
}
`;

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{role}}/g, options.role);
    template = template.replace(/{{roleContent}}/g, JSON.stringify(options.roleContent, null, 4));
    template = template.replace(/{{RoleAccessActionString}}/g, options.RoleAccessActionString.join(" | "));

    return template;
}
