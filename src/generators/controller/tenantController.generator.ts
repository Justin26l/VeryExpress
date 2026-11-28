import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isRbacEnabled, isTenantMembershipEnabled, tenantIsolationMode } from "~/utils/generator";

/**
 * Generates the tenant endpoints for `option` and `single` mode.
 *
 * Both modes share `POST /tenant/create`: a login exists before any tenant does, so creating one is
 * the step that turns a claimless session into a tenant-scoped one. The response carries freshly
 * minted tokens, because the claim only exists in a token.
 *
 * `option` additionally owns the chooser — `GET /tenant` lists the caller's mappings and
 * `POST /tenant/select` switches between them, re-checking the mapping against the database.
 *
 * `single` owns no chooser: one account belongs to one tenant, so a second create is a `409`.
 *
 * `preSelect` needs none of this: the header already identifies the tenant.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    controllerDir: string;
    typeDir: string;
}): Promise<void> {
    if (!isTenantMembershipEnabled(options.compilerOptions)) return;

    const mode = tenantIsolationMode(options.compilerOptions);
    if (mode === "preSelect") return;

    log.process("Tenant Controller");

    const useRBAC = isRbacEnabled(options.compilerOptions);
    const optionMode = mode === "option";
    const joinArg = useRBAC ? ', ["userRole"]' : "";

    const typeSource = optionMode ? `// {{headerComment}}
export interface tenantSummary {
    tenantId: string;
}

export interface tenantListResponse {
    tenants: tenantSummary[];
}
` : "";

    const tenantTypeImport = optionMode
        ? `\nimport { tenantListResponse } from "../_types/TenantList.gen";`
        : "";

    const tenantIdImport = optionMode
        ? `\nimport { isTenantId } from "../_middlewares/TenantScopeContext.gen";`
        : "";

    const createGuard = optionMode
        ? ""
        : `
        if ((await this.tenantService.listUserTenants(userId)).length > 0) {
            throw new VexResErr(409, "tenant_exists", "This account already belongs to a tenant");
        }
`;

    const chooserRoutes = optionMode ? `
    /** Tenants the authenticated user may enter — the chooser's data source. */
    @Get()
    @Middlewares(Authentication.middleware)
    @Security({ BearerAuth: [], AuthIndex: [] })
    @SuccessResponse(200, "OK")
    public async listTenants(): Promise<VexResponse<tenantListResponse>> {
        const tenants = await this.tenantService.listUserTenants();

        throw new VexResOk(200, { result: { tenants: tenants.map(row => ({ tenantId: row.tenantId })) } });
    }

    /**
     * Enter a tenant. Validates the mapping against the database, then mints tokens whose
     * \`tenantId\` claim identifies the active tenant for subsequent requests.
     */
    @Post("select")
    @Middlewares(Authentication.middleware)
    @Security({ BearerAuth: [], AuthIndex: [] })
    @SuccessResponse(200, "OK")
    public async selectTenant(
        @Body() body: { tenantId: string },
    ): Promise<VexResponse<tokenResponse>> {
        const userId = UserContext.userId;
        if (!userId) throw new VexResErr(401);

        if (!isTenantId(body.tenantId)) throw new VexResErr(400, undefined, "tenantId must be a UUID");

        const isMember = await this.tenantService.hasUserTenant(userId, body.tenantId);
        if (!isMember) throw new VexResErr(403, undefined, "User is not a member of this tenant");

        throw new VexResOk(200, { result: await this.mintTenantTokens(userId, body.tenantId) });
    }
` : "";

    const decorators = optionMode
        ? "Route, Tags, Get, Post, Body, Middlewares, Security, SuccessResponse"
        : "Route, Tags, Post, Body, Middlewares, Security, SuccessResponse";

    const controllerSource = `// {{headerComment}}
import { ${decorators} } from "tsoa";
import * as controllerFactory from "./_ControllerFactory.gen";
import JWTService from "../_services/auth/JWTService.gen";
import TenantService from "../_services/TenantService.gen";
import VexDb from "../_services/VexDb.gen";
import UserContext from "../_middlewares/UserContext.gen";
import Authentication from "../_middlewares/Authentication.gen";
import { vexUserIdField } from "../_middlewares/VexFieldRegistry.gen";
import { UserEntity, User } from "../_models/UserModel.gen";
import { VexRepository, VexResponse, VexResErr, VexResOk, Filter } from "../_types/vex";
import { tokenResponse } from "../_types/auth.gen";${tenantTypeImport}${tenantIdImport}

@Route("tenant")
@Tags("Tenant")
export class TenantController extends controllerFactory._ControllerFactory {
    private JWTService = new JWTService();
    private tenantService = new TenantService();

    private get userRepo(): VexRepository<User> { return VexDb.getRepository(UserEntity); }

    /**
     * Access token and refresh token carrying \`tenantId\`. A claim lives in a token, so linking a
     * mapping is not enough for the caller to act inside the tenant.
     */
    private async mintTenantTokens(userId: string, tenantId: string) {
        const identity = { [vexUserIdField]: userId } as unknown as Filter;
        const user = await this.userRepo.findOne(identity${joinArg});
        if (!user) throw new VexResErr(404, undefined, "Invalid User Id");

        const accessToken = await this.JWTService.generateAccessToken(user, undefined, { tenantId });
        const refreshToken = this.JWTService.generateRefreshToken({
            vexUserId: this.JWTService.userIdOf(user),
            tenantId,
        });

        return {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token,
            refreshTokenIndex: refreshToken.clientIndex,
        };
    }

    /**
     * Create a tenant for the calling account and link it.
     *
     * The route attaches only \`Authentication.middleware\`: the caller has no tenant yet, so a
     * tenant-scoped middleware would reject exactly the request that fixes that.
     */
    @Post("create")
    @Middlewares(Authentication.middleware)
    @Security({ BearerAuth: [], AuthIndex: [] })
    @SuccessResponse(201, "Created")
    public async createTenant(
        @Body() body: { name?: string },
    ): Promise<VexResponse<tokenResponse>> {
        const userId = UserContext.userId;
        if (!userId) throw new VexResErr(401);
${createGuard}
        const tenant = await this.tenantService.createTenant(body?.name);
        const tenantId = String(tenant._id);

        try {
            await this.tenantService.linkUserTenant(userId, tenantId);
        } catch (error) {
            await this.tenantService.deleteTenant(tenantId).catch(() => undefined);
            throw error;
        }

        throw new VexResOk(201, { result: await this.mintTenantTokens(userId, tenantId) });
    }
${chooserRoutes}}
`;

    if (optionMode) {
        utils.common.writeFile(
            "Tenant Types",
            `${options.typeDir}/TenantList.gen.ts`,
            utils.template.format(typeSource),
        );
    }
    utils.common.writeFile(
        "Tenant Controller",
        `${options.controllerDir}/TenantController.gen.ts`,
        utils.template.format(controllerSource),
    );
}

export default { compile };
