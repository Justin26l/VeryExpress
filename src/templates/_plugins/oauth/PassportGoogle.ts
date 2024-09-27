// {{headerComment}}

import crypto from "crypto";
import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import { AuthenticateOptionsGoogle, Strategy as GoogleStrategy, StrategyOptions, VerifyCallback } from "passport-google-oauth20";

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
        this.config.authenticateOptionsGoogle = this.config.authenticateOptionsGoogle || { 
            session: false, 
            scope: ["profile", "email"], 
            failureRedirect: "/login"
        };

        this.passport.use(new GoogleStrategy(
            this.config.strategyConfig.options || {
                clientID: process.env.OAUTH_GOOGLE_CLIENTID || "",
                clientSecret: process.env.OAUTH_GOOGLE_CLIENTSECRET || "",
                callbackURL: `${process.env.APP_HOST}/auth/google/callback`,
            },
            this.config.strategyConfig.verify
        ));

        // redirect to google login
        this.router.get("/auth/google",
            this.passport.authenticate("google", this.config.authenticateOptionsGoogle)
        );

        // back from google login
        this.router.get("/auth/google/callback", 
            this.passport.authenticate("google", this.config.authenticateOptionsGoogle), 
            (req, res) => {
                const user = req.user as any;
                
                const nonce = crypto.randomBytes(16).toString("base64");
                res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
                res.cookie("tokenIndex", user.tokenInfo.clientIndex, { httpOnly: true });
                res.send(`<script nonce="${nonce}">
                    window.location.href = '/checkprofile?token=${user.tokenInfo.token}';
                </script>`);
            }
        );
    }
}