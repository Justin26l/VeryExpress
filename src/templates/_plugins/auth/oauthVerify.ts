// {{headerComment}}

import { Profile } from "passport";
import { UserModel, UserDocument } from "./../../_models/UserModel.gen";
import { User } from "./../../_types/User.gen";
import { generateToken } from "./../auth/jwt.gen";
import utils from "../../_utils/index.gen";

interface IProfile extends Profile {
    [key: string]: any;
}

export default async function oauthVerify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void) : Promise<void> {
    try {

        console.log("OAuthVerify", profile);

        // find or create user
        let userProfile: any;
        const authProfile = oauthProfileMapping(profile);

        if (!authProfile.email){
            return done(JSON.stringify({
                provider: profile.provider,
                message: "Email is required"
            }));
        };
        
        // user email as human readible identifier
        const existingUser = await UserModel.findOne<User>({ email: profile.emails?.[0].value });
        if( !existingUser ){
            utils.log.info("OAuthVerify - New User Logging In");
            const newUser = new UserModel(authProfile);
            await newUser.save();
            userProfile = newUser;
        }
        else {
            utils.log.info("OAuthVerify - Existing User Logging In");

            // check existingUser's auth profile have the same provider
            const isExistingAuthProfile = await existingUser.authProfiles.find((authProfile) => authProfile.provider === profile.provider);
            // if not add the new auth profile to the user
            if(!isExistingAuthProfile){
                utils.log.info("OAuthVerify - Existing User Logging In - New Auth Provider");

                existingUser.authProfiles?.push(authProfile.authProfiles[0]);
                await UserModel.updateOne({ email: profile.emails?.[0].value }, existingUser);
            }
            userProfile = existingUser;
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

function sanitizeUser(user: UserDocument){
    return {
        _id: user._id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        roles: user.roles
    };
}

function oauthProfileMapping(oauthProfile: IProfile): User
{
    switch(oauthProfile.provider){
    case "github":
        return GithubProfileMapping(oauthProfile);
    case "google":
        return GoogleProfileMapping(oauthProfile);
    default:
        throw new Error("Invalid OAuth Profile");
    }
}

function GithubProfileMapping(oauthProfile: IProfile): User
{
    const user: User = {
        active: true,
        authProfiles: [{
            provider: oauthProfile.provider,
            id: oauthProfile.id
        }],
        roles:[],
        name: oauthProfile.username || oauthProfile.displayName,
        // data below could be missing depend on the provider
        email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
        locale: undefined,
    };

    return user;
}

function GoogleProfileMapping(oauthProfile: IProfile): User
{
    const user: User = {
        active: true,
        authProfiles: [{
            provider: oauthProfile.provider,
            id: oauthProfile.id
        }],
        roles:[],
        name: oauthProfile.username || oauthProfile.displayName,
        // data below could be missing depend on the provider
        email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
        locale: undefined
    };

    return user;
}
