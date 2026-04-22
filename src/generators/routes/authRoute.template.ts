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
import VexDb from '../_services/VexDb.gen';
import { SessionEntity } from '../_models/SessionModel.gen';
import VexResponseError from '../_types/VexResponseError.gen';
{{localAuthImport}}
import VexSystem from '../_services/VexSystem.gen';

export default class AuthRouter {
    
    private JWTService = new JWTService();
    private OAuthStrategyService = new OAuthStrategyService();
    private router: Router = Router();

    private userRepo = VexDb.getRepository(UserEntity);
    private uapRepo = VexDb.getRepository(UserAuthProfilesEntity);
    private sessionRepo = VexDb.getRepository(SessionEntity);

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
        this.router.post('/token', vexSystem.RouteHandler(async (req, res) => {
            
            // todo: disable this route if use httpOnly Cookie
            
            if (!req.query.code) {
                return utils.response.send(res, 401);
            }

            const sessionCode = String(req.query.code);

            // find code in database
            const sessionDoc = await this.sessionRepo.findOne({ where: { sessionCode } });

            if (!sessionDoc) {
                return utils.response.send(res, 404, { message: 'invalid code' });
            };

            if (sessionDoc.expired < Date.now()) {
                return utils.response.send(res, 401, { message: 'code expired' });
            };

            if (sessionDoc) {
                await this.sessionRepo.delete({ sessionCode });
            };

            // generate tokens based on code's user profile
            const accessToken = await this.JWTService.generateAccessToken(sessionDoc.userId);
            const refreshToken = this.JWTService.generateRefreshToken({_id: sessionDoc.userId});

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
        this.router.post('/refresh', vexSystem.RouteHandler(async (req, res) => {
            
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
        template = template.replace(/{{localAuthImport}}/g, "import { UserEntity } from '../_models/UserModel.gen';\nimport { UserAuthProfilesEntity } from '../_models/UserAuthProfilesModel.gen';\n");
        template = template.replace(/{{localAuthRoutes}}/g, `
        // Local Auth register & login
        this.router.post('/register', async (req, res) => {
            try {
                const { email, password } = req.body;
                if (!email || !password) {
                    return utils.response.send(res, 400, { message: "Email and password are required." });
                }

                // Check if user already exists
                const existingUser = await this.userRepo.findOne({ where: { email } });
                if (existingUser) {
                    return utils.response.send(res, 409, { message: "Email already registered." });
                }

                // Hash password with salt (email)
                const hashedPassword = utils.hash.hashPassword(password, email);

                // Create user
                const user = await this.userRepo.save(this.userRepo.create({
                    name: email.split('@')[0],
                    email,
                    active: true,
                }));

                // create local auth profile row linked to the user
                try {
                    await this.uapRepo.save(this.uapRepo.create({
                        userId: user._id,
                        provider: 'local',
                        password: hashedPassword
                    }));
                } catch (e) {
                    // if profile creation fails, delete the created user to avoid partial state
                    try { await this.userRepo.delete({ _id: user._id }); } catch (ee) {}
                    throw e;
                }

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
                    const user = await this.userRepo.findOne({ where: { email } });
                    if (!user) {
                        return utils.response.send(res, 400, { message:"incorrect email or password." });
                    }

                    // load auth profiles separately (no ORM relation defined)
                    const authProfiles = await this.uapRepo.find({ where: { userId: user._id } });
                    const localAuthProfile = authProfiles.find((p) => p.provider === 'local');
                    if (!localAuthProfile) {
                        return utils.response.send(res, 400, { message:"incorrect email or password." });
                    }

                    // verify password using hash util (pass combined user+profiles object)
                    const isMatch = utils.hash.verifyPassword({ ...user, userAuthProfiles: authProfiles } as any, password);
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
    else {
        template = template.replace(/{{localAuthImport}}/g, "");
        template = template.replace(/{{localAuthRoutes}}/g, "");
    }
    
    return template;
}