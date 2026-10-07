import utils from "~/utils";
import * as utilsGenerator from "~/utils/generator";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { findUserIdIdentity } from "~/preprocess/auditFields";
import { collectSoftDeleteEntities } from "~/preprocess/softDelete";

/**
 * Generates AccountStateGuard.gen.ts — the runtime answer to "does the identity carried by this
 * verified token still map to a live account?".
 *
 * Authentication.middleware verifies the JWT signature and nothing else, so without this check a
 * deleted user's unexpired access token keeps working for the rest of its lifetime. The guard
 * closes that gap.
 *
 * It exists only when the identity document is itself soft-deletable — otherwise there is no state
 * to check and the file is emitted as a no-op, so the middleware's import always resolves and
 * projects without soft delete pay nothing.
 *
 * See docs/features/accountDeletion.md.
 */
export async function compile(options: {
    documents: { path: string, schema: types.jsonSchema }[];
    serviceDir: string;
    compilerOptions: types.compilerOptions;
}): Promise<void> {
    log.process("Account State Guard");

    const identity = findUserIdIdentity(options.documents);
    const softDeleteEntities = collectSoftDeleteEntities(options.documents);

    // the check can only mean something when the identity document carries a marker
    const identityEntity = identity
        ? softDeleteEntities.find(entity => entity.documentName === identity.documentName)
        : undefined;

    const outPath = `${options.serviceDir}/auth/AccountStateGuard.gen.ts`;

    if (!identityEntity) {
        utils.common.writeFile("Account State Guard", outPath, `// {{headerComment}}
/**
 * No-op account-state guard.
 *
 * Emitted because this project's identity document (the field tagged \`x-vexData: "userId"\`)
 * declares no soft-delete marker, so there is no account state for a token to be checked against.
 * Authentication.middleware imports this unconditionally, which is why the file always exists.
 */
export async function isActiveIdentity(_userId: string | undefined): Promise<boolean> {
    return true;
}
`);
        return;
    }

    utils.common.writeFile("Account State Guard", outPath, `// {{headerComment}}
import { VexRepository, Filter } from "../../_types/vex";
import VexDb from "../VexDb.gen";
import { ${identityEntity.documentName}Entity, ${identityEntity.documentName} } from "../../_models/${identityEntity.documentName}Model.gen";

/** The identity field (\`x-vexData: "userId"\`) and the soft-delete marker of that same document. */
const identityField = "${identity.field}";
const softDeleteField = "${identityEntity.field}";

/**
 * Whether the identity carried by a verified token still maps to a live account.
 *
 * Deliberately a direct read of the marker off the identity row rather than an ordinary
 * repository read: the answer must depend on the marker's value alone, never on
 * \`app.showSoftDeleted\`, which governs adapter *visibility*. Under a normal read the tombstone
 * would simply be filtered out and every deleted account would look alive.
 *
 * \`findOneWithDeleted\` skips only the soft-delete term — the ownership filter still applies.
 */
export async function isActiveIdentity(userId: string | undefined): Promise<boolean> {
    if (!userId) return false;

    const row = await VexDb.getRepository<${identityEntity.documentName}Entity>(${identityEntity.documentName}Entity)
        .findOneWithDeleted(
            { [identityField]: userId } as unknown as Filter<${identityEntity.documentName}>,
            undefined,
            [identityField, softDeleteField] as unknown as string[],
        );

    if (row === null) return false;

    return (row as unknown as Record<string, unknown>)[softDeleteField] !== true;
}
`);
}

export default { compile };
