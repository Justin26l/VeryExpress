import * as types from "../types/types";
import utils from "./../utils/common";

// import
const importExpressSession = `import session from 'express-session';`;
const importPassportGoogle = `import PassportGoogle from "./plugins/PassportGoogle.gen"`;
const importSwaggerRouter = `import SwaggerRouter from './routes/SwaggerRouter.gen';`;
const importOAuthRouter = `import OAuthRouter from './routes/OAuthRouter.gen';`;

// configure
const ConfigExpressSession = `
const expressSessionConfig = {
  secret: 'your session secret', 
  resave: false, 
  saveUninitialized: false 
}`;

const ConfigSwaggerRouter = `const SwaggerRoute = new SwaggerRouter(); SwaggerRoute.initRoutes();`;
const ConfigOAuthRouter = `const OAuthRoute = new OAuthRouter(); OAuthRoute.initRoutes();`;

const ConfigPassportGoogle = `
const OAuthGoogle = new PassportGoogle({
  strategyConfig: {
    // @ts-ignore
    verify: (accessToken: string, refreshToken: string, profile: Profile, done: (error: any, user?: any) => void) => {
      return done(null, profile);
    }
  }
});`;

// app.use 
const UseSession = `app.use(session(expressSessionConfig));`;
const UsePassportGoogle = `
  await OAuthGoogle.passportSerializeUser();
  app.use(OAuthGoogle.passport.initialize());
  app.use(OAuthGoogle.passport.session());`;

// routes
const UseOAuthRouter = `app.use(OAuthRoute.router);`;
const UseSwaggerRouter = `app.use(SwaggerRoute.router);`;
const UseOAuthGoogleRouter = `app.use(OAuthGoogle.router);`;


export default function serverTemplate(options: {
  compilerOptions: types.compilerOptions,
  template?: string,
}): string {
  const headerComment: string = options.compilerOptions?.headerComment || "// generated files by very-express";
  let template: string = options.template || `{{headerComment}}

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';

import mongoConn from './services/mongoConn.gen';
import log from './utils/logger.gen';

import ApiRouter from './routes/ApiRouter.gen';
{{Import}}


/** 
 * Configure
 */
dotenv.config();

const helmetConfig = {
  xPoweredBy: false,
  xDnsPrefetchControl: { allow: false },
};

const ApiRoute = new ApiRouter(); ApiRoute.initRoutes();
{{Config}}


/** 
 * App
 */
async function main(): Promise<void> {

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(helmet(helmetConfig));

  // UsePlugins
  {{AppUse}}

  // Routes
  {{AppRouter}}

  app.use(ApiRoute.router);

  app.get('/', (req, res) => {
    res.send('Hello World');
  });

  app.listen(3000, () => {
    if(!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not defined');
    mongoConn.connect(process.env.MONGODB_URI);
    log.ok(\`Server is running on : \${process.env.APP_HOST}:\${process.env.APP_PORT}\`);
  });

}

main();
`;

  const usedProvider : string[] = utils.isUseOAuth(options.compilerOptions);
  const Import : string[] = [];
  const Config : string[] = [];
  const AppUse : string[] = [];
  const AppRoute : string[] = [];

  

  if(usedProvider.length > 0) {
    Import.push(importExpressSession);
    Config.push(ConfigExpressSession);
    AppUse.push(UseSession);

    if (options.compilerOptions.enableSwagger) {
      Import.push(importSwaggerRouter);
      Config.push(ConfigSwaggerRouter);
      AppRoute.push(UseSwaggerRouter);
    };

    Import.push(importOAuthRouter);
    Config.push(ConfigOAuthRouter);
    AppRoute.push(UseOAuthRouter);

    if(usedProvider.includes("google")) {
      Import.push(importPassportGoogle);
      Config.push(ConfigPassportGoogle);
      AppUse.push(UsePassportGoogle);
      AppRoute.push(UseOAuthGoogleRouter);

    }
  }
  
  template = template.replace(/{{headerComment}}/g, headerComment);
  template = template.replace(/{{Import}}/g, Import.join("\n"));
  template = template.replace(/{{Config}}/g, Config.join("\n"));
  template = template.replace(/{{AppUse}}/g, AppUse.join("\n  "));
  template = template.replace(/{{AppRouter}}/g, AppRoute.join("\n  "));

  return template;
}
