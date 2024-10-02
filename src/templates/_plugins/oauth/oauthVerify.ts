// {{headerComment}}

import { Profile } from "passport";
import { UserModel, UserDocument } from "./../../_models/UserModel.gen";
import { generateToken } from "./../auth/jwt.gen";

interface IProfile extends Profile {
    [key: string]: any;
}

function sanitizeUser(user: UserDocument){
    return {
        _id: user._id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        roles: user.roles
    };
}

interface userProfile {
    authProvider: {
        provider: string;
        id: string;
    }[];
    email: string;
    name: string;
    isActive: boolean;
    locale?: string;
}

// function oauthProfileGithubMapping(oauthProfile: any): userProfile
// {
//     const user: userProfile = {
//         authProvider: [],
//         email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
//         name: oauthProfile.username || oauthProfile.displayName,
//         isActive: true,
//         locale: undefined
//     };
//     user.authProvider.push({
//         provider: String(oauthProfile.provider),
//         id: String(oauthProfile.id)
//     });
//     // user need to fill in their email
//     return user;
// }


export default async function oauthVerify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void) : Promise<void> {
    try {

        // find or create user
        let userProfile: any;
        const existingUser = await UserModel.findOne({ email: profile.emails?.[0].value });

        if( existingUser ){
            userProfile = existingUser;
            // log.info('OAuthVerify ExistingUser');
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
                locale: profile._json?.locale || "en",
            });
            newUser.save();
            userProfile = newUser;
        }

        const sanitizedProfile = sanitizeUser(userProfile);
        const tokenInfo = generateToken(sanitizedProfile);
        return done(null, {
            profile: sanitizedProfile, 
            tokenInfo
        });
    }
    catch(err) { 
        return done(err); 
    }
}