import * as types from "~/types/types";
import * as utilsGenerator from "~/utils/generator";
import utils from "~/utils";
import log from "~/utils/logger";
import * as template from "./firebaseAuth.template";

/**
 * Emits the Firebase sign-in runtime: the service-account loader, the verifier/provisioner service, and
 * the login-page wiring.
 *
 * The first two exist only when `auth.firebase` is on. The login-page module is written **always**,
 * exporting `undefined` when the feature is off, because `LoginUI.gen.ts` imports it unconditionally —
 * the same no-op contract `accountStateGuard.generator.ts` keeps for `Authentication.middleware`.
 */
export async function compile(options: {
    serviceDir: string;
    routeDir: string;
    compilerOptions: types.compilerOptions;
}): Promise<void> {
    const uiPath = `${options.routeDir}/FirebaseAuthUI.gen.ts`;

    if (!utilsGenerator.isFirebaseAuthEnabled(options.compilerOptions)) {
        utils.common.writeFile("Firebase Auth UI", uiPath, template.disabledUIModule());
        return;
    }

    const rbac = utilsGenerator.isRbacEnabled(options.compilerOptions);
    const defaultRole = options.compilerOptions.useRBAC?.default ?? "user";

    log.process(`Firebase Auth : enabled${rbac ? ` (default role: ${defaultRole})` : ""}`);

    const dir = `${options.serviceDir}/auth`;
    utils.common.writeFile(
        "Firebase Admin",
        `${dir}/FirebaseAdmin.gen.ts`,
        template.adminModule()
    );
    utils.common.writeFile(
        "Firebase Auth Service",
        `${dir}/FirebaseAuthService.gen.ts`,
        template.serviceModule({ rbac, defaultRole })
    );
    utils.common.writeFile("Firebase Auth UI", uiPath, template.uiModule());
}

export default { compile };
