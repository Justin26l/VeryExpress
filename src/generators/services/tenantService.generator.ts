import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isTenantMembershipEnabled, isTenantSingleMode } from "~/utils/generator";

/**
 * Generates TenantService.gen.ts — the user ↔ tenant mapping every deployment uses.
 *
 * The table is the module's own `UserTenant` document, so app code only passes a tenant id.
 * Emitted only when the tenant module links accounts, i.e. `tenant.enable` plus an auth method:
 * a header-only deployment has no user to link.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    serviceDir: string;
}): Promise<void> {
    if (!isTenantMembershipEnabled(options.compilerOptions)) return;

    log.process("Tenant Service");

    const singleResolution = isTenantSingleMode(options.compilerOptions) ? `

    /**
     * The tenant of \`userId\` when the account belongs to exactly one.
     *
     * \`single\` mode promises one account one tenant: no row means the account is not linked yet,
     * and more than one is a data error that login must not paper over.
     */
    public async singleUserTenant(userId: string): Promise<string | undefined> {
        const rows = await this.repo.find({ userId } as unknown as Filter<UserTenant>);
        if (rows.length > 1) throw new VexResErr(409, "tenant_ambiguous", "User belongs to more than one tenant");

        return rows[0]?.tenantId;
    }` : "";

    const source = `// {{headerComment}}
import { Filter, VexRepository, VexResErr } from "../_types/vex";
import VexDb from "./VexDb.gen";
import UserContext from "../_middlewares/UserContext.gen";
import { isTenantId } from "../_middlewares/TenantScopeContext.gen";
import { UserTenantEntity, UserTenant } from "../_models/UserTenantModel.gen";
import { TenantEntity, Tenant } from "../_models/TenantModel.gen";

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
    private get tenantRepo(): VexRepository<Tenant> { return VexDb.getRepository(TenantEntity); }

    /**
     * Register a tenant.
     *
     * The module owns the row so a tenant id is a real record, not just a uuid some mapping happens
     * to carry. \`name\` is display-only and may be omitted.
     */
    public async createTenant(name?: string): Promise<Tenant> {
        return this.tenantRepo.create({ ...(name ? { name } : {}) } as Tenant);
    }

    /** The tenant row behind \`tenantId\`, or null when no such tenant was registered. */
    public async findTenant(tenantId: string): Promise<Tenant | null> {
        assertTenantId(tenantId);

        return this.tenantRepo.findOne({ _id: tenantId } as unknown as Filter<Tenant>);
    }

    /** Remove the tenant row. The membership rows are the caller's to clean up. */
    public async deleteTenant(tenantId: string): Promise<void> {
        assertTenantId(tenantId);
        await this.tenantRepo.deleteWhere({ _id: tenantId } as unknown as Filter<Tenant>);
    }

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
    }${singleResolution}
}
`;

    const outPath = `${options.serviceDir}/TenantService.gen.ts`;
    utils.common.writeFile("Tenant Service", outPath, utils.template.format(source));
}

export default { compile };
