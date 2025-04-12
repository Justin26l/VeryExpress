// {{headerComment}}

import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import * as oauth2 from "passport-oauth2";
import { SessionModel } from "../../_models/SessionModel.gen";
import path from "path";

export type { Profile };

export interface passportFactoryConfig {
    strategyName: string,
    strategy: oauth2.Strategy,
    authenticateOptions?: any,
}

/** Provides a router and passport instance for Google OAuth */
export default class OAuthRouteFactory {

    private config: passportFactoryConfig;
    private router: Router = Router();
    private passport: PassportStatic = passport;

    private loginSuccessRedirectPath = "";
    private loginFailedRedirectPath = "";

    constructor(config: passportFactoryConfig ) {

        this.config = config;
        this.config.authenticateOptions = this.config.authenticateOptions || { 
            session: false, 
            scope: ["profile", "email"], 
            failureRedirect: ""
        };
        
        this.loginSuccessRedirectPath = path.posix.join("/", process.env.LOGIN_SUCCESS_REDIRECT_PATH || "/logincallback");
        this.loginFailedRedirectPath = path.posix.join("/", process.env.LOGIN_FAILED_REDIRECT_PATH || "/logincallback");
        
        this.initPassport(this.config.strategy);
        this.initRoutes();

    }

    private initPassport(strategy: passport.Strategy){
        this.passport.use(strategy);
        this.passport.initialize();
    }
    

    private initRoutes(){
        // redirect to provider's login page
        this.router.get("/",
            this.passport.authenticate(this.config.strategyName, this.config.authenticateOptions)
        );

        // back from provider's login page
        // insert temporary sessionCode to database
        this.router.get("/callback", 
            this.passport.authenticate(this.config.strategyName, this.config.authenticateOptions), 
            (req, res) => {
                const { state, error } = req.query;

                if(error){
                    return res.redirect(`${this.loginFailedRedirectPath}?error=${error}`);
                }
                else if(state){
                    return res.redirect(`${this.loginFailedRedirectPath}?state=${state}`);
                }
                else if(!req.user){
                    return res.redirect(`${this.loginFailedRedirectPath}?error=invalid user`);
                }

                const sessionCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

                SessionModel.create({ 
                    sessionCode: sessionCode, 
                    // @ts-expect-error custom var
                    userId: req.user.profile._id, 
                    // @ts-expect-error custom var
                    provider: req.user.provider || "", 
                    expired: Date.now() + 5000 
                });

                // dummy code, need client side key's encoding
                
                // return appAuthCode to client
                res.redirect(`${this.loginSuccessRedirectPath}?code=${sessionCode}`);
            }
        );

    }
    public getRouter() {
        return this.router;
    }
}