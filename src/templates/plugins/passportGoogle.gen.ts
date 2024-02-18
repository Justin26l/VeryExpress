// {{headerComment}}

import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import { AuthenticateOptionsGoogle, Strategy as GoogleStrategy, StrategyOptions, VerifyCallback } from "passport-google-oauth20";
// import log from '../utils/logger.gen';

export type { Profile };

export interface passportGoogleConfig {
    strategyConfig: {
        options?: StrategyOptions,
        verify: (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => void
    },
    authenticateOptionsGoogle?: AuthenticateOptionsGoogle,
}

/** Provides a router and passport instance for Google OAuth */
export default class PassportGoogle {

    private config: passportGoogleConfig;
    public router: Router = Router();
    public passport: PassportStatic = passport;

    constructor(config: passportGoogleConfig ) {

        this.config = config;

        this.passport.use(new GoogleStrategy(
            this.config.strategyConfig.options || {
                clientID: process.env.OAUTH_GOOGLE_CLIENTID || "",
                clientSecret: process.env.OAUTH_GOOGLE_CLIENTSECRET || "",
                callbackURL: `${process.env.APP_HOST}:${process.env.APP_PORT}/auth/google/callback`,
            },
            this.config.strategyConfig.verify
        ));

        // redirect to google login
        this.router.get("/auth/google",
            this.passport.authenticate("google", this.config.authenticateOptionsGoogle || { scope: ["profile", "email"] })
        );

        // back from google login
        this.router.get("/auth/google/callback", 
            this.passport.authenticate("google", { failureRedirect: "/login" }), 
            (req, res) => {
                // res.send(`Hello, user <pre>${req.user}</pre>`);
                res.redirect("/profile");
            }
        );
    }

    public async passportSerializeUser() {

        await this.passport.serializeUser((user, done) => {
            // log.info('passportGoogle().serializeUser', user)
            done(null, user);
        });

        await this.passport.deserializeUser((id, done) => {
            // log.info('passportGoogle().deserializeUser', id)
            done(null, { id });
        });
    }

}