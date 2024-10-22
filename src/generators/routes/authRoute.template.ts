import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

export default function template(
    compilerOptions: types.compilerOptions,
): string {
    let template = `{{headerComment}}
import { Router } from 'express';
import { verifyToken } from '../_plugins/auth/jwt.gen';
import oauthVerify from '../_plugins/auth/oauthVerify.gen';

import OAuthRouteFactory from './oauth/OAuthRouteFactory.gen';
import { Strategy as GithubStrategy } from 'passport-github';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

export default class AuthRouter {

    private router: Router = Router();
        
    constructor() {
        this.router.get('/profile', (req, res) => {

            try {
                if (!req.headers['authorization']) {
                    throw new Error('No Authorization Header');
                };

                const accessToken = req.headers['authorization']?.toString().split(' ')[1];
                const tokenIndex = req.cookies['tokenIndex']?.toString() || undefined;
                const decodedToken = verifyToken(accessToken, tokenIndex);
                
                if (!decodedToken) {
                    console.log(decodedToken);
                    throw new Error('Invalid Token');
                };

                res.json(decodedToken);
            }
            catch ( err: any ) {
                res.status(401);
                res.json({ error: err.message });
            }
        });

        this.router.get('/refreshtoken', (req, res) => {
            // check if refresh token is valid
            // if valid, return new access token
            // if not, return 401
        });

        this.initOAuthRoutes();
    }

    private initOAuthRoutes() {
        {{OAuthRouteProviders}}
    }
    
    public getRouter() {
        return this.router;
    }
}`;

    const providers: string[] = utilsGenerator.isUseOAuth(compilerOptions);
    const providersTemplate = providers.map((providerName) => {
        switch (providerName) {
        case "google":
            return `
        const google = 'google';
        const OAuthGoogle = new OAuthRouteFactory({
            strategyName: google,
            strategy: new GoogleStrategy(
                {
                    clientID: process.env.OAUTH_GOOGLE_CLIENTID || "",
                    clientSecret: process.env.OAUTH_GOOGLE_CLIENTSECRET || "",
                    callbackURL: \`\${process.env.APP_HOST}/auth/\${google}/callback\`,
                },
                oauthVerify
            )
        });
        this.router.use(\`/\${google}\`, OAuthGoogle.getRouter());
        `;
        case "github":
            return `
        const github = 'github';
        const OAuthGithub = new OAuthRouteFactory({
            strategyName: github,
            strategy: new GithubStrategy(
                {
                    clientID: process.env.OAUTH_GITHUB_CLIENTID || "",
                    clientSecret: process.env.OAUTH_GITHUB_CLIENTSECRET || "",
                    callbackURL: \`\${process.env.APP_HOST}/auth/\${github}/callback\`,
                },
                oauthVerify
            )
        });
        this.router.use(\`/\${github}\`, OAuthGithub.getRouter());
        `;
        }
    }).join("\n");
    template = template.replace(/{{headerComment}}/g, compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{OAuthRouteProviders}}/g, providersTemplate);

    return template;
}