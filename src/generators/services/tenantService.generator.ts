import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isTenantEnabled } from "~/utils/generator";

/**
 * Generates TenantService.gen.ts — the user ↔ tenant mapping every deployment uses.
 *
 * The table is the module's own `UserTenant` document, so app code only passes a tenant id.
 * Emitted only when `vex.config.tenant.enable` is true.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    serviceDir: string;
}): Promise<void> {
    if (!isTenantEnabled(options.compilerOptions)) return;

    log.process("Tenant Service");

    const source = `// {{headerComment}}
import { Filter, VexRepository, VexResErr } from "../_types/vex";
import VexDb from "./VexDb.gen";
import UserContext from "../_middlewares/UserContext.gen";
import { isTenantId } from "../_middlewares/TenantScopeContext.gen";
import { UserTenantEntity, UserTenant } from "../_models/UserTenantModel.gen";

function assertTenantId(tenantId: string): void {
    if (!isTenantId(tenantId)) {
        throw new VexResErr(400, undefined, "tenantId must be a UUID");
    }
}

/**
 * Linking a user to a tenant.
 *
 * The caller supplies only the tenant id; the user id comes from the request context, so
 * app code cannot link another account. Linking is idempotent.
 */
export default class TenantService {

    private get repo(): VexRepository<UserTenant> { return VexDb.getRepository(UserTenantEntity); }

    /** Link the calling user to \`tenantId\`. */
    public async addUserTenant(tenantId: string): Promise<UserTenant> {
        const userId = UserContext.userId;
        if (!userId) throw new VexResErr(401);

        return this.linkUserTenant(userId, tenantId);
    }

    /** Link an explicit user — registration and provisioning flows run before a context exists. */
    public async linkUserTenant(userId: string, tenantId: string): Promise<UserTenant> {
        assertTenantId(tenantId);

        const filter = { userId, tenantId } as unknown as Filter<UserTenant>;
        const existing = await this.repo.findOneWhere(filter);
        if (existing) return existing;

        return this.repo.create({ userId, tenantId } as UserTenant);
    }

    public async hasUserTenant(userId: string, tenantId: string): Promise<boolean> {
        assertTenantId(tenantId);

        const filter = { userId, tenantId } as unknown as Filter<UserTenant>;
        return (await this.repo.findOneWhere(filter)) !== null;
    }

    /** Remove one mapping. Returns false when the user was not a member. */
    public async removeUserTenant(userId: string, tenantId: string): Promise<boolean> {
        assertTenantId(tenantId);

        const filter = { userId, tenantId } as unknown as Filter<UserTenant>;
        const existing = await this.repo.findOneWhere(filter);
        if (!existing) return false;

        await this.repo.deleteWhere(filter);
        return true;
    }

    /** Tenants of \`userId\` (defaults to the calling user). */
    public listUserTenants(userId?: string): Promise<UserTenant[]> {
        const id = userId ?? UserContext.userId;
        if (!id) throw new VexResErr(401);

        return this.repo.find({ userId: id } as unknown as Filter<UserTenant>);
    }
}
`;

    const outPath = `${options.serviceDir}/TenantService.gen.ts`;
    utils.common.writeFile("Tenant Service", outPath, utils.template.format(source));
}

export default { compile };
