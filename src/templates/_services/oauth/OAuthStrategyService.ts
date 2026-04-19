// {{headerComment}}
import { UserModel, UserDocument } from "./../../_models/UserModel.gen";
import { User } from "./../../_types/User.gen";
import JWTService from "./../auth/JWTService.gen";
import OAuthProfileMap, { IProfile } from "./OAuthProfileMap.gen";
import utils from "../../_utils";


export default class OAuthStrategyService {

    public async verify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void) : Promise<void> {
        try {

            let user: any;
            const authUser = new OAuthProfileMap().map(profile);

            // find user by userAuthProfiles.oauthId or email
            const existingUser = await UserModel.findOne({ 
                email: authUser.email,
                $or: authUser.userAuthProfiles?.map((p: any) => {
                    return { "userAuthProfiles.oauthId": p.oauthId };
                }),
            });

            // 1. create new user
            if ( !existingUser ){
                user = await this.createNewUser(authUser);
            }
            // 2. update existing user
            else {
                console.log("OAuthVerify UpdateUser");
                user = await this.processExistingUser(authUser, existingUser);
            }

            // set req.user
            done(null, {
                provider: profile.provider,
                profile: new JWTService().sanitizeUser(user),
            });
        }
        catch(err) { 
            return done(err); 
        }
    }

    private async createNewUser(authProfile: User): Promise<UserDocument>{
        utils.log.info("OAuthVerify > createNewUser");
        const newUser = new UserModel(authProfile);
        return await newUser.save();
    }

    private async processExistingUser( authUser: User, existingUser: any): Promise<any>{    
        utils.log.info("OAuthVerify > processExistingUser");

        let userUpdated = false;
        const authProfile = authUser.userAuthProfiles?.[0] || undefined;
        const userProfiles = existingUser.userAuthProfiles as User["userAuthProfiles"] || [];

        if(!authProfile){
            utils.log.errorNoExit("OAuthVerify > Invalid OAuth Callback \"authProfile\"");
            throw new Error("Invalid OAuth Callback \"authProfile\"");
        }

        // B.1. check current provider exist in authProfiles
        const providerExists = userProfiles.length > 0 &&  userProfiles.find((p: any) => {
            return (p.provider === authProfile.provider) && (p.oauthId === authProfile.oauthId);
        });

        // B.2. add if not exist
        if (!providerExists){
            utils.log.info("OAuthVerify > add new provider",authProfile.provider);
            userProfiles.push(authProfile);
            userUpdated = true;
        }
        // B.3 update if username changed
        else if (providerExists && providerExists.username !== authProfile.username){
            utils.log.info("OAuthVerify > update username", authProfile.provider);
            providerExists.username = authProfile.username;
            userUpdated = true;
        }

        if (userUpdated){
            utils.log.info("OAuthVerify > Update user");
            return await existingUser.updateOne({ userAuthProfiles: userProfiles });
        }
        else {
            return existingUser;
        }
    }


}
