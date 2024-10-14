// {{headerComment}}

import { UserModel, UserDocument } from "./../../_models/UserModel.gen";
import { User } from "./../../_types/User.gen";
import profileMapping, { IProfile } from "./profileMapping.gen";
import returnToken from "./token.gen";

export default async function oauthVerify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void) : Promise<void> {
    try {

        let user: UserDocument;
        const authUser = profileMapping(profile);

        // find user by authProfiles.authId or email
        const existingUser = await UserModel.findOne<UserDocument>({ 
            email: authUser.email,
            $or: authUser.authProfiles?.map((p) => {
                return { 'authProfiles.authId': p.authId };
            }),
        });

        // 1. create new user
        if ( !existingUser ){
            console.log('OAuthVerify NewUser');
            user = await createNewUser(authUser);
        }
        // 2. update existing user
        else {
            console.log('OAuthVerify UpdateUser');
            user = await updateExistingUser(authUser, existingUser);
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

async function updateExistingUser( authUser: User, existingUser: UserDocument): Promise<UserDocument>{    
    let userUpdated = false;
    const authProfile = authUser.authProfiles?.[0] || undefined;
    const userProfiles = existingUser.authProfiles as User['authProfiles'] || [];

    if(!authProfile){
        throw new Error('Invalid OAuth Callback "authProfile"');
    };

    // B.1. check current provider exist in authProfiles
    const providerExists = userProfiles.length > 0 &&  userProfiles.find((p) => {
        return (p.provider === authProfile.provider) && (p.authId === authProfile.authId);
    });

    // B.2. add if not exist
    if (!providerExists){
        console.log('add new provider', authProfile.provider);
        userProfiles.push(authProfile);
        userUpdated = true;
    }
    // B.3 update if username changed
    else if (providerExists && providerExists.username !== authProfile.username){
        console.log('update username', authProfile.provider);
        providerExists.username = authProfile.username;
        userUpdated = true;
    };

    if (userUpdated){
        return await existingUser.updateOne({ authProfiles: userProfiles });
    }
    else {
        return existingUser;
    }
}
