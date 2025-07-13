import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

export default function template(
    compilerOptions: types.compilerOptions,
): string {
    let template = `{{headerComment}}
import { Router } from 'express';
import responseGen from '../_utils/response.gen';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../_plugins/auth/jwt.gen';
import oauthVerify from '../_plugins/auth/oauthVerify.gen';
import jwt from "jsonwebtoken";

import OAuthRouteFactory from './oauth/OAuthRouteFactory.gen';
import { Strategy as GithubStrategy } from 'passport-github';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { SessionDocument, SessionModel } from '../_models/SessionModel.gen';
import VexSystem from '../_services/VexSystem.gen';

export default class AuthRouter {

    private router: Router = Router();

    constructor() {
        const vexSystem = new VexSystem();

        {{pathToken}}

        // refresh expired tokens by refresh token.
        this.router.post('/refresh', (req, res) => vexSystem.RouteHandler(req, res, async () => {
            
            // todo: change this return if use httpOnly Cookie

            if (
                !req.body.refreshToken || 
                !req.body.refreshTokenIndex
            ) {
                console.log("invalid /refresh payload");
                return responseGen.send(res, 401);
            };

            let refreshTokenPayload = verifyToken(req.body.refreshToken, req.body.refreshTokenIndex);
            
            // new tokens generated
            const accessToken = await generateAccessToken(refreshTokenPayload._id);
            
            return responseGen.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientIndex
                }
            });
        }));

        this.initOAuthRoutes();
    }

    private initOAuthRoutes() {
        {{OAuthRouteProviders}}
    }
    
    public getRouter() {
        return this.router;
    }
}`;

    template = template.replace(/{{headerComment}}/g, compilerOptions._.headerComment || "// generated files by very-express");

    const providers: string[] = utilsGenerator.OAuthProviders(compilerOptions);
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
    template = template.replace(/{{OAuthRouteProviders}}/g, providersTemplate);
    
    template = template.replace(/{{pathToken}}/g, `
        // exchange an authorization code for tokens.
        this.router.post('/token', (req, res) => vexSystem.RouteHandler(req, res, async ()=> {
            
            // todo: disable this route if use httpOnly Cookie
            
            if (!req.query.code) {
                return responseGen.send(res, 401);
            }

            const sessionCode = req.query.code;
            // find code in database
            const sessionDoc = await SessionModel.findOne<SessionDocument>({ sessionCode: sessionCode }).exec();

            if (!sessionDoc) {
                return responseGen.send(res, 404, { message: 'invalid code' });
            }
            else {
                await SessionModel.deleteOne({ sessionCode: sessionCode }).exec();
                // log.info("Session Found & Deleted", sessionDoc);
            };

            if (sessionDoc?.get('expired') < Date.now()) {
                return responseGen.send(res, 401, { message: 'code expired' });
            };

            // generate tokens based on code's user profile
            const accessToken = await generateAccessToken(sessionDoc.get("userId"));
            const refreshToken = generateRefreshToken({_id: sessionDoc.get("userId")});

            return responseGen.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientIndex,
                    refreshToken: refreshToken.token,
                    refreshTokenIndex: refreshToken.clientIndex
                }
            });
        }));`);

    return template;
}