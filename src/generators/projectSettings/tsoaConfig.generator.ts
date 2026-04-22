import path from "path";
import utils from "../../utils";
import * as types from "../../types/types";

/**
 * Generate output/tsoa.json so tsoa CLI can produce routes.ts + openapi.json
 */
export function compile(compilerOptions: types.compilerOptions): void {
    const tsoaJson = {
        entryFile: "src/server.ts",
        noImplicitAdditionalProperties: "throw-on-extras",
        controllerPathGlobs: [
            "src/system/_controllers/**Controller.gen.ts",
            "!src/system/_controllers/SessionController.gen.ts",
        ],
        spec: {
            outputDirectory: "src/openapi",
            specVersion: 3,
            securityDefinitions: {
                BearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        routes: {
            routesDir: "src",
            basePath: "/api",
            middleware: "express",
        },
    };

    const outPath = path.posix.join(compilerOptions.rootDir, "tsoa.json");
    utils.common.writeFile("tsoa config", outPath, JSON.stringify(tsoaJson, null, 4));
}

export default { compile };
