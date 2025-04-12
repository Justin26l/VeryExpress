import  utils from "../../utils";

import * as types from "../../types/types";
import { isOAuthEnabled } from "~/utils/generator";

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
    recordAccessLog: false,
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
    app.use(express.static('public'));
    app.use(helmet(helmetConfig));
    app.use(processTimer);
    app.use(vexDB.middleware);

    // UsePlugins
    {{AppUse}}

    // Routes
    {{AppRouter}}

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
    
    template = template.replace(/{{dummyLoginUI}}/g, dummyLoginUI(usedProvider, options.compilerOptions));

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

function dummyLoginUI(providers: string[], compilerOptions: types.compilerOptions) {
    return `
    app.get('/', (req, res) => {
        res.send(\`
            <div>
                <h1>Hello World</h1>
                <ul>
                    ${ 
    isOAuthEnabled(compilerOptions) ? 
        `<li><a href="/login">Login</a></li>
                    <li><a href="/mytokens">myTokens</a></li>
                    <li><a href="/refreshtoken">RefreshToken</a></li>
                    <li><a href="/logout">LogOut</a></li>` : 
        "" 
}
                    <li><a href="/swagger">Swagger UI</a></li>
                </ul>
                
                <h1>Others</h1>
                <ul>
                    <li><a href="/logincallback">logincallback</a></li>
                </ul>
            </div>
        \`);
    });

    /**
     * Dummy Login Page,
     * this should handle by client application (vue, react, angular, etc)
     * - list all available provider
     */
    app.get('/login', (req, res) => {
        res.send(\`${loginHtml(providers)}\`);
    });

    /**
     * Dummy Token Display Page
     **/
    app.get('/mytokens', (req, res) => {
        const nonce = crypto.randomBytes(16).toString("base64");
        res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
        res.send(\`
            <script nonce="\${nonce}" src="\${process.env.APP_HOST}/js/mytokens.js"></script>
            <link rel="stylesheet" href="\${process.env.APP_HOST}/css/style.css">
            <body>
                <h1>My Token</h1>
                <pre id="tokenData">{a:1,B:2}<code></pre>
                <a href="/">back to home</a>
            </body>
        \`);
    });

    /** 
     * Dummy Token Exchange trigger
     **/
    app.get('/refreshtoken', (req, res) => {
        const nonce = crypto.randomBytes(16).toString("base64");
        res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
        res.send(\`
            <script nonce="\${nonce}" src="\${process.env.APP_HOST}/js/refreshtokens.js"></script>
            <link rel="stylesheet" href="\${process.env.APP_HOST}/css/style.css">
            <body>
                <h1>New Token</h1>
                <pre id="tokenData">{a:1,B:2}<code></pre>
                <a href="/">back to home</a>
            </body>
        \`);
    });

    /** 
     * Dummy Code Exchange Trigger
     **/
    app.get('/logincallback', (req, res) => {
        const nonce = crypto.randomBytes(16).toString("base64");

        res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
        res.send(\`
            <script nonce="\${nonce}" src="\${process.env.APP_HOST}/js/logincallback.js"></script>
            <link rel="stylesheet" href="\${process.env.APP_HOST}/css/style.css">
            <body>
                <h1>Profile Data</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        \`);
    });

    /** 
     * Dummy Logout Page, 
     * - this should handle by client application
     * - client side application should remove local storage's tokens
     **/
    app.get('/logout', (req, res) => {
        const nonce = crypto.randomBytes(16).toString("base64");
        res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
        res.send(\`
            <script nonce="\${nonce}">
                localStorage.removeItem('accessToken', jsonData.result.accessToken);
                localStorage.removeItem('accessTokenIndex', jsonData.result.accessTokenIndex);
                localStorage.removeItem('refreshToken', jsonData.result.refreshToken);
                localStorage.removeItem('refreshTokenIndex', jsonData.result.refreshTokenIndex);
            </script>
        \`);
    });
    `;
}
