import * as types from "~/types/types";
import * as utilsGenerator from "~/utils/generator";
import { resolveExternalIdentity } from "~/utils/identityPresets";
import utils from "~/utils";
import log from "~/utils/logger";
import * as template from "./externalIdentity.template";

/**
 * Emits the external-identity runtime: the resolved config, the JWKS provider, the verifier/provisioner
 * service, and the login-page wiring.
 *
 * The first three exist only when the feature is enabled. The login-page module is written **always**,
 * exporting `undefined` when the feature is off, because `LoginUI.gen.ts` imports it unconditionally —
 * the same no-op contract `accountStateGuard.generator.ts` keeps for `Authentication.middleware`.
 *
 * A configuration error is reported and the feature is skipped rather than emitted half-working: an
 * endpoint that accepts third-party tokens with a broken verifier is worse than no endpoint.
 */
export async function compile(options: {
    serviceDir: string;
    routeDir: string;
    compilerOptions: types.compilerOptions;
}): Promise<void> {
    const uiPath = `${options.routeDir}/ExternalIdentityUI.gen.ts`;

    if (!utilsGenerator.isExternalIdentityEnabled(options.compilerOptions)) {
        utils.common.writeFile("External Identity UI", uiPath, template.uiModule(null));
        return;
    }

    const resolved = resolveExternalIdentity(options.compilerOptions.auth.externalIdentity ?? {});
    if (!resolved.ok) {
        log.error(
            `auth.externalIdentity is enabled but invalid — ${resolved.error}. ` +
            "The endpoint, verifier and login-page button are skipped. " +
            "See docs/plan/vex-external-identity.md and src/utils/identityPresets.ts."
        );
        utils.common.writeFile("External Identity UI", uiPath, template.uiModule(null));
        return;
    }

    const settings = resolved.value;
    log.process(
        `External Identity : preset=${settings.presetName ?? "<explicit>"} ` +
        `issuer=${settings.issuer} layer=${settings.identityLayer}`
    );

    const dir = `${options.serviceDir}/auth`;
    utils.common.writeFile(
        "External Identity Config",
        `${dir}/ExternalIdentityConfig.gen.ts`,
        template.configModule(settings)
    );
    utils.common.writeFile(
        "External Identity JWKS",
        `${dir}/JwksProvider.gen.ts`,
        template.jwksProvider()
    );
    utils.common.writeFile(
        "External Identity Service",
        `${dir}/ExternalIdentityService.gen.ts`,
        template.externalIdentityService()
    );
    utils.common.writeFile("External Identity UI", uiPath, template.uiModule(settings));
}

export default { compile };
