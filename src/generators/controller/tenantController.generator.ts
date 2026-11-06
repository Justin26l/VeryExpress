import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isRbacEnabled, isTenantEnabled, tenantIsolationMode } from "~/utils/generator";

/**
 * Generates TenantController.gen.ts and Tenant.gen.ts for `option` mode.
 *
 * `option` logs a user in before a tenant exists, so the module owns the two endpoints that
 * turn a login into a tenant-scoped session: list the user's tenants, and select one. The
 * selection is the point where the mapping is checked against the database — the token claim
 * itself is only a snapshot.
 *
 * `preSelect` needs none of this: the header already identifies the tenant.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    controllerDir: string;
    typeDir: string;
}): Promise<void> {
    if (!isTenantEnabled(options.compilerOptions)) return;
    if (tenantIsolationMode(options.compilerOptions) !== "option") return;

    log.process("Tenant Controller");

    const useRBAC = isRbacEnabled(options.compilerOptions);
    const joinArg = useRBAC ? ', ["userRole"]' : "";

    const typeSource = `// {{headerComment}}
export interface tenantSummary {
    tenantId: string;
}

export interface tenantListResponse {
    tenants: tenantSummary[];
}
`;

    const controllerSource = `// {{headerComment}}
import { Route, Tags, Get, Post, Body, Middlewares, Security, SuccessResponse } from "tsoa";
import * as controllerFactory from "./_ControllerFactory.gen";
import JWTService from "../_services/auth/JWTService.gen";
import TenantService from "../_services/TenantService.gen";
import VexDb from "../_services/VexDb.gen";
import UserContext from "../_middlewares/UserContext.gen";
import Authentication from "../_middlewares/Authentication.gen";
import { vexUserIdField } from "../_middlewares/VexFieldRegistry.gen";
import { isTenantId } from "../_middlewares/TenantScopeContext.gen";
import { UserEntity, User } from "../_models/UserModel.gen";
import { VexRepository, VexResponse, VexResErr, VexResOk, Filter } from "../_types/vex";
import { tokenResponse } from "../_types/auth.gen";
import { tenantListResponse } from "../_types/Tenant.gen";

@Route("tenant")
@Tags("Tenant")
export class TenantController extends controllerFactory._ControllerFactory {
    private JWTService = new JWTService();
    private tenantService = new TenantService();

    private get userRepo(): VexRepository<User> { return VexDb.getRepository(UserEntity); }

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

        const identity = { [vexUserIdField]: userId } as unknown as Filter;
        const user = await this.userRepo.findOne(identity${joinArg});
        if (!user) throw new VexResErr(404, undefined, "Invalid User Id");

        const tenantId = body.tenantId;
        const accessToken = await this.JWTService.generateAccessToken(user, undefined, { tenantId });
        const refreshToken = this.JWTService.generateRefreshToken({
            vexUserId: this.JWTService.userIdOf(user),
            tenantId,
        });

        throw new VexResOk(200, { result: {
            accessToken: accessToken.token,
            accessTokenIndex: accessToken.clientIndex,
            refreshToken: refreshToken.token,
            refreshTokenIndex: refreshToken.clientIndex,
        }});
    }
}
`;

    utils.common.writeFile(
        "Tenant Types",
        `${options.typeDir}/Tenant.gen.ts`,
        utils.template.format(typeSource),
    );
    utils.common.writeFile(
        "Tenant Controller",
        `${options.controllerDir}/TenantController.gen.ts`,
        utils.template.format(controllerSource),
    );
}

export default { compile };
