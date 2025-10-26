// {{headerComment}}
import path from "path";
import { Router } from "express";
import passport, { PassportStatic, Profile } from "passport";
import * as oauth2 from "passport-oauth2";
import JWTService from "../../_services/auth/JWTService.gen";
import { User } from "../../_types/User.gen";

export type { Profile };

export interface passportFactoryConfig {
    strategyName: string,
    strategy: oauth2.Strategy | passport.Strategy,
    authenticateOptions?: any,
}

/** Provides a router and passport instance for Google OAuth */
export default class OAuthRouteFactory {

    private config: passportFactoryConfig;
    private router: Router = Router();
    private passport: PassportStatic = passport;
    private JWTService = new JWTService();

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
            async (req, res) => {
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

                // return appAuthCode to client
                const redirectUrl = await this.JWTService.assignTokens(req.user as User, res);
                return res.redirect(redirectUrl);
                
            }
        );
    }
    public getRouter() {
        return this.router;
    }
}