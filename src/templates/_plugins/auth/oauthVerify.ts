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

        let user: UserDocument;
        const authUser = oauthProfileMapping(profile);
        const existingUser = !authUser.email ? null : await UserModel.findOne<UserDocument>({ email: authUser.email });

        // 1. create new user
        if ( !existingUser ){
            console.log('OAuthVerify NewUser');
            user = await createNewUser(authUser);
        }
        // 2. update existing user
        else {
            console.log('OAuthVerify UpdateUser');
            user = existingUser;
            
            let userUpdated = false;
            const authProfile = authUser.authProfiles?.[0] || undefined;
            const userProfiles = user.authProfiles as User['authProfiles'] || [];

            if(!authProfile){
                throw new Error('Invalid OAuth Callback "authProfile"');
            };

            // 2.A. if email is missing, try get from authProfile
             if (!user.email && authUser.email){
                console.log('set new email');
                user.email = authUser.email;
                user.active = true;
                userUpdated = true;
            };

            // 2.B.1. check current provider exist in authProfiles
            const providerExists = userProfiles.length > 0 &&  userProfiles.find((p) => {
                return (p.provider === authProfile.provider) && (p.authId === authProfile.authId);
            });

            // 2.B.2. add if not exist
            if (!providerExists){
                userProfiles.push(authProfile);
                userUpdated = true;
            }
            // 2.B.3 update if username changed
            else if (providerExists && providerExists.username !== authProfile.username){
                providerExists.username = authProfile.username;
                userUpdated = true;
            };

            if (userUpdated){
                user = await existingUser.updateOne({ authProfiles: userProfiles });
            };
        };

        done(null, returnToken(user));
    }
    catch(err) { 
        return done(err); 
    }
}

async function createNewUser(authProfile: User): Promise<UserDocument>{
    console.log('OAuthVerify NewUser');
    const newUser = new UserModel(authProfile);
    return await newUser.save();
}

function returnToken(userProfile: UserDocument){
    const sanitizedProfile = sanitizeUser(userProfile);
    const tokenInfo = generateToken(sanitizedProfile);
    return {
        profile: sanitizedProfile, 
        tokenInfo
    };
}

function sanitizeUser(user: UserDocument){
    return {
        _id: user._id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        roles: user.roles,
        profileErrors: user.profileErrors,
        active: user.active
    };
}

function oauthProfileMapping(oauthProfile: IProfile): User
{
    let authProfile: User;
    switch(oauthProfile.provider){
        case "github":
            authProfile = GithubProfileMapping(oauthProfile);
            break;
        case "google":
            authProfile = GoogleProfileMapping(oauthProfile);
            break;
        default:
            throw new Error('Invalid OAuth Provider');
            break;
    }

    if ( !authProfile.email){
        console.log('missingEmail');
        authProfile.profileErrors?.push('missingEmail');
        authProfile.active = false;
    }
    return authProfile;
}

function GithubProfileMapping(oauthProfile: IProfile): User
{
    const user: User = {
        active: true,
        authProfiles: [{
            provider: oauthProfile.provider,
            authId: oauthProfile.id,
            username: oauthProfile.username || oauthProfile.displayName
        }],
        roles: undefined,
        name: oauthProfile.username || oauthProfile.displayName,
        email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
        locale: undefined,
        profileErrors: []
    };

    return user;
}

function GoogleProfileMapping(oauthProfile: IProfile): User
{
    const user: User = {
        active: true,
        authProfiles: [{
            provider: oauthProfile.provider,
            authId: oauthProfile.id,
            username: oauthProfile.username || oauthProfile.displayName
        }],
        roles: undefined,
        name: oauthProfile.username || oauthProfile.displayName,
        // data below could be missing depend on the provider
        email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
        locale: oauthProfile._json.locale || undefined,
        profileErrors: []
    };

    return user;
}