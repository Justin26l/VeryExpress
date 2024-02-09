import { Router } from 'express';
import passport, { PassportStatic, Profile } from 'passport';
import { AuthenticateOptionsGoogle, Strategy as GoogleStrategy, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';

/** Provides a router and passport instance for Google OAuth */
export default class passportGoogle {

    public router: Router = Router();
    public passport: PassportStatic = passport;

    constructor(config: {
        strategyConfig: {
            options?: StrategyOptions,
            verify: (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => void
        },
        authenticateOptionsGoogle: AuthenticateOptionsGoogle,
    }) {

        this.passport.use(new GoogleStrategy(
            config.strategyConfig.options || {
                clientID: process.env.OAUTH_GOOGLE_CLIENTID || '',
                clientSecret: process.env.OAUTH_GOOGLE_CLIENTSECRET || '',
                callbackURL: process.env.OAUTH_GOOGLE_CALLBACKURL || '',
            },
            config.strategyConfig.verify
        ));

        this.passport.serializeUser((user, done) => {
            done(null, user);
        });

        this.passport.deserializeUser((user, done) => {
            done(null, user as any);
        });

        this.router.get('/auth/google',
            this.passport.authenticate('google', config.authenticateOptionsGoogle || { scope: ['profile', 'email'] })
        );

    }
};