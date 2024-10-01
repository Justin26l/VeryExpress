// {{headerComment}}

import crypto from "crypto";
import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import { Strategy as GithubStrategy, StrategyOptions } from "passport-github";

export type { Profile };

export interface passportConfig {
    strategyConfig: {
        options?: StrategyOptions,
        verify: (accessToken: string, refreshToken: string, profile: Profile, done: any) => void
    },
    authenticateOptionsGithub?: any,
}

/** Provides a router and passport instance for Google OAuth */
export default class PassportGithub {

    private config: passportConfig;
    public router: Router = Router();
    public passport: PassportStatic = passport;

    constructor(config: passportConfig ) {

        this.config = config;
        this.config.authenticateOptionsGithub = this.config.authenticateOptionsGithub || { 
            session: false, 
            scope: ["profile", "email"], 
            failureRedirect: "/login"
        };

        this.passport.use(new GithubStrategy({
            clientID: process.env.OAUTH_GITHUB_CLIENTID || "",
            clientSecret: process.env.OAUTH_GITHUB_CLIENTSECRET || "",
            callbackURL: process.env.APP_HOST+"/auth/github/callback"
        },
        this.config.strategyConfig.verify
        ));

        // redirect to google login
        this.router.get("/auth/github",
            this.passport.authenticate("google", this.config.authenticateOptionsGithub)
        );

        // back from google login
        this.router.get("/auth/github/callback", 
            this.passport.authenticate("google", this.config.authenticateOptionsGithub), 
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