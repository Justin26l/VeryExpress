// {{headerComment}}
import { UserEntity } from "./../../_models/UserModel.gen";
import { UserAuthProfilesEntity } from "./../../_models/UserAuthProfilesModel.gen";
import { User } from "./../../_types/User.gen";
import { UserAuthProfiles } from "./../../_types/UserAuthProfiles.gen";
import { IVexRepository } from "./../../_types/IVexRepository.gen";
import JWTService from "./../auth/JWTService.gen";
import OAuthProfileMap, { IProfile } from "./OAuthProfileMap.gen";
import VexDb from "./../VexDb.gen";
import VexResponseError from "../../_types/VexResponseError.gen";
import utils from "../../_utils";

export default class OAuthStrategyService {

    private get userRepo(): IVexRepository<UserEntity> {
        return VexDb.getRepository(UserEntity);
    }

    private get uapRepo(): IVexRepository<UserAuthProfilesEntity> {
        return VexDb.getRepository(UserAuthProfilesEntity);
    }

    constructor() {}

    public async verify(accessToken: string, refreshToken: string, profile: IProfile, done: (error: any, user?: any) => void): Promise<void> {
        try {

            let user: UserEntity;
            const authUser = new OAuthProfileMap().map(profile);
            const authProfile = authUser.userAuthProfiles?.[0];

            // find user by oauthId + provider, or fall back to email
            let existingUser: UserEntity | null = null;
            if (authProfile?.oauthId && authProfile?.provider) {
                const matchedProfile = await this.uapRepo.findOneWhere(
                    { oauthId: authProfile.oauthId, provider: authProfile.provider },
                );
                if (matchedProfile?.userId) {
                    existingUser = await this.userRepo.findOne(matchedProfile.userId);
                }
            }
            if (!existingUser && authUser.email) {
                existingUser = await this.userRepo.findOneWhere({ email: authUser.email });
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
        const user = await this.userRepo.create(authProfile as Partial<UserEntity>);

        // create auth profile row linked to the new user
        if (authProfile.userAuthProfiles?.[0]) {
            await this.uapRepo.create({
                ...authProfile.userAuthProfiles[0],
                userId: user._id,
            } as Partial<UserAuthProfilesEntity>);
        }

        return user;
    }

    private async processExistingUser(incomingProfile: UserAuthProfiles | undefined, existingUser: UserEntity): Promise<UserEntity> {
        utils.log.info("OAuthVerify > processExistingUser");
        
        if (!incomingProfile) {
            utils.log.error("OAuthVerify > Invalid OAuth Callback \"authProfile\"");
            throw new Error("Invalid OAuth Callback \"authProfile\"");
        }

        // check if this provider/oauthId already tracked
        const existing = await this.uapRepo.findOneWhere(
            { userId: existingUser._id, provider: incomingProfile.provider, oauthId: incomingProfile.oauthId },
        );

        if (!existing) {
            // B.2. add new provider
            utils.log.info("OAuthVerify > add new provider", incomingProfile.provider);
            await this.uapRepo.create({
                ...incomingProfile,
                userId: existingUser._id,
            } as Partial<UserAuthProfilesEntity>);
        }
        else if (existing.username !== incomingProfile.username) {
            // B.3. update username if changed
            utils.log.info("OAuthVerify > update username", incomingProfile.provider);
            await this.uapRepo.update(existing._id, { username: incomingProfile.username });
        }

        return existingUser;
    }
}
