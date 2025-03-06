import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

export default function template(
    compilerOptions: types.compilerOptions,
): string {
    let template = `{{headerComment}}
import { Router } from 'express';
import responseGen from '../_utils/response.gen';
import { generateToken, verifyToken } from '../_plugins/auth/jwt.gen';
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
        this.router.get('/profile', (req, res) => {

            if (!req.headers['authorization']) {
                return responseGen.send(res, 401);
            };

            const accessToken = req.headers['authorization']?.toString().split(' ')[1];
            const tokenIndex = req.cookies['tokenIndex']?.toString() || undefined;
            const decodedToken = verifyToken(accessToken, tokenIndex);
            
            if (!decodedToken) {
                return responseGen.send(res, 401);
            }
            else{
                return responseGen.send(res, 200, {
                    result: decodedToken
                });
            };
        });

        // exchange an authorization code for an access token.
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
            const accessToken = generateToken(userInfo, undefined, process.env.ACCESS_TOKEN_EXPIRED_TIME);
            const refreshToken = generateToken(userInfo, undefined, process.env.REFRESH_TOKEN_EXPIRED_TIME);

            return responseGen.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientKeyIndex,

                    // todo : need able to configure direct set cookie or return as json
                    refreshToken: refreshToken.token,
                    refreshTokenIndex: refreshToken.clientKeyIndex
                }
            });
        });

        // refresh expired access token using a refresh token.
        this.router.get('/refresh', (req, res) => {
            // check if refresh token is valid
            if (!req.cookies.refreshToken || !req.headers.authorization) {
                return responseGen.send(res, 401);
            }
            // if valid, return new access token
            if (verifyToken(req.cookies.refreshToken, 0)) {
                // parse refresh token
                const oldAccessTokenInfo = jwt.decode(req.headers.authorization.split(' ')[1]);
                const accessToken = generateToken(oldAccessTokenInfo, undefined, process.env.ACCESS_TOKEN_EXPIRED_TIME);

                return responseGen.send(res, 200, {
                    result: {
                        accessToken: accessToken.token,
                        tokenIndex: accessToken.clientKeyIndex
                    }
                });
            }
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