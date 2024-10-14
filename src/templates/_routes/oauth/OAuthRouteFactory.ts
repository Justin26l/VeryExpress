// {{headerComment}}

import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import * as oauth2 from "passport-oauth2";
import responseGen from "../../_utils/response.gen";
import { generateToken, verifyToken } from "../../_plugins/auth/jwt.gen";

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
        // redirect to login
        this.router.get("/",
            this.passport.authenticate(this.config.strategyName, this.config.authenticateOptions)
        );

        // back from login
        this.router.get("/callback", 
            this.passport.authenticate(this.config.strategyName, this.config.authenticateOptions), 
            (req, res) => {
                const user = req.user as any;
                const tokenInfo = user.tokenInfo;
                res.redirect(`/profile?accessToken=${tokenInfo.token}&tokenIndex=${tokenInfo.clientIndex}`);
            }
        );

        // // refresh expired token
        // this.router.get("/refresh", 
        //     this.passport.authenticate(this.config.strategyName, this.config.authenticateOptions), 
        //     (req, res) => {
        //         const user = req.user as any;

        //         // create new token 
        //         // 1. get user info from token
        //         const tokenData = verifyToken(user.tokenInfo.token, user.tokenInfo.clientIndex);

        //         // 2. create new token if token is valid
        //         if (tokenData) {
        //             responseGen.send(
        //                 res,
        //                 200,
        //                 undefined,
        //                 generateToken(tokenData)
        //             );
        //         }
        //         else{
        //             responseGen.send(res, 401);
        //         }
        //     }
        // );
    }

    public getRouter() {
        return this.router;
    }
}