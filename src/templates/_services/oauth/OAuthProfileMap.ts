// {{headerComment}}
import { Profile } from "passport";
import { User } from "./../../_types/User.gen";

export interface IProfile extends Profile {
    [key: string]: any;
}

export default class OAuthProfileMap {

    public map(oauthProfile: Profile) {
        let authProfile: User;
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

        // if ( !authProfile.email){
        //     console.log('missingEmail');
        //     authProfile.profileErrors?.push('missingEmail');
        //     authProfile.active = false;
        // }
        return authProfile;
    }

    private GithubProfileMapping(oauthProfile: IProfile): User {
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
    private GoogleProfileMapping(oauthProfile: IProfile): User {
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

}