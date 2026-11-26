import utils from "~/utils";
import log from "~/utils/logger";
import * as types from "~/types/types";
import { isVerifyOnlyAuthEnabled } from "~/utils/generator";

/**
 * Emits `Authentication.gen.ts` for the verify-only mode.
 *
 * The full middleware lives in `templates/_middlewares/Authentication.ts` and is copied when the app
 * signs users in. This variant keeps the same handler shape and drops the account-state read: a
 * verify-only app owns no account row, so `isActiveIdentity` would answer for a database that is not
 * this app's.
 */
export async function compile(options: {
    compilerOptions: types.compilerOptions;
    middlewareDir: string;
}): Promise<void> {
    if (!isVerifyOnlyAuthEnabled(options.compilerOptions)) return;

    log.process("Authentication Middleware (verify-only)");

    const source = `// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { JsonWebTokenError } from "jsonwebtoken";
import JWTService from "../_services/auth/JWTService.gen";
import UserContext from "./UserContext.gen";
import log from "../_utils/logger.gen";
import { VexResErr } from "../_types/vex";

/**
 * Request authentication for a verify-only app.
 *
 * The token is minted by the app that owns the accounts. This middleware checks the signature
 * against the shared key store and puts the payload in the request scope; it reads no account row.
 */
class Authentication {

    private JWTService = new JWTService();

    /**
     * Express request handler.
     *
     * Deliberately NOT \`async\`: both call sites are express chains — \`@Middlewares(...)\`, which the
     * tsoa route file spreads as a plain RequestHandler, and \`router.use(...)\`. Express 4 does not
     * catch a rejected promise, so an async handler would turn every failure into an unhandled
     * rejection instead of a response. The asynchronous part lives in \`handle()\` and every outcome
     * is routed to \`next()\`.
     */
    public middleware = (req: Request, res: Response, next: NextFunction): void => {
        this.handle(req, next).catch((e: unknown) => next(this.toVexErr(e)));
    };

    private async handle(req: Request, next: NextFunction): Promise<void> {
        const token = req.headers.authorization?.split(" ")[1];
        const accessTokenIndex = req.headers["x-auth-index"]?.toString();

        if (!token || !accessTokenIndex) {
            log.warn("invalid header", {
                "X-Auth-Index": req.headers["x-auth-index"], 
                "Authorization": req.headers.authorization
            });
            throw 401;
        }

        const tokenData = this.JWTService.verifyToken(token, accessTokenIndex);

        req.user = tokenData;
        UserContext.run({ tokenData }, () => next());
    }

    private toVexErr(e: unknown): VexResErr {
        if (typeof e === "number") return new VexResErr(e, undefined);
        if (e instanceof VexResErr) return e;
        if (e instanceof JsonWebTokenError) return new VexResErr(400, undefined, e?.message);

        return new VexResErr(500, undefined, e instanceof Error ? e.message : undefined);
    }
}

export default new Authentication();
`;

    utils.common.writeFile(
        "Authentication Middleware (verify-only)",
        `${options.middlewareDir}/Authentication.gen.ts`,
        utils.template.format(source),
    );
}

export default { compile };
