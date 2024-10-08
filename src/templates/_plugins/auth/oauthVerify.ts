// {{headerComment}}

import { Profile } from "passport";
import { UserModel, UserDocument } from "./../../_models/UserModel.gen";
import { User } from "./../../_types/User.gen";
import { generateToken } from "./../auth/jwt.gen";

interface IProfile extends Profile {
    [key: string]: any;
}

export default async function oauthVerify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void) : Promise<void> {
    try {

        console.log("OAuthVerify", profile);

        // find or create user
        let userProfile: any;
        const authProfile = oauthProfileMapping(profile);

        if(!authProfile.email){
            return done(new Error("Email is required"));
        }

        // user's human readible unique identifier is email
        const existingUser = await UserModel.findOne({ email: profile.emails?.[0].value });

        if( existingUser ){
            console.log("OAuthVerify ExistingUser");
            userProfile = existingUser;
        }
        else {
            console.log("OAuthVerify NewUser");
            const newUser = new UserModel({
                authProviders: [{
                    provider: profile.provider,
                    id: profile.id
                }],
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
