import * as types from "../types/types";

// import
const importExpressSession = `import session from 'express-session';`;
const importPassportGoogle = `import passportGoogle from "./plugins/passportGoogle.gen"`;

// configure
const templateConfigExpressSession = `
const expressSession = session({
  secret: 'your session secret', 
  resave: false, 
  saveUninitialized: false 
})`;

const templateConfigPassportGoogle = `
const OAuthGoogle = new passportGoogle({
  strategyConfig: {
    verify: (accessToken: string, refreshToken: string, profile: any, done: (error: any, user?: any) => void) => {
      return done(null, profile);
    }
  }
});`;

// app.use 
const templateUseSession = `
app.use(expressSession);`;

const templateUsePassportGoogle = `
app.use(OAuthGoogle.router);
app.use(OAuthGoogle.passport.initialize());
app.use(OAuthGoogle.passport.session());`;


export default function serverTemplate(templateOptions: {
  template?: string,
  options?: types.compilerOptions,
}): string {
  const headerComment: string = templateOptions.options?.headerComment || "// generated files by very-express";
  let template: string = templateOptions.template || `{{headerComment}}

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';

import mongoConn from './services/mongoConn.gen';
import log from './utils/log.gen';
{{OAuthImport}}
import generatedRouter from './routes/routes.gen';


/** 
 * Configure
 */
dotenv.config();

/* Config OAuth Start */
{{OAuthConfig}}
/* Config OAuth End */


/** 
 * App
 */
const app = express();
app.use(express.json());
app.disable("x-powered-by");
app.use(helmet({
  xPoweredBy: false,
  xDnsPrefetchControl: { allow: false },
}));

/* Use OAuth Start */
{{OAuthAppUse}}
/* Use OAuth End */

app.use(generatedRouter);

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(3000, () => {
  mongoConn.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/veryExpressDB');
  log.ok('Server is running on port 3000');
});
`;

  const usedProvider : string[] = Object.keys(templateOptions.options?.useOauth || {}).filter((key) => {
    return templateOptions.options?.useOauth[key] === true;
  });
  const OAuthImport : string[] = [];
  const OAuthConfig : string[] = [];
  const OAuthAppUse : string[] = [];

  if(usedProvider.length > 0) {
    OAuthImport.push(importExpressSession);
    OAuthConfig.push(templateConfigExpressSession);
    OAuthAppUse.push(templateUseSession);

    if(usedProvider.includes("google")) {
      OAuthImport.push(importPassportGoogle);
      OAuthConfig.push(templateConfigPassportGoogle);
      OAuthAppUse.push(templateUsePassportGoogle);

    }
  }

  template = template.replace(/{{headerComment}}/g, headerComment);
  template = template.replace(/{{OAuthImport}}/g, OAuthImport.join("\n"));
  template = template.replace(/{{OAuthConfig}}/g, OAuthConfig.join("\n"));
  template = template.replace(/{{OAuthAppUse}}/g, OAuthAppUse.join("\n"));

  return template;
}
