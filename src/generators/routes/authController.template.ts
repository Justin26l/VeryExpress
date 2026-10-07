import * as types from "../../types/types";
import * as utilsGenerator from "../../utils/generator";

export default function authControllerTemplate(compilerOptions: types.compilerOptions): string {
    const localAuth = compilerOptions.auth.localAuth;
    const useRBAC = utilsGenerator.isRbacEnabled(compilerOptions);
    const deleteAccount = utilsGenerator.isAccountDeletionEnabled(compilerOptions);
    const firebase = utilsGenerator.isFirebaseAuthEnabled(compilerOptions);

    // `exchangeToken` and `refreshToken` are emitted for every auth-enabled project, and both resolve
    // the user by id — so `userRepo` cannot be gated on localAuth. A passport-only or Firebase-only app
    // would otherwise generate a controller that calls a getter it never declares, which does not
    // compile. The other two are used only by `register`, which is local-auth-only.
    const userImports = "import { UserEntity, User } from \"../_models/UserModel.gen\";";
    const localAuthImports = localAuth
        ? "import { UserAuthProfilesEntity, UserAuthProfiles } from \"../_models/UserAuthProfilesModel.gen\";"
        : "";
    const RbacImports = useRBAC
        ? "import { UserRoleEntity, UserRole } from \"../_models/UserRoleModel.gen\";\nimport { RoleEnum } from \"../_types/UserRole.gen\";"
        : "";
    const userRoleRepo = useRBAC
        ? "\n    private get userRoleRepo(): VexRepository<UserRole> { return VexDb.getRepository(UserRoleEntity); }"
        : "";

    const userRepo = `
    private get userRepo(): VexRepository<User> { return VexDb.getRepository(UserEntity); }`;
    const localAuthRepos = localAuth ? `${userRepo}
    private get userAuthProfilesRepo(): VexRepository<UserAuthProfiles> { return VexDb.getRepository(UserAuthProfilesEntity); }${userRoleRepo}` : userRepo;

    // ── account deletion ────────────────────────────────────────────────────────
    // Gated on auth being enabled, which isAccountDeletionEnabled already guarantees, so the
    // imports it needs (Authentication, UserContext, the service) are safe to emit here.
    const deleteAccountImports = deleteAccount
        ? "\nimport Authentication from \"../_middlewares/Authentication.gen\";\nimport AccountDeletionService from \"../_services/account/AccountDeletionService.gen\";"
        : "";
    const deleteAccountMiddlewares = deleteAccount ? ", Middlewares, Security" : "";
    const deleteAccountService = deleteAccount
        ? "\n    private accountDeletionService = new AccountDeletionService();\n"
        : "";

    // Self-only by construction: the identity comes from the verified token, never from a path or
    // body, so there is no id a caller could point at another account.
    const deleteAccountRoute = deleteAccount ? `
    @Post("delete-account")
    @SuccessResponse(200, "OK")
    @Middlewares(Authentication.middleware)
    @Security({ BearerAuth: [], AuthIndex: [] })
    async deleteAccount(): Promise<VexResponse<deleteAccountResponse>> {
        const result = await this.accountDeletionService.deleteSelf();
        throw new VexResOk(200, { result });
    }
` : "";

    // ── Firebase sign-in ────────────────────────────────────────────────────────
    // The one endpoint that accepts a non-vex credential. The identity it stores is the *upstream*
    // IdP's, so a Google sign-in here and a Google sign-in through passport resolve to one row — see
    // docs/plan/spec-firebase-auth.md.
    //
    // The service owns its own repositories, so this route needs no repo getter: it works in a project
    // with localAuth off.
    const firebaseImports = firebase
        ? "\nimport FirebaseAuthService from \"../_services/auth/FirebaseAuthService.gen\";"
        : "";
    const firebaseService = firebase
        ? "\n    private firebaseAuthService = new FirebaseAuthService();\n"
        : "";
    const firebaseRoute = firebase ? `
    @Post("firebase")
    @SuccessResponse(200, "OK")
    async firebaseLogin(
        @Body() body: { idToken: string }
    ): Promise<VexResponse<firebaseLoginResponse>> {
        const { user, isNewUser } = await this.firebaseAuthService.authenticate(body.idToken);

        // Minted here rather than through a sessionCode: this endpoint's contract is the one existing
        // clients already speak, and it answers with the token pair directly.
        const accessToken = await this.JWTService.generateAccessToken(user);
        const refreshToken = this.JWTService.generateRefreshToken({ vexUserId: this.JWTService.userIdOf(user) });

        throw new VexResOk(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token,
            refreshTokenIndex: refreshToken.clientIndex,
            isNewUser,
        }});
    }
` : "";

    // OAuth
    const oauthProviders: string[] = utilsGenerator.OAuthProviders(compilerOptions);
    const OAuthNote = oauthProviders.length > 0 ? "    // OAuth flows (Google, GitHub, etc.) are handled by AuthRouter — see /auth/<provider>": ""

    return `{{headerComment}}
import { Route, Tags, Post, Body, Query, SuccessResponse${deleteAccountMiddlewares} } from "tsoa";
import * as controllerFactory from "./_ControllerFactory.gen";
import JWTService from "../_services/auth/JWTService.gen";
import VexDb from "../_services/VexDb.gen";
import { SessionEntity, Session } from "../_models/SessionModel.gen";
import { VexRepository, VexResponse, VexResErr, VexResOk, Filter } from "../_types/vex";
import { vexUserIdField } from "../_middlewares/VexFieldRegistry.gen";
import { tokenResponse, refreshTokenResponse${localAuth ? ', registerResponse, localLoginResponse' : '' }${deleteAccount ? ', deleteAccountResponse' : ''}${firebase ? ', firebaseLoginResponse' : ''} } from "../_types/auth.gen";

import utils from "../_utils";
${userImports}
${localAuthImports}
${RbacImports}${deleteAccountImports}${firebaseImports}

@Route("auth")
@Tags("Auth")
export class AuthController extends controllerFactory._ControllerFactory {
    private JWTService = new JWTService();
    private get sessionRepo(): VexRepository<Session> { return VexDb.getRepository(SessionEntity); }
${localAuthRepos}${deleteAccountService}${firebaseService}
${OAuthNote}

${deleteAccountRoute}${firebaseRoute}
    @Post("token")
    @SuccessResponse(200, "OK")
    async exchangeToken(
        @Query() code: string
    ): Promise<VexResponse<tokenResponse>> {
        
        const session = await this.sessionRepo.findOneWhere({ sessionCode: code });
        if (!session) {
            throw new VexResErr(404, null, "invalid code");
        }
        if (session.expired < Date.now()) {
            await this.sessionRepo.deleteWhere({ sessionCode: code });
            throw new VexResErr(401, null, "code expired");
        }
        
        const user = await this.userRepo.findOne({ _id: session.userId }${useRBAC ? ', ["userRole"]' : ''});
        if (!user) throw new VexResErr(404, null, "Invalid User Id");
        
        const accessToken = await this.JWTService.generateAccessToken(user);
        const refreshToken = this.JWTService.generateRefreshToken({ vexUserId: this.JWTService.userIdOf(user) });
        
        throw new VexResOk(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token,
            refreshTokenIndex: refreshToken.clientIndex,
        }});
    }

    @Post("refresh")
    @SuccessResponse(200, "OK")
    async refreshToken(
        @Body() body: {
            refreshToken: string; 
            refreshTokenIndex: string;
        }
    ): Promise<VexResponse<refreshTokenResponse>> {
        const payload = this.JWTService.verifyToken(body.refreshToken, body.refreshTokenIndex);
        
        // vexUserId is the schema-declared identity; _id keeps refresh tokens issued before it working
        const userId = payload.vexUserId ?? payload._id;
        if (!userId) throw new VexResErr(401, null, "Invalid refresh token");
        const identity = { [vexUserIdField]: userId } as unknown as Filter;

        const user = await this.userRepo.findOne(identity${useRBAC ? ', ["userRole"]' : ''});
        if (!user) throw new VexResErr(404, null, "Invalid User Id");
        
        const accessToken = await this.JWTService.generateAccessToken(user);
        throw new VexResOk(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
        }});
    }
${localAuth ? `
    @Post("register")
    @SuccessResponse(201, "Created")
    async register(
        @Body() body: {
            email: string; 
            password: string;
        }
    ): Promise<VexResponse<registerResponse>> {
        const { email, password } = body;
        const existing = await this.userRepo.findOneWhere({ email });
        if (existing) throw new VexResErr(409, null, "Email already registered.");
        
        const hashedPassword = utils.hash.hashPassword(password, email);
        
        const user = await this.userRepo.create({ name: email.split("@")[0], email, active: true })
            .catch( e => { throw new VexResErr(500, null, "User creation failed."); });

        await this.userAuthProfilesRepo.create({ userId: user._id, provider: "local", password: hashedPassword })
            .catch( async e => { 
                await this.userRepo.delete(user._id);
                await this.userAuthProfilesRepo.deleteWhere({ userId: user._id });
                throw new VexResErr(500, null, "User Auth profile creation failed."); 
            });

        ${useRBAC ? `
        await this.userRoleRepo.create({ userId: user._id, role: RoleEnum.${compilerOptions.useRBAC!.default} })
            .catch( async e => { 
                await this.userRepo.delete(user._id);
                await this.userAuthProfilesRepo.deleteWhere({ userId: user._id });
                throw new VexResErr(500, null, "User role assignment failed."); 
            });` : ''}

        throw new VexResOk(201, { result: { message: "Registration successful." } });
    }` : ""
}
${localAuth ? `
    @Post("local")
    @SuccessResponse(302, "Redirect")
    async localLogin(
        @Body() body: {
            email: string;
            password: string;
        }
    ): Promise<VexResponse<localLoginResponse>> {
        const { email, password } = body;
        
        const user = await this.userRepo.findOneWhere({ email }${useRBAC ? ', ["userRole", "userAuthProfiles"]' : ', ["userAuthProfiles"]'});
        if (!user) throw new VexResErr(400, null, "incorrect email or password.");
        
        const isMatch = utils.hash.verifyPassword(user, password);
        if (!isMatch) throw new VexResErr(400, null, "incorrect email or password.");

        const redirectUrl = await this.JWTService.assignTokens(user, "local");
        throw new VexResOk(302, { result: { url: redirectUrl } });
    }` : ""}
}
`;
}
