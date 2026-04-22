// {{headerComment}}
import { DeepPartial } from "typeorm";
import { UserEntity } from "./../../_models/UserModel.gen";
import { UserAuthProfilesEntity } from "./../../_models/UserAuthProfilesModel.gen";
import { User } from "./../../_types/User.gen";
import { UserAuthProfiles } from "./../../_types/UserAuthProfiles.gen";
import JWTService from "./../auth/JWTService.gen";
import OAuthProfileMap, { IProfile } from "./OAuthProfileMap.gen";
import VexDb from "./../VexDb.gen";
import VexResponseError from "../../_types/VexResponseError.gen";
import utils from "../../_utils";

export default class OAuthStrategyService {
    private userRepo = VexDb.getRepository(UserEntity);
    private uapRepo = VexDb.getRepository(UserAuthProfilesEntity);

    public async verify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void): Promise<void> {
        try {

            let user: UserEntity;
            const authUser = new OAuthProfileMap().map(profile);
            const authProfile = authUser.userAuthProfiles?.[0];

            // find user by oauthId + provider, or fall back to email
            let existingUser: UserEntity | null = null;
            if (authProfile?.oauthId && authProfile?.provider) {
                const matchedProfile = await this.uapRepo.findOne({
                    where: { oauthId: authProfile.oauthId, provider: authProfile.provider },
                });
                if (matchedProfile?.userId) {
                    existingUser = await this.userRepo.findOne({ where: { _id: matchedProfile.userId } });
                }
            }
            if (!existingUser && authUser.email) {
                existingUser = await this.userRepo.findOne({ where: { email: authUser.email } });
            }

            // 1. create new user
            if (!existingUser) {
                user = await this.createNewUser(authUser);
            }
            // 2. update existing user
            else {
                console.log("OAuthVerify UpdateUser");
                user = await this.processExistingUser(authProfile, existingUser);
            }

            // set req.user
            done(null, {
                provider: profile.provider,
                profile: new JWTService().sanitizeUser(user),
            });
        }
        catch (err) {
            return done(err);
        }
    }

    private async createNewUser(authProfile: User): Promise<UserEntity> {
        utils.log.info("OAuthVerify > createNewUser");
        const user = await this.userRepo.save(this.userRepo.create(authProfile as DeepPartial<UserEntity>));

        // create auth profile row linked to the new user
        if (authProfile.userAuthProfiles?.[0]) {
            await this.uapRepo.save(this.uapRepo.create({
                ...authProfile.userAuthProfiles[0],
                userId: user._id,
            } as DeepPartial<UserAuthProfilesEntity>));
        }

        return user;
    }

    private async processExistingUser(incomingProfile: UserAuthProfiles | undefined, existingUser: UserEntity): Promise<UserEntity> {
        utils.log.info("OAuthVerify > processExistingUser");
        
        if (!incomingProfile) {
            utils.log.errorNoExit("OAuthVerify > Invalid OAuth Callback \"authProfile\"");
            throw new Error("Invalid OAuth Callback \"authProfile\"");
        }

        // check if this provider/oauthId already tracked
        const existing = await this.uapRepo.findOne({
            where: { userId: existingUser._id, provider: incomingProfile.provider, oauthId: incomingProfile.oauthId },
        });

        if (!existing) {
            // B.2. add new provider
            utils.log.info("OAuthVerify > add new provider", incomingProfile.provider);
            await this.uapRepo.save(this.uapRepo.create({
                ...incomingProfile,
                userId: existingUser._id,
            } as DeepPartial<UserAuthProfilesEntity>));
        }
        else if (existing.username !== incomingProfile.username) {
            // B.3. update username if changed
            utils.log.info("OAuthVerify > update username", incomingProfile.provider);
            await this.uapRepo.update({ _id: existing._id }, { username: incomingProfile.username });
        }

        return existingUser;
    }
}
