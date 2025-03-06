import  utils from "../../utils";

import * as types from "../../types/types";

// import
const importCookieParser = "import cookieParser from 'cookie-parser';";
const importSwaggerRouter = "import SwaggerRouter from './system/_routes/SwaggerRouter.gen';";
const importAuthRouter = "import AuthRouter from './system/_routes/AuthRouter.gen';";

// configure
const ConfigSwaggerRouter = "const SwaggerRoute = new SwaggerRouter();";
const ConfigAuthRouter = "const AuthRoute = new AuthRouter();";
const ConfigApiRouter = "const ApiRoute = new ApiRouter();";


// use
const UseCookieParser = "app.use(cookieParser());";
const UseAuthRouter = "app.use(\"/auth\", AuthRoute.getRouter());";
const UseSwaggerRouter = "app.use(\"/swagger\", SwaggerRoute.getRouter());";
const UseApiRouter = "app.use(\"/api\", ApiRoute.getRouter());";

export default function serverTemplate(options: {
    compilerOptions: types.compilerOptions,
    template?: string,
}): string {
    let template: string = options.template || `${options.compilerOptions.headerComment || "// generated files by very-express"}

import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import helmet from 'helmet';
import log from './system/_utils/logger.gen';
import processTimer from './system/_utils/processTimer.gen';
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
    app.use(processTimer);
    app.use(vexDB.middleware);

    // UsePlugins
    {{AppUse}}

    // Routes
    {{AppRouter}}

    app.get('/', (req, res) => {
        res.send(\`
            <div>
                <h1>Hello World</h1>
                <ul>
                    <li><a href="/login">Login</a></li>
                    <li><a href="/profile">Profile</a></li>
                    <li><a href="/logout">LogOut</a></li>
                    <li><a href="/swagger">Swagger UI</a></li>
                </ul>
            </div>
        \`);
    });

    {{dummyLoginUI}}

    app.listen(3000, () => {
        if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not defined');
        vexDB.connectMongo();
        log.ok(\`Server is running on : \${process.env.APP_HOST}\`);
    });

}

main();
`;

    const usedProvider: string[] = utils.generator.OAuthProviders(options.compilerOptions);
    const Import: string[] = [];
    const Config: string[] = [];
    const AppUse: string[] = [];
    const AppRoute: string[] = [];

    Config.push(ConfigApiRouter);
    AppRoute.push(UseApiRouter);

    if (options.compilerOptions.app.enableSwagger) {
        Import.push(importSwaggerRouter);
        Config.push(ConfigSwaggerRouter);
        AppRoute.push(UseSwaggerRouter);
    }

    if (usedProvider.length > 0) {
        Import.push(importCookieParser);
        AppUse.push(UseCookieParser);

        Import.push(importAuthRouter);
        Config.push(ConfigAuthRouter);
        AppRoute.push(UseAuthRouter);

    }
    template = template.replace(/{{dummyLoginUI}}/g, dummyLoginUI(usedProvider));

    template = template.replace(/{{headerComment}}/g, options.compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{Import}}/g, Import.join("\n"));
    template = template.replace(/{{Config}}/g, Config.join("\n"));
    template = template.replace(/{{AppUse}}/g, AppUse.join("\n    "));
    template = template.replace(/{{AppRouter}}/g, AppRoute.join("\n    "));

    return template;
}

function loginHtml(providers: string[]) {
    let html = "<p> login with : </p>";
    providers.forEach((provider) => {
        html += `<a href="\${process.env.APP_HOST}/auth/${provider}">${provider}</a><br/>\n`;
    });
    return `${html}`;
}

function dummyLoginUI(providers: string[]) {
    return `
    /**
     * Dummy Login Page,
     * this should handle by client application (vue, react, angular, etc)
     * - list all available provider
     */
    app.get('/login', (req, res) => {
        res.send(\`${loginHtml(providers)}\`);
    });

    /** 
     * token exchange page
     * in ideal condition this will handle by Front-End Server (nuxtJs, nextJs, etc)
     **/
    app.get('/profile', (req, res) => {
        const nonce = crypto.randomBytes(16).toString("base64");

        res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
        res.send(\`
            <script nonce="\${nonce}">
                let jsonData = {};
                
                document.addEventListener("DOMContentLoaded", function() {
                    console.log('Exchange Tokens from /auth/token');
                    let sessionCode = new URLSearchParams(location.search).get('code');
                    fetch(
                        '/auth/token?code=' + sessionCode, {
                            method: 'POST'
                        }
                    )
                        .then((res) => res.text())
                        .then((data) => {
                            document.querySelector("#tokenData").innerHTML = data;
                            jsonData = JSON.parse(data);
                            console.log('jsonData', jsonData);
                        });
                });
            </script>
            <body>
                <h1>Profile Data</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        \`);
    });

    /** 
     * Dummy Logout Page, 
     * this should handle by client application (vue, react, angular, etc)
     * - front end server should remove cookie "tokenIndex" & "refreshToken"
     * - client side should remove "accessToken" in local
     **/
    app.get('/logout', (req, res) => {
        const nonce = crypto.randomBytes(16).toString("base64");
        res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
        res.clearCookie('tokenIndex');
        res.clearCookie('refreshToken');
        res.send(\`
            <script nonce="\${nonce}">
                localStorage.removeItem('accessToken');
                location.href = '/login';
            </script>
        \`);
    });
    `;
}
