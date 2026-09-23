// {{headerComment}}
import { Profile } from "passport";
import { UserWithRelations } from "./../../_types/User.gen";
import { entitySoftDeleteFields } from "./../../_middlewares/VexFieldRegistry.gen";

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

    /**
     * Seed the soft-delete marker on a brand-new OAuth user.
     *
     * `User` is only soft-deletable in projects that tag a marker, and when they do the field is
     * required — so the profile built here must carry it. Reusing the registry keeps this template
     * correct for both kinds of project, including one whose marker is not named "deleted".
     *
     * The marker is assigned onto the finished profile rather than spread into its literal: the
     * field name is only known at runtime, and a spread of a `Record<string, boolean>` widens the
     * property to `boolean | undefined`, which the required `User` field rejects.
     */
    private applyNewUserMarker(user: UserWithRelations): UserWithRelations {
        const field = entitySoftDeleteFields["UserEntity"];
        if (field) (user as unknown as Record<string, unknown>)[field] = false;

        return user;
    }

    private GithubProfileMapping(oauthProfile: IProfile): UserWithRelations {
        const user = {
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
        } as unknown as UserWithRelations;

        return this.applyNewUserMarker(user);
    }
    private GoogleProfileMapping(oauthProfile: IProfile): UserWithRelations {
        const user = {
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
        } as unknown as UserWithRelations;

        return this.applyNewUserMarker(user);
    }

}