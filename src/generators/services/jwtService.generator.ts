import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isVerifyOnlyAuthEnabled } from "~/utils/generator";

/**
 * Emits `JWTService.gen.ts` for the verify-only mode.
 *
 * The full service (token minting, sessions, user rows) lives in `templates/_services/auth/` and is
 * copied when the app signs users in. A verify-only app issues no token, so it needs the signature
 * check and nothing else — which is also why this variant imports no model.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    serviceDir: string;
}): Promise<void> {
    if (!isVerifyOnlyAuthEnabled(options.compilerOptions)) return;

    log.process("JWT Service (verify-only)");

    const source = `// {{headerComment}}
import jwt from "jsonwebtoken";

import JWTKeyStore from "./JWTKeyStore.gen";

import { VexResErr } from "../../_types/vex";

/**
 * Token verification for a verify-only app.
 *
 * \`JWT_SECRET0..9\` and \`JWT_ALGORITHM\` must match the app that signs the tokens. The client sends
 * the key slot in \`X-Auth-Index\`, exactly as it does against the signing app.
 */
export default class JWTService {
    private keyStore = new JWTKeyStore();

    public verifyToken(token: string, index?: number | string): jwt.JwtPayload {

        if (token.startsWith("Bearer ")) {
            token = token.split("Bearer ")[1];
        }

        const key = this.keyStore.getSecret(index || 0);

        try {
            return jwt.verify(token, key) as jwt.JwtPayload;
        }
        catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new VexResErr(401, null, "Token expired");
            }
            else if (error instanceof jwt.JsonWebTokenError) {
                throw new VexResErr(401, null, "jwt malformed");
            }
            else {
                throw error;
            }
        }
    }
}
`;

    utils.common.writeFile(
        "JWT Service (verify-only)",
        `${options.serviceDir}/auth/JWTService.gen.ts`,
        utils.template.format(source),
    );
}

export default { compile };
