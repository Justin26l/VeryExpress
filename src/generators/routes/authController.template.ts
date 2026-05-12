import * as types from "../../types/types";
import * as utilsGenerator from "../../utils/generator";

export default function authControllerTemplate(compilerOptions: types.compilerOptions): string {
    const localAuth = compilerOptions.auth.localAuth;

    const localAuthImports = localAuth
        ? "import { UserEntity, User } from \"../_models/UserModel.gen\";\nimport { UserAuthProfilesEntity, UserAuthProfiles } from \"../_models/UserAuthProfilesModel.gen\";"
        : "";
    const RbacImports = compilerOptions.useRBAC
        ? "import { UserRoleEntity, UserRole } from \"../_models/UserRoleModel.gen\";\nimport { RoleEnum } from \"../_types/UserRole.gen\";"
        : "";
    
    const localAuthRepos = localAuth ? `
    private get userRepo(): VexRepository<User> { return VexDb.getRepository(UserEntity); }
    private get userAuthProfilesRepo(): VexRepository<UserAuthProfiles> { return VexDb.getRepository(UserAuthProfilesEntity); }
    private get userRoleRepo(): VexRepository<UserRole> { return VexDb.getRepository(UserRoleEntity); }` : "";

    // OAuth
    const oauthProviders: string[] = utilsGenerator.OAuthProviders(compilerOptions);
    const OAuthNote = oauthProviders.length > 0 ? "    // OAuth flows (Google, GitHub, etc.) are handled by AuthRouter — see /auth/<provider>": ""

    return `{{headerComment}}
import { Route, Tags, Post, Body, Query, SuccessResponse } from "tsoa";
import * as controllerFactory from "./_ControllerFactory.gen";
import JWTService from "../_services/auth/JWTService.gen";
import VexDb from "../_services/VexDb.gen";
import { SessionEntity, Session } from "../_models/SessionModel.gen";
import { VexRepository, VexResErr, VexResOk } from "../_types/vex";

import utils from "../_utils";
${localAuthImports}
${RbacImports}

@Route("auth")
@Tags("Auth")
export class AuthController extends controllerFactory._ControllerFactory {
    private JWTService = new JWTService();
    private get sessionRepo(): VexRepository<Session> { return VexDb.getRepository(SessionEntity); }
${localAuthRepos}
${OAuthNote}

    @Post("token")
    @SuccessResponse(200, "OK")
    async exchangeToken(@Query() code: string): Promise<void> {
        
        const session = await this.sessionRepo.findOneWhere({ sessionCode: code });
        if (!session) {
            throw new VexResErr(404, null, "invalid code");
        }
        if (session.expired < Date.now()) {
            await this.sessionRepo.deleteWhere({ sessionCode: code });
            throw new VexResErr(401, null, "code expired");
        }
        
        const user = await this.userRepo.findOne({ _id: session.userId }${compilerOptions.useRBAC ? ', ["userRole"]' : ''});
        if (!user) throw new VexResErr(404, null, "Invalid User Id");
        
        const accessToken = await this.JWTService.generateAccessToken(user);
        const refreshToken = this.JWTService.generateRefreshToken({ _id: user._id });
        
        throw new VexResOk(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token,
            refreshTokenIndex: refreshToken.clientIndex,
        }});
    }

    @Post("refresh")
    @SuccessResponse(200, "OK")
    async refreshToken(@Body() body: {refreshToken: string; refreshTokenIndex: string;}): Promise<void> {
        const payload = this.JWTService.verifyToken(body.refreshToken, body.refreshTokenIndex);
        
        const user = await this.userRepo.findOne({ _id: payload._id }${compilerOptions.useRBAC ? ', ["userRole"]' : ''});
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
    async register(@Body() body: {email: string; password: string;}): Promise<void> {
        const { email, password } = body;
        const existing = await this.userRepo.findOneWhere({ email });
        if (existing) throw new VexResErr(409, null, "Email already registered.");
        
        const hashedPassword = utils.hash.hashPassword(password, email);
        
        const user = await this.userRepo.create({ name: email.split("@")[0], email, active: true })
            .catch( e => { throw new VexResErr(500, null, "User creation failed."); });
        ${compilerOptions.useRBAC ? `
        await this.userAuthProfilesRepo.create({ userId: user._id, provider: "local", password: hashedPassword })
            .catch( async e => { 
                await this.userRepo.delete(user._id);
                await this.userAuthProfilesRepo.deleteWhere({ userId: user._id });
                throw new VexResErr(500, null, "User Auth profile creation failed."); 
            });` : ''}
        ${compilerOptions.useRBAC ? `
        await this.userRoleRepo.create({ userId: user._id, role: RoleEnum.${compilerOptions.useRBAC.default} })
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
    async localLogin(@Body() body: {email: string; password: string;}): Promise<void> {
        const { email, password } = body;
        
        const user = await this.userRepo.findOneWhere({ email }${compilerOptions.useRBAC ? ', ["userRole", "userAuthProfiles"]' : ', ["userAuthProfiles"]'});
        if (!user) throw new VexResErr(400, null, "incorrect email or password.");
        
        const isMatch = utils.hash.verifyPassword(user, password);
        if (!isMatch) throw new VexResErr(400, null, "incorrect email or password.");

        const redirectUrl = await this.JWTService.assignTokens(user, "local");
        throw new VexResOk(302, { result: { url: redirectUrl } });
    }` : ""}
}
`;
}
