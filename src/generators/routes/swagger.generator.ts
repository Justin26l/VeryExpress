import * as types from "../../types/types";
import utils from "../../utils";

export function compile( compilerOptions: types.compilerOptions ): string {
    const yamlPath = utils.common.relativePath(compilerOptions.sysDir+"/routes",compilerOptions.openapiDir+"/openapi.gen.yaml");
    return `${compilerOptions.headerComment}
import { Router } from "express";
import swaggerUi, { JsonObject } from "swagger-ui-express";
import { loadYaml } from "./../_utils/common.gen";

export default class SwaggerRouter{

    private router: Router = Router();

    constructor() {}

    public initRoutes() {
        this.router.use("/", swaggerUi.serve, swaggerUi.setup(loadYaml(__dirname+"/../../openapi/openapi.gen.yaml") as JsonObject));
    }

    public getRouter(){
        this.initRoutes();
        return this.router;
    }
    
}`;
}