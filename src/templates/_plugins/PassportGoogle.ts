// {{headerComment}}

import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import { AuthenticateOptionsGoogle, Strategy as GoogleStrategy, StrategyOptions, VerifyCallback } from "passport-google-oauth20";
import { UserModel } from "./../_models/UserModel.gen";
import { generateToken } from "../_utils/jwt.gen";
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
                callbackURL: `${process.env.APP_HOST}/auth/google/callback`,
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
                const reqUser: any = req.user;
                const user = {
                    _id: reqUser._id.toString(),
                    email: reqUser.email,
                    name: reqUser.name,
                }
                console.log('req.user', user);
                const token = generateToken(user);
                res.cookie('jwt', token, { httpOnly: true, secure: true });
                res.redirect("/profile");
            }
        );
    }

    public passportSerializeUser() {
        this.passport.serializeUser(async (user, done) => {
            // you can decide what data to store in the session here.
            // this data will be used in `deserializeUser` to retrieve the full user object.
            // ussually just user's id.

            // store role in session for access control
            const DbUser = await UserModel.findById(user);
            if (DbUser) {
                done(null, DbUser);
            } else {
                done(new Error("User not found"));
            }

            done(null, user);
        });
    }

    public async passportDeserializeUser() {
        this.passport.deserializeUser(async (id, done) => {

            const user = await UserModel.findById(id);
            if (user) {
                done(null, user);
            } 
            else {
                done(new Error("User not found"));
            }
            
        });
    }

}