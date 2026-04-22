export function compile(): string {
    return `{{headerComment}}
import { Router } from "express";
import swaggerUi, { JsonObject } from "swagger-ui-express";
import { loadYaml } from "./../_utils/common.gen";

export default class SwaggerRouter{

    private router: Router = Router();

    constructor() {
        // serve modified openapi json and swagger ui
        this.router.get('/openapi.json', (req, res) => {
            try {
                const openapi: any = loadYaml(__dirname+"/../../openapi/openapi.gen.yaml");
                // ensure components.securitySchemes exists
                openapi.components = openapi.components || {};
                openapi.components.securitySchemes = openapi.components.securitySchemes || {};
                // add bearer scheme if missing
                if (!openapi.components.securitySchemes.BearerAuth) {
                    openapi.components.securitySchemes.BearerAuth = {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    };
                }
                // set global security requirement
                openapi.security = openapi.security || [{ BearerAuth: [] }];

                res.json(openapi as JsonObject);
            }
            catch (err) {
                res.status(500).json({ error: "failed to load openapi" });
            }
        });

        // mount swagger-ui and point it to our custom openapi.json
        this.router.use("/", swaggerUi.serve, swaggerUi.setup(undefined, { swaggerUrl: '/swagger/openapi.json' } as any));
    }

    public getRouter() {
        return this.router;
    }
    
}`;
}