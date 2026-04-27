import * as types from "../../types/types";
import * as utilsGenerator from "../../utils/generator";

export default function authControllerTemplate(compilerOptions: types.compilerOptions): string {
    const localAuth = compilerOptions.auth.localAuth;

    const localImports = localAuth
        ? "import { UserEntity } from \"../_models/UserModel.gen\";\nimport { UserAuthProfilesEntity } from \"../_models/UserAuthProfilesModel.gen\";"
        : "";

    const localBodyInterfaces = localAuth ? `
interface RegisterBody {
    email: string;
    password: string;
}

interface LoginBody {
    email: string;
    password: string;
}
` : "";

    const localRepos = localAuth ? `
    private get userRepo(): IVexRepository<UserEntity> { return VexDb.getRepository(UserEntity); }
    private get uapRepo(): IVexRepository<UserAuthProfilesEntity> { return VexDb.getRepository(UserAuthProfilesEntity); }` : "";

    const registerMethod = localAuth ? `
    @Post("register")
    @SuccessResponse(201, "Created")
    async register(@Body() body: RegisterBody): Promise<void> {
        const { email, password } = body;
        const existing = await this.userRepo.findOneWhere({ email });
        if (existing) throw new VexResponseError(409, null, "Email already registered.");
        const hashedPassword = utils.hash.hashPassword(password, email);
        const user = await this.userRepo.create({ name: email.split("@")[0], email, active: true });
        try {
            await this.uapRepo.create({ userId: user._id, provider: "local", password: hashedPassword });
        } catch (e) {
            try { await this.userRepo.delete(user._id); } catch { /* ignore cleanup error */ }
            throw e;
        }
        throw new VexResponse(201, { result: { message: "Registration successful." } });
    }` : "";

    const loginMethod = localAuth ? `
    @Post("local")
    @SuccessResponse(302, "Redirect")
    async localLogin(@Body() body: LoginBody): Promise<void> {
        const { email, password } = body;
        
        const user = await this.userRepo.findOneWhere({ email }${compilerOptions.useRBAC ? ', ["userRole", "userAuthProfiles"]' : ', ["userAuthProfiles"]'});
        if (!user) throw new VexResponseError(400, null, "incorrect email or password.");
        
        const isMatch = utils.hash.verifyPassword(user, password);
        if (!isMatch) throw new VexResponseError(400, null, "incorrect email or password.");
        const redirectUrl = await this.JWTService.assignTokens(user);
        throw new VexResponse(302, { result: { url: redirectUrl } });
    }` : "";

    const oauthProviders: string[] = utilsGenerator.OAuthProviders(compilerOptions);
    const hasOAuth = oauthProviders.length > 0;

    const oauthNote = hasOAuth
        ? "    // OAuth flows (Google, GitHub, etc.) are handled by AuthRouter — see /auth/<provider>"
        : "";

    return `{{headerComment}}
import { Route, Tags, Post, Body, Query, SuccessResponse } from "tsoa";
import { IVexRepository } from "../_types/IVexRepository.gen";
import * as controllerFactory from "./_ControllerFactory.gen";
import JWTService from "../_services/auth/JWTService.gen";
import VexDb from "../_services/VexDb.gen";
import { SessionEntity } from "../_models/SessionModel.gen";
import VexResponse from "../_types/VexResponse.gen";
import VexResponseError from "../_types/VexResponseError.gen";
import utils from "../_utils";
${localImports}

interface RefreshBody {
    refreshToken: string;
    refreshTokenIndex: string;
}
${localBodyInterfaces}
@Route("auth")
@Tags("Auth")
export class AuthController extends controllerFactory._ControllerFactory {
    private JWTService = new JWTService();
    private get sessionRepo(): IVexRepository<SessionEntity> { return VexDb.getRepository(SessionEntity); }
${localRepos}
${oauthNote}

    @Post("token")
    @SuccessResponse(200, "OK")
    async exchangeToken(@Query() code: string): Promise<void> {
        const sessionDoc = await this.sessionRepo.findOneWhere({ sessionCode: code });
        if (!sessionDoc) throw new VexResponseError(404, null, "invalid code");
        if (sessionDoc.expired < Date.now()) throw new VexResponseError(401, null, "code expired");
        await this.sessionRepo.deleteWhere({ sessionCode: code });
        const accessToken = await this.JWTService.generateAccessToken(sessionDoc.userId);
        const refreshToken = this.JWTService.generateRefreshToken({ _id: sessionDoc.userId });
        throw new VexResponse(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token,
            refreshTokenIndex: refreshToken.clientIndex,
        }});
    }

    @Post("refresh")
    @SuccessResponse(200, "OK")
    async refreshToken(@Body() body: RefreshBody): Promise<void> {
        const payload = this.JWTService.verifyToken(body.refreshToken, body.refreshTokenIndex);
        const accessToken = await this.JWTService.generateAccessToken(payload._id);
        throw new VexResponse(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
        }});
    }
${registerMethod}
${loginMethod}
}
`;
}
