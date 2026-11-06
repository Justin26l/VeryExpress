import utils from "~/utils";
import * as utilsGenerator from "~/utils/generator";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { findUserIdIdentity, collectVexFields } from "~/preprocess/auditFields";
import { findSoftDeleteField } from "~/preprocess/softDelete";
import { collectDeleteTablePlans, DeleteTablePlan } from "~/preprocess/deleteAccount";

/**
 * Generates AccountDeletionService.gen.ts — the identity-domain half of account deletion.
 *
 * It is a service rather than a controller method because identity erasure belongs at the end of a
 * flow the app itself drives (business rows → storage objects → identity). Same process, so the
 * reusable unit is an importable service, not an HTTP hop.
 *
 * The tombstone payload is derived from the project's own User schema: fields that are absent are
 * never emitted, so a project that renamed or dropped `locale` still gets a service that compiles.
 *
 * Tenant isolation changes one branch: the account leaves the tenant (the UserTenant row is
 * removed) instead of being tombstoned. The feature still owns the whole flow.
 *
 * See docs/features/accountDeletion.md.
 */

/** Field → tombstone value, for the standard User fields the account must shed. */
interface redaction {
    field: string;
    value: string;
    /** why this field is wiped — emitted as a comment so the generated code stays auditable */
    reason: string;
}

/**
 * Redaction payload for the fields this spec treats as personal data.
 *
 * `email` becomes NULL rather than "": User declares a unique index on it, so a second deletion
 * would collide on the empty string. Postgres allows unlimited NULLs in a unique index, and the
 * unique index is still enforced for live accounts.
 */
function buildRedactions(schema: types.jsonSchema, markerField: string): redaction[] {
    const props = schema.properties ?? {};
    const identity = findUserIdIdentity([{ path: "User.json", schema }]);
    const auditFields = new Set(collectVexFields(schema).map(f => f.field));

    const candidates: { field: string, value: string, reason: string }[] = [
        { field: "name", value: '"Deleted user"', reason: "required column — placeholder, not null" },
        { field: "email", value: "null", reason: "unique-indexed; must be NULL, never \"\"" },
        { field: "locale", value: "null", reason: "personal data" },
        { field: "profileErrors", value: "null", reason: "may quote provider error text" },
        { field: "active", value: "false", reason: "deactivated account" },
    ];

    return candidates.filter(candidate => {
        if (candidate.field === markerField) return false;
        if (!props[candidate.field]) return false;
        if (auditFields.has(candidate.field)) return false;
        if (identity && identity.field === candidate.field) return false;

        return true;
    });
}

/** The `null` literal needs a cast because the generated field is typed non-nullable. */
function renderValue(prop: types.jsonSchemaPropsItem, value: string): string {
    if (value !== "null") return value;
    return `null as unknown as ${prop.type === "string" ? "string" : "never"}`;
}

/** Generated repo getter + filter statements for one declared cleanup table. */
function renderRelatedCleanup(plan: DeleteTablePlan): { imports: string, getters: string, body: string } {
    const documentName = plan.documentName;
    const camel = utils.common.camelCase(documentName);
    const repoName = `${camel}Repo`;
    const filterType = `Filter<${documentName}>`;
    const userField = JSON.stringify(plan.userField);

    const imports = `\nimport { ${documentName}Entity, ${documentName} } from "../../_models/${documentName}Model.gen";`;
    const getters = `\n    private get ${repoName}(): VexRepository<${documentName}> { return VexDb.getRepository(${documentName}Entity); }`;

    const body = plan.softDeleteField
        ? `
        {
            const rows = await this.${repoName}.find({ ${userField}: userId } as unknown as ${filterType});
            for (const row of rows) await this.${repoName}.softDelete(row._id);
            removed[${JSON.stringify(documentName)}] = rows.length;
        }`
        : `
        {
            const filter = { ${userField}: userId } as unknown as ${filterType};
            removed[${JSON.stringify(documentName)}] = await this.${repoName}.count(filter);
            await this.${repoName}.deleteWhere(filter);
        }`;

    return { imports, getters, body };
}

