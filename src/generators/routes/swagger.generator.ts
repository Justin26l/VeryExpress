export function compile(): string {
    return `{{headerComment}}
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { oasRegistry } from "./OasRegistry.gen";

function buildOasDocument() {
    const generator = new OpenApiGeneratorV3(oasRegistry.definitions);
    return generator.generateDocument({
        openapi: "3.0.0",
        info: { title: "VeryExpress API", version: "1.0.0" },
        servers: [{ url: "/" }],
    });
}

export default class SwaggerRouter {

    private router: Router = Router();

    constructor() {
        // serve generated OAS JSON (built from the OasRegistry)
        this.router.get("/openapi.json", (req, res) => {
            try {
                const doc = buildOasDocument();
                res.json(doc);
            }
            catch (err) {
                res.status(500).json({ error: "failed to build openapi document" });
            }
        });

        // Swagger UI pointed at runtime openapi.json
        this.router.use("/", swaggerUi.serve, swaggerUi.setup(undefined, {
            swaggerOptions: { url: "/swagger/openapi.json" },
        }));
    }

    public getRouter() {
        return this.router;
    }
}`;
}