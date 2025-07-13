import * as types from "../../types/types";

export function compile( compilerOptions: types.compilerOptions ): string {
    return `${compilerOptions._.headerComment}
import { Router } from "express";
import swaggerUi, { JsonObject } from "swagger-ui-express";
import { loadYaml } from "./../_utils/common.gen";

export default class SwaggerRouter{

    private router: Router = Router();

    constructor() {
        this.router.use("/", swaggerUi.serve, swaggerUi.setup(loadYaml(__dirname+"/../../openapi/openapi.gen.yaml") as JsonObject));
    }

    public getRouter() {
        return this.router;
    }
    
}`;
}