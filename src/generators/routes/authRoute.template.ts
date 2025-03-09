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
import { UserModel } from '../_models/UserModel.gen';
import { sanitizeUser } from '../_plugins/auth/token.gen';

export default class AuthRouter {

    private router: Router = Router();
        
    constructor() {

        // exchange an authorization code for tokens.
        this.router.post('/token', async (req, res) => {
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

            const userDoc = await UserModel.findById(sessionDoc.get("userId")).exec();

            if (!userDoc) {
                return responseGen.send(res, 404, { message: 'user not found' });
            }
            const userInfo = sanitizeUser(userDoc);

            // generate tokens based on code's user profile
            const accessToken = generateAccessToken(userInfo);
            const refreshToken = generateRefreshToken({_id: userInfo._id});

            return responseGen.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientIndex,
                    refreshToken: refreshToken.token,
                    refreshTokenIndex: refreshToken.clientIndex
                }
            });
        });

        // refresh expired tokens by refresh token.
        this.router.get('/refresh', (req, res) => {
            if (
                !req.cookies.refreshToken || 
                !req.cookies.refreshTokenIndex || 
                !req.headers.authorization || 
                !req.headers['x-auth-index']
            ) {
                console.log(req.headers);
                return responseGen.send(res, 401);
            };

            const refreshTokenPayload = verifyToken(req.cookies.refreshToken, req.cookies.refreshTokenIndex);
            const accessTokenPayload = verifyToken(req.headers.authorization.split(' ')[1], req.headers['x-auth-index'].toString());

            if (!refreshTokenPayload || !accessTokenPayload) {
                return responseGen.send(res, 401);
            };
            
            // new tokens generated
            const accessToken = generateAccessToken(accessTokenPayload);
            const refreshToken = generateRefreshToken(refreshTokenPayload);
            
            return responseGen.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientIndex,
                    refreshToken: refreshToken.token,
                    refreshTokenIndex: refreshToken.clientIndex
                }
            });
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
    template = template.replace(/{{headerComment}}/g, compilerOptions.headerComment || "// generated files by very-express");
    template = template.replace(/{{OAuthRouteProviders}}/g, providersTemplate);

    return template;
}