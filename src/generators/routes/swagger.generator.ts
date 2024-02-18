import * as types from "../../types/types";

export function compile( compilerOptions: types.compilerOptions ): string {
    return `${compilerOptions.headerComment}
import { Router } from "express";
import swaggerUi, { JsonObject } from "swagger-ui-express";
import { loadYaml } from "../utils/common.gen";

export default class SwaggerRouter{

    public router: Router = Router();

    constructor() {}
    
    public initRoutes() {
        this.router.use("/api", swaggerUi.serve, swaggerUi.setup(loadYaml("${compilerOptions.openapiDir}") as JsonObject));
    }
}`;
}