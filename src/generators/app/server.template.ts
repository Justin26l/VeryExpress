import  utils from "../../utils";
import * as types from "../../types/types";

// import
const importCookieParser = "import cookieParser from \"cookie-parser\";";
const importSwaggerRouter = "import SwaggerRouter from \"./system/_routes/SwaggerRouter.gen\";";
const importAuthRouter = "import AuthRouter from \"./system/_routes/AuthRouter.gen\";";
const importAuthentication = "import Authentication from \"./system/_middlewares/Authentication.gen\";";
const importVexSystem = "import VexSystem from \"./system/_services/VexSystem.gen\";";
const importLoginUI = "import LoginUI from \"./system/_routes/LoginUI.gen\";";

// configure
const ConfigSwaggerRouter = "const SwaggerRoute = new SwaggerRouter();";
const ConfigAuthRouter = "const AuthRoute = new AuthRouter();";
const ConfigLoginUiRouter = (localAuth: boolean, providers: string[]) =>`const loginUI = new LoginUI({ localAuth: ${localAuth}, oauthProviders: ${JSON.stringify(providers)} });`;


// use
const UseCookieParser = "app.use(cookieParser());";
const UseResponseHandler = "app.use(VexSystem.responseHandler);";
const UseAuthRouter = "app.use(\"/api/auth\", AuthRoute.getRouter());";
const UseRegisterRoutes = "RegisterRoutes(app);";
const UseSwaggerRouter = "app.use(\"/swagger\", SwaggerRoute.getRouter());";
const UseLoginUI =  "app.use(\"/\", loginUI.getRouter());";

export default function serverTemplate(options: {
    compilerOptions: types.compilerOptions,
    template?: string,
}): string {
    let template: string = options.template || `{{headerComment}}
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import helmet from "helmet";

import "reflect-metadata";
import log from "./system/_utils/logger.gen";
import processTimer from "./system/_utils/processTimer.gen";
import vexDB from "./system/_services/VexDb.gen";

import { RegisterRoutes } from "./system/_routes/tsoa_routes";
{{Import}}

/** 
 * Configure
 */
dotenv.config();

const helmetConfig = {
    xPoweredBy: false,
    xDnsPrefetchControl: { allow: false },
};

{{Config}}

/** 
 * App
 */
async function main(): Promise<void> {

    const app = express();
    app.disable("x-powered-by");

    // UseMiddleware
    app.use(express.json());
    app.use(express.static("public"));
    app.use(helmet(helmetConfig));
    app.use(processTimer);
    app.use(vexDB.middleware);

    // UsePlugins
    {{AppUse}}

    // Routes
    {{AppRouter}}

    // ping
    app.get("/hello", (req, res) => {
        res.send("Hello");
    });

    app.listen(process.env.APP_PORT, () => {
        vexDB.connect();
        log.ok(\`Server is running on : \${process.env.APP_HOST}:\${process.env.APP_PORT}\`);
    });

}

main();
`;
    const isAuthEnabled = utils.generator.isAuthEnabled(options.compilerOptions);
    const OAuthProviders: string[] = utils.generator.OAuthProviders(options.compilerOptions);
    const Import: string[] = [];
    const Config: string[] = [];
    const AppUse: string[] = [];
    const AppRoute: string[] = [];

    Import.push(importVexSystem);
    AppRoute.push(UseRegisterRoutes);
    AppRoute.push(UseResponseHandler);

    if (options.compilerOptions.app.enableSwagger) {
        Import.push(importSwaggerRouter);
        Config.push(ConfigSwaggerRouter);
        AppRoute.push(UseSwaggerRouter);
    }

    if (isAuthEnabled) {
        Import.push(importCookieParser);
        AppUse.push(UseCookieParser);
    }

    if (OAuthProviders.length > 0) {
        Import.push(importAuthRouter);
        Config.push(ConfigAuthRouter);
        AppRoute.push(UseAuthRouter);
    }

    Import.push(importLoginUI);
    Config.push(ConfigLoginUiRouter(options.compilerOptions.auth.localAuth, OAuthProviders));
    AppRoute.push(UseLoginUI);

    template = template.replace(/{{Import}}/g, Import.join("\n"));
    template = template.replace(/{{Config}}/g, Config.join("\n"));
    template = template.replace(/{{AppUse}}/g, AppUse.join("\n    "));
    template = template.replace(/{{AppRouter}}/g, AppRoute.join("\n    "));

    return template;
}
