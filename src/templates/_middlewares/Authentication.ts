// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { JsonWebTokenError } from "jsonwebtoken";
import JWTService from "../_services/auth/JWTService.gen";
import { isActiveIdentity } from "../_services/auth/AccountStateGuard.gen";
import UserContext, { userIdOfToken } from "./UserContext.gen";
import log from "../_utils/logger.gen";
import { VexResErr } from "../_types/vex";

class Authentication {

    private JWTService = new JWTService();

    /**
     * Express request handler.
     *
     * Deliberately NOT `async`: both call sites are express chains — `@Middlewares(...)`, which the
     * tsoa route file spreads as a plain RequestHandler, and `router.use(...)`. Express 4 does not
     * catch a rejected promise, so an async handler would turn every failure into an unhandled
     * rejection instead of a response. The asynchronous part lives in `handle()` and every outcome
     * is routed to `next()`.
     */
    public middleware = (req: Request, res: Response, next: NextFunction): void => {
        this.handle(req, next).catch((e: unknown) => next(this.toVexErr(e)));
    };

    private async handle(req: Request, next: NextFunction): Promise<void> {
        // gate keeper
        // log.info("Authentication.middleware", req.headers["x-auth-index"], req.headers.authorization);
        const token = req.headers.authorization?.split(" ")[1];
        const accessTokenIndex = req.headers["x-auth-index"]?.toString();

        if (!token || !accessTokenIndex) {
            log.warn("invalid header", {
                "X-Auth-Index": req.headers["x-auth-index"], 
                "Authorization": req.headers.authorization
            });
            throw 401;
        }

        // verify token
        const tokenData = this.JWTService.verifyToken(token, accessTokenIndex);

        // The signature only proves the token was issued; it says nothing about the account still
        // being there. A deleted account is soft-deleted, so this check is what stops its token
        // from working for the rest of its lifetime.
        if (!(await isActiveIdentity(userIdOfToken(tokenData)))) {
            throw new VexResErr(401, undefined, "Account is not active");
        }

        req.user = tokenData;
        UserContext.run(tokenData, () => next());
    }

    private toVexErr(e: unknown): VexResErr {
        if (typeof e === "number") return new VexResErr(e, undefined);
        if (e instanceof VexResErr) return e;
        if (e instanceof JsonWebTokenError) return new VexResErr(400, undefined, e?.message);

        return new VexResErr(500, undefined, e instanceof Error ? e.message : undefined);
    }
}

export default new Authentication();