export async function compile(options: {
    documents: { path: string, schema: types.jsonSchema }[];
    serviceDir: string;
    compilerOptions: types.compilerOptions;
}): Promise<void> {
    if (!utilsGenerator.isAccountDeletionEnabled(options.compilerOptions)) return;

    const identity = findUserIdIdentity(options.documents);
    if (!identity) {
        log.warn("AccountDeletionService skipped — no document tags x-vexData \"userId\".");
        return;
    }

    const userDoc = options.documents.find(
        doc => doc.schema["x-documentConfig"]?.documentName === identity.documentName
    );
    if (!userDoc) {
        log.warn(`AccountDeletionService skipped — identity document "${identity.documentName}" not found.`);
        return;
    }

    const marker = findSoftDeleteField(userDoc.schema);
    if (!marker) {
        // deletion without a tombstone would break every required FK pointing at the row
        log.error(
            `Account deletion is enabled but "${identity.documentName}" declares no ` +
            `x-vexData "softDelete" field. Account deletion depends on the tombstone: business rows ` +
            `hold required foreign keys to this row, so it cannot be hard-deleted. ` +
            `Tag a boolean field with "x-vexData": "softDelete" or set auth.deleteAccount to false.`
        );
        return;
    }

    log.process("Account Deletion Service");

    const useRBAC = utilsGenerator.isRbacEnabled(options.compilerOptions);
    const tenantEnabled = utilsGenerator.isTenantEnabled(options.compilerOptions);
    const plans = collectDeleteTablePlans(options.documents, options.compilerOptions);
    const cleanup = plans.map(renderRelatedCleanup);

    const docName = identity.documentName;
    const redactions = buildRedactions(userDoc.schema, marker.field)
        .map(r => {
            const prop = (userDoc.schema.properties ?? {})[r.field];
            return `        // ${r.reason}\n        ${r.field}: ${renderValue(prop, r.value)},`;
        })
        .join("\n");

    const rbacImport = useRBAC
        ? `\nimport { ${docName}RoleEntity, ${docName}Role } from "../../_models/${docName}RoleModel.gen";`
        : "";
    const rbacRepo = useRBAC
        ? `\n    private get userRoleRepo(): VexRepository<${docName}Role> { return VexDb.getRepository(${docName}RoleEntity); }`
        : "";
    const authProfilesImport = `\nimport { ${docName}AuthProfilesEntity, ${docName}AuthProfiles } from "../../_models/${docName}AuthProfilesModel.gen";`;
    const authProfilesRepo = `\n    private get userAuthProfilesRepo(): VexRepository<${docName}AuthProfiles> { return VexDb.getRepository(${docName}AuthProfilesEntity); }`;

    const tenantImport = tenantEnabled
        ? `\nimport TenantService from "../TenantService.gen";`
        : "";
    const tenantRepo = tenantEnabled
        ? `\n    private tenantService = new TenantService();`
        : "";
    const relatedImport = cleanup.map(c => c.imports).join("");
    const relatedRepos = cleanup.map(c => c.getters).join("");
    const relatedBody = cleanup.map(c => c.body).join("");
    const relatedCall = plans.length > 0 ? `await this.removeRelated(userId)` : `{}`;

    const tenantBranch = tenantEnabled ? `
        const tenantId = UserContext.tenantId;
        if (!tenantId) throw new VexResErr(400, undefined, "Tenant is required for account deletion");

        const isMember = await this.tenantService.hasUserTenant(userId, tenantId);
        if (!isMember) throw new VexResErr(404, undefined, "User is not a member of this tenant");

        const deleted = await this.removeCredentials(userId);
        const related = ${relatedCall};
        await this.tenantService.removeUserTenant(userId, tenantId);

        return {
            userId,
            tenantId,
            tombstonedAt: "",
            deleted: { ...deleted, userTenants: 1 },
            related,
        };
` : `
        const existing = await this.userRepo.findOneWithDeleted(
            { [identityField]: userId } as unknown as Filter<${docName}>,
        );
        if (!existing) throw new VexResErr(404);

        // idempotent: a repeat call must not re-stamp the row's audit fields
        if ((existing as unknown as Record<string, unknown>)[softDeleteField] === true) {
            return {
                userId,
                tombstonedAt: "",
                deleted: { authProfiles: 0, userRoles: 0, sessions: 0 },
                related: {},
            };
        }

        const deleted = await this.removeCredentials(userId);
        const related = ${relatedCall};
        const tombstoned = await this.userRepo.softDelete(userId, TOMBSTONE)
            .catch(e => {
                throw new VexResErr(500, undefined, "Account tombstone failed");
            })
        return {
            userId,
            tombstonedAt: String((tombstoned as unknown as Record<string, unknown>).updatedAt ?? ""),
            deleted,
            related,
        };
`;

    const removeRelatedMethod = plans.length > 0 ? `
    /** Remove the caller's rows from the configured deleteTables. Soft-delete when declared. */
    private async removeRelated(userId: string): Promise<Record<string, number>> {
        const removed: Record<string, number> = {};
${relatedBody}
        return removed;
    }
` : "";

    const source = `// {{headerComment}}
import { VexRepository, Filter, VexResErr } from "../../_types/vex";
import VexDb from "../VexDb.gen";
import UserContext from "../../_middlewares/UserContext.gen";
import { deleteAccountResponse } from "../../_types/auth.gen";
import { ${docName}Entity, ${docName} } from "../../_models/${docName}Model.gen";
import { SessionEntity, Session } from "../../_models/SessionModel.gen";${authProfilesImport}${rbacImport}${tenantImport}${relatedImport}

/** The soft-delete marker this service tombstones with. */
const softDeleteField = "${marker.field}";
/** The identity field — the tombstone keeps it, so business foreign keys stay resolvable. */
const identityField = "${identity.field}";

/**
 * Fields wiped in the same write as the tombstone.
 *
 * Deliberately NOT a hard delete: business rows hold required foreign keys to this row, so the
 * row must survive for them to stay resolvable. It is redacted instead — see the spec's
 * tombstone decision.
 */
const TOMBSTONE: Partial<${docName}> = {
${redactions}
};

/**
 * Identity-domain account deletion.
 *
 * Ordering matters: credentials are removed BEFORE the tombstone is written. Tombstoning first
 * would leave the OAuth path able to resolve the account through
 * ${docName}AuthProfiles.provider / providerUserId — which is exactly how a deleted user would still be
 * able to log back into their own tombstone. Doing the marker last also means a mid-flight failure
 * leaves a still-live account the caller can simply delete again.
 */
export default class AccountDeletionService {

    private get userRepo(): VexRepository<${docName}> { return VexDb.getRepository(${docName}Entity); }
    private get sessionRepo(): VexRepository<Session> { return VexDb.getRepository(SessionEntity); }${authProfilesRepo}${rbacRepo}${tenantRepo}${relatedRepos}

    /**
     * Delete the calling account.
     *
     * The identity comes from the verified token only — no id is ever accepted from a path or a
     * body, so one account cannot delete another.
     */
    public async deleteSelf(): Promise<deleteAccountResponse> {
        const userId = UserContext.userId;
        if (!userId) throw new VexResErr(401);
${tenantBranch}
    }

    /** Count first, then delete, so the response can report how much was removed. */
    private async removeCredentials(userId: string): Promise<{ authProfiles: number, userRoles: number, sessions: number }> {
        const filter = { userId } as unknown as Filter<Session>;

        const authProfiles = await this.userAuthProfilesRepo.count({ userId } as unknown as Filter<${docName}AuthProfiles>);
        await this.userAuthProfilesRepo.deleteWhere({ userId } as unknown as Filter<${docName}AuthProfiles>);
${useRBAC ? `
        const userRoles = await this.userRoleRepo.count({ userId } as unknown as Filter<${docName}Role>);
        await this.userRoleRepo.deleteWhere({ userId } as unknown as Filter<${docName}Role>);` : ""}
        const sessions = await this.sessionRepo.count(filter);
        await this.sessionRepo.deleteWhere(filter);

        return {
            authProfiles,
            userRoles: ${useRBAC ? "userRoles" : "0"},
            sessions,
        };
    }
${removeRelatedMethod}}
`;

    const outPath = `${options.serviceDir}/account/AccountDeletionService.gen.ts`;
    utils.common.writeFile("Account Deletion Service", outPath, utils.template.format(source));
}

export default { compile };
