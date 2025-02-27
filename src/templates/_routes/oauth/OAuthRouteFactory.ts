// {{headerComment}}

import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import * as oauth2 from "passport-oauth2";
// import responseGen from "../../_utils/response.gen";
// import { generateToken, verifyToken } from "../../_plugins/auth/jwt.gen";

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

    constructor(config: passportFactoryConfig ) {

        this.config = config;
        this.config.authenticateOptions = this.config.authenticateOptions || { 
            session: false, 
            scope: ["profile", "email"], 
            failureRedirect: ""
        };
        
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
        this.router.get("/callback", 
            this.passport.authenticate(this.config.strategyName, this.config.authenticateOptions), 
            (req, res) => {
                const { code, state, error } = req.query;
                console.log("/callback", { code, state, error });

                if(error){
                    return res.redirect(`/profile?error=${error}`);
                }
                else if(state){
                    return res.redirect(`/profile?state=${state}`);
                }

                // insert {appAuthCode : userData} to db, 5s expired
                // dummy code, need client side key's encoding
                const appAuthCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); 
                
                // return appAuthCode to client
                res.redirect(`/profile?code=${appAuthCode}`);
            }
        );

    }
    public getRouter() {
        return this.router;
    }
}