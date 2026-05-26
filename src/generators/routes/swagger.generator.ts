export function compile(): string {
    return "// {{headerComment}}\n" +
        "import path from \"path\";\n" +
        "import fs from \"fs\";\n" +
        "import { Router } from \"express\";\n" +
        "import swaggerUi from \"swagger-ui-express\";\n\n" +
        "export default class SwaggerRouter {\n\n" +
        "    private router: Router = Router();\n\n" +
        "    constructor() {\n" +
        "        const specPath = path.join(__dirname, \"../../openapi/swagger.json\");\n" +
        "        try {\n" +
        "            const spec = JSON.parse(fs.readFileSync(specPath, \"utf-8\"));\n" +
        "            this.router.get(\"/openapi.json\", (_req, res) => res.json(spec));\n" +
        "            this.router.use(\"/\", swaggerUi.serve, swaggerUi.setup(spec));\n" +
        "        } catch {\n" +
        "            this.router.get(\"/\", (_req, res) =>\n" +
        "                res.status(503).json({ error: \"Run 'tsoa spec-and-routes' to generate the OAS spec first.\" })\n" +
        "            );\n" +
        "        }\n" +
        "    }\n\n" +
        "    public getRouter() {\n" +
        "        return this.router;\n" +
        "    }\n\n" +
        "}\n";
}