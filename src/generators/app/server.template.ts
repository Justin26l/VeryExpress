import  utils from "../../utils";

import * as types from "../../types/types";

// import
const importCookieParser = "import cookieParser from 'cookie-parser';";
const importOAuthVerifyPlugin = "import oauthVerify from './system/_plugins/oauthVerify.gen';";
const importPassportGoogle = "import PassportGoogle from './system/_plugins/PassportGoogle.gen'";
const importSwaggerRouter = "import SwaggerRouter from './system/_routes/SwaggerRouter.gen';";
const importOAuthRouter = "import OAuthRouter from './system/_routes/OAuthRouter.gen';";

// configure

const ConfigSwaggerRouter = "const SwaggerRoute = new SwaggerRouter(); SwaggerRoute.initRoutes();";
const ConfigOAuthRouter = "const OAuthRoute = new OAuthRouter(); OAuthRoute.initRoutes();";

const ConfigPassportGoogle = `
const OAuthGoogle = new PassportGoogle({
    strategyConfig: {
        verify: oauthVerify
    }
});`;

// app.use 
const UseCookieParser = "app.use(cookieParser());";
const UsePassportGoogle = `
    app.use(OAuthGoogle.passport.initialize());`;

// routes
const UseOAuthRouter = "app.use(OAuthRoute.router);";
const UseSwaggerRouter = "app.use(SwaggerRoute.router);";
const UseOAuthGoogleRouter = "app.use(OAuthGoogle.router);";


export default function serverTemplate(options: {
    compilerOptions: types.compilerOptions,
    template?: string,
}): string {
    let template: string = options.template || `${options.compilerOptions.headerComment || "// generated files by very-express"}

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import log from './system/_utils/logger.gen';
import VexDbConnector from './system/_services/VexDbConnector.gen';

import ApiRouter from './system/_routes/ApiRouter.gen';
{{Import}}


/** 
 * Configure
 */
dotenv.config();

const helmetConfig = {
    xPoweredBy: false,
    xDnsPrefetchControl: { allow: false },
};

const vexDB = new VexDbConnector({
    mongoUrl: process.env.MONGODB_URI,
});


const ApiRoute = new ApiRouter(); ApiRoute.initRoutes();
{{Config}}


/** 
 * App
 */
async function main(): Promise<void> {

    const app = express();
    app.disable("x-powered-by");

    // UseMiddleware
    app.use(express.json());
    app.use(helmet(helmetConfig));
    app.use(vexDB.middleware);

    // UsePlugins
    {{AppUse}}

    // Routes
    {{AppRouter}}

    app.use(ApiRoute.router);
    app.get('/', (req, res) => {
        res.send(\`
            <div>
                <h1>Hello World</h1>
                <ul>
                    <li><a href="/login">login</a></li>
                    <li><a href="/profile">profile</a></li>
                    <li><a href="/logout">logout</a></li>
                    <li><a href="/api">api</a></li>
                </ul>
            </div>
        \`);
    });

    app.listen(3000, () => {
        if(!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not defined');
        vexDB.connectMongo();
        log.ok(\`Server is running on : \${process.env.APP_HOST}\`);
    });

}

main();
`;

    const usedProvider: string[] = utils.generator.isUseOAuth(options.compilerOptions);
    const Import: string[] = [];
    const Config: string[] = [];
    const AppUse: string[] = [];
    const AppRoute: string[] = [];

    if (usedProvider.length > 0) {
        Import.push(importCookieParser);
        AppUse.push(UseCookieParser);

        Import.push(importOAuthVerifyPlugin);

        if (options.compilerOptions.app.enableSwagger) {
            Import.push(importSwaggerRouter);
            Config.push(ConfigSwaggerRouter);
            AppRoute.push(UseSwaggerRouter);
        }

        Import.push(importOAuthRouter);
        Config.push(ConfigOAuthRouter);
        AppRoute.push(UseOAuthRouter);

        if (usedProvider.includes("google")) {
            Import.push(importPassportGoogle);
            Config.push(ConfigPassportGoogle);
            AppUse.push(UsePassportGoogle);
            AppRoute.push(UseOAuthGoogleRouter);
        }
    }

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{Import}}/g, Import.join("\n"));
    template = template.replace(/{{Config}}/g, Config.join("\n"));
    template = template.replace(/{{AppUse}}/g, AppUse.join("\n    "));
    template = template.replace(/{{AppRouter}}/g, AppRoute.join("\n    "));

    return template;
}
