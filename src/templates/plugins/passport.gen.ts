// const express = require('express');
// const rbac = require('./rbac'); // hypothetical RBAC module

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

import log from '../utils/log.gen';
// import { UserModel } from '../models/UserModel.gen';

passport.use(new GoogleStrategy({
    clientID: process.env.G_OAUTH_CLIENTID || '',
    clientSecret: process.env.G_OAUTH_CLIENTSECRET || '',
    callbackURL: "http://localhost:3000/auth/google/callback"
},
    async function (accessToken, refreshToken, profile, cb) {
        // const user = await UserModel.findOne({ googleId: profile.id });
        // if (user) {
        //     return cb(null, user);
        // }
        // const newUser = new UserModel({ googleId: profile.id });
        // await newUser.save();
        // return cb(null, newUser);
        log.info('oauth', { accessToken, refreshToken, profile});
        return cb(null, {
            accessToken: accessToken,
            refreshToken: refreshToken,
            profile: profile
        });
    }
));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user as any);
});

export default passport;