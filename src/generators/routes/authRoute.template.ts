import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

/**
 * Generates AuthRouter — handles only OAuth (passport) redirect flows.
 * JSON auth endpoints (token, refresh, register, local) are handled by AuthController (tsoa).
 * Only generated when OAuth providers are configured.
 */
export default function template(
    compilerOptions: types.compilerOptions,
): string {
    const providers: string[] = utilsGenerator.OAuthProviders(compilerOptions);

    const providersTemplate = providers.map((providerName) => {
        switch (providerName) {
        case "google":
            return `
        const google = "google";
        const OAuthGoogle = new OAuthRouteFactory({
            strategyName: google,
            strategy: new GoogleStrategy(
                {
                    clientID: process.env.OAUTH_GOOGLE_CLIENTID || "",
                    clientSecret: process.env.OAUTH_GOOGLE_CLIENTSECRET || "",
                    callbackURL: \`\${process.env.APP_HOST}:\${process.env.APP_PORT}/auth/\${google}/callback\`,
                },
                this.OAuthStrategyService.verify
            )
        });
        this.router.use(\`/\${google}\`, OAuthGoogle.getRouter());
        `;

        case "github":
            return `
        const github = "github";
        const OAuthGithub = new OAuthRouteFactory({
            strategyName: github,
            strategy: new GithubStrategy(
                {
                    clientID: process.env.OAUTH_GITHUB_CLIENTID || "",
                    clientSecret: process.env.OAUTH_GITHUB_CLIENTSECRET || "",
                    callbackURL: \`\${process.env.APP_HOST}:\${process.env.APP_PORT}/auth/\${github}/callback\`,
                },
                this.OAuthStrategyService.verify
            )
        });
        this.router.use(\`/\${github}\`, OAuthGithub.getRouter());
        `;
        }
    }).join("\n");

    return `{{headerComment}}
import { Router } from "express";
import OAuthStrategyService from "../_services/oauth/OAuthStrategyService.gen";
import OAuthRouteFactory from "./oauth/OAuthRouteFactory.gen";
import { Strategy as GithubStrategy } from "passport-github";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

export default class AuthRouter {

    private OAuthStrategyService = new OAuthStrategyService();
    private router: Router = Router();

    constructor() {
        this.initOAuthRoutes();
    }

    private initOAuthRoutes() {
        ${providersTemplate}
    }

    public getRouter() {
        return this.router;
    }
}
`;
}
