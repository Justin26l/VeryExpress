// {{headerComment}}

import { Profile } from "passport";
import { UserModel } from "../models/UserModel.gen";

interface IProfile extends Profile {
    [key: string]: any;
}

export default async function oauthVerify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void) : Promise<void> {
    try {

        // find or create user
        const existingUser = await UserModel.findOne({ email: profile.emails?.[0].value });

        if( existingUser ){
            // log.info('OAuthVerify ExistingUser');
            return done(null, existingUser);
        }
        else {
            // log.info('OAuthVerify NewUser');
            const newUser = new UserModel({
                authProvider: profile.provider,
                email: profile.emails?.[0].value || "",
                authId: profile.id,
                name: profile.displayName,
                familyName: profile.name?.familyName, 
                givenName: profile.name?.givenName,
                isActive: true,
                locale: profile._json?.locale,
            });
            newUser.save();
            return done(null, newUser);
        }
    }
    catch(err) { 
        return done(err); 
    }
}