// {{headerComment}}
import { Profile } from "passport";
import { UserWithRelations } from "./../../_types/User.gen";

export interface IProfile extends Profile {
    [key: string]: any;
}

export default class OAuthProfileMap {

    public map(oauthProfile: Profile) {
        let authProfile: UserWithRelations;
        switch (oauthProfile.provider) {
        case "github":
            authProfile = this.GithubProfileMapping(oauthProfile);
            break;
        case "google":
            authProfile = this.GoogleProfileMapping(oauthProfile);
            break;
        default:
            throw new Error("Invalid OAuth Provider");
            break;
        }
        return authProfile;
    }

    private GithubProfileMapping(oauthProfile: IProfile): UserWithRelations {
        const user: UserWithRelations = {
            active: true,
            userAuthProfiles: [{
                provider: oauthProfile.provider,
                oauthId: oauthProfile.id,
                username: oauthProfile.username || oauthProfile.displayName
            }],
            name: oauthProfile.username || oauthProfile.displayName,
            email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
            locale: undefined,
            profileErrors: ""
        };

        return user;
    }
    private GoogleProfileMapping(oauthProfile: IProfile): UserWithRelations {
        const user: UserWithRelations = {
            active: true,
            userAuthProfiles: [{
                provider: oauthProfile.provider,
                oauthId: oauthProfile.id,
                username: oauthProfile.username || oauthProfile.displayName
            }],
            name: oauthProfile.username || oauthProfile.displayName,
            // data below could be missing depend on the provider
            email: oauthProfile._json.email || oauthProfile._json.notification_email || undefined,
            locale: oauthProfile._json.locale || undefined,
            profileErrors: ""
        };

        return user;
    }

}