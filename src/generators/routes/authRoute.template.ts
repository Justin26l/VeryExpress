import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

export default function template(
    compilerOptions: types.compilerOptions,
): string {
    let template = `{{headerComment}}
import { Router } from 'express';
import utils from '../_utils';

import JWTService from '../_services/auth/JWTService.gen';
import OAuthStrategyService from '../_services/oauth/OAuthStrategyService.gen';

import OAuthRouteFactory from './oauth/OAuthRouteFactory.gen';
import { Strategy as GithubStrategy } from 'passport-github';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { SessionDocument, SessionModel } from '../_models/SessionModel.gen';
{{localAuthImport}}
import VexSystem from '../_services/VexSystem.gen';

export default class AuthRouter {
    
    private JWTService = new JWTService();
    private OAuthStrategyService = new OAuthStrategyService();
    private router: Router = Router();

    constructor() {
        const vexSystem = new VexSystem();
        {{pathTokenExchangeAndRefresh}}
        {{localAuthRoutes}}

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
                    callbackURL: \`\${process.env.APP_HOST}:\${process.env.APP_PORT}/auth/\${google}/callback\`,
                },
                this.OAuthStrategyService.verify
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
                    callbackURL: \`\${process.env.APP_HOST}:\${process.env.APP_PORT}/auth/\${github}/callback\`,
                },
                this.OAuthStrategyService.verify
            )
        });
        this.router.use(\`/\${github}\`, OAuthGithub.getRouter());
        `;
        }
    }).join("\n");
    template = template.replace(/{{OAuthRouteProviders}}/g, providersTemplate);

    if(compilerOptions.auth.localAuth || compilerOptions.auth.oauthProviders) {
        template = template.replace(/{{pathTokenExchangeAndRefresh}}/g, `
        // Exchange an authorization code for tokens.
        this.router.post('/token', (req, res) => vexSystem.RouteHandler(req, res, async ()=> {
            
            // todo: disable this route if use httpOnly Cookie
            
            if (!req.query.code) {
                return utils.response.send(res, 401);
            }

            const sessionCode = req.query.code;
            // find code in database
            const sessionDoc = await SessionModel.findOne<SessionDocument>({ sessionCode: sessionCode }).exec();

            if (!sessionDoc) {
                return utils.response.send(res, 404, { message: 'invalid code' });
            }
            else {
                await SessionModel.deleteOne({ sessionCode: sessionCode }).exec();
                // log.info("Session Found & Deleted", sessionDoc);
            };

            if (sessionDoc?.get('expired') < Date.now()) {
                return utils.response.send(res, 401, { message: 'code expired' });
            };

            // generate tokens based on code's user profile
            const accessToken = await this.JWTService.generateAccessToken(sessionDoc.get("userId"));
            const refreshToken = this.JWTService.generateRefreshToken({_id: sessionDoc.get("userId")});

            return utils.response.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientIndex,
                    refreshToken: refreshToken.token,
                    refreshTokenIndex: refreshToken.clientIndex
                }
            });
        }));

        // Refresh expired tokens by refresh token.
        this.router.post('/refresh', (req, res) => vexSystem.RouteHandler(req, res, async () => {
            
            // todo: change this return if use httpOnly Cookie

            if (
                !req.body.refreshToken || 
                !req.body.refreshTokenIndex
            ) {
                console.log("invalid /refresh payload");
                return utils.response.send(res, 401);
            };

            let refreshTokenPayload = this.JWTService.verifyToken(req.body.refreshToken, req.body.refreshTokenIndex);
            
            // new tokens generated
            const accessToken = await this.JWTService.generateAccessToken(refreshTokenPayload._id);

            return utils.response.send(res, 200, {
                result: {
                    accessToken: accessToken.token,
                    accessTokenIndex: accessToken.clientIndex
                }
            });
        }));`);
    }

    if(compilerOptions.auth.localAuth) {
        template = template.replace(/{{localAuthImport}}/g, "import { UserModel } from '../_models/UserModel.gen';\n");
        template = template.replace(/{{localAuthRoutes}}/g, `
        // Local Auth register & login
        this.router.post('/register', async (req, res) => {
            try {
                const { email, password } = req.body;
                if (!email || !password) {
                    return utils.response.send(res, 400, { message: "Email and password are required." });
                }

                // Check if user already exists
                const existingUser = await UserModel.findOne({ email }).exec();
                if (existingUser) {
                    return utils.response.send(res, 409, { message: "Email already registered." });
                }

                // Hash password with salt (email)
                const hashedPassword = utils.hash.hashPassword(password, email);

                // Create user with local auth profile
                const user = new UserModel({
                    name: email.split('@')[0],
                    email,
                    authProfiles: [
                        {
                            provider: 'local',
                            password: hashedPassword
                        }
                    ]
                });
                await user.save();

                return utils.response.send(res, 201, { message: "Registration successful." });
            } catch (err:any) {
                return utils.response.send(res, 500, { message: err?.message || "Registration failed." });
            }
        });


        this.router.use('/local', 
            async (req, res, next) => {
                const { email, password } = req.body;
                if (!email || !password) {
                    return utils.response.send(res, 400, { message: "Email and password are required." });
                }

                try {
                    // verify user credentials
                    const user = await UserModel.findOne({ email }).exec();
                    if (!user) {
                        return utils.response.send(res, 400, { message:"incorrect email or password." });
                    }
                    
                    const localAuthProfile = user.authProfiles?.find(profile => profile.provider === 'local');
                    if (!localAuthProfile) {
                        return utils.response.send(res, 400, { message:"incorrect email or password." });
                    }

                    const isMatch = await utils.hash.verifyPassword(user, password);
                    if (!isMatch) {
                        return utils.response.send(res, 400, { message:"incorrect email or password." });
                    }

                    // return tokens to client
                    const redirectUrl = await this.JWTService.assignTokens(user);
                    return utils.response.send(res, 302, {
                        result: {
                            url: redirectUrl,
                        }
                    });

                } catch (err: any) {
                    console.error("Login error:", err);
                    return utils.response.send(res, 500, { message: err?.message || "Login failed." });
                }
            }
        );

        `);
    }
    
    return template;
}