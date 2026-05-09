// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { VexResErr } from "../_types/vex";

/**
 * Validates that every join path in the request is within the pre-computed
 * whitelist for the owning document.  Instantiated per-controller with the
 * allowed paths embedded at code-generation time.
 *
 * Join paths follow TypeORM relation notation: "user", "user.userAuthProfiles".
 */
class JoinWhitelistMiddleware {


    public middleware (allowedPaths: string[]) {
        const extractJoin = (req: Request): string[] | undefined => {
            // getList sends join inside POST body; get sends it as query param
            const bodyJoin = (req.body as { join?: string[] })?.join;
            const queryJoin = req.query?.join;

            if (bodyJoin) return bodyJoin;
            if (!queryJoin) return undefined;
            return Array.isArray(queryJoin) ? (queryJoin as string[]) : [queryJoin as string];
        };

        return (req: Request, res: Response, next: NextFunction): void => {
            const join = extractJoin(req);

            if (!join || join.length === 0) {
                return next();
            }

            for (const joinPath of join) {
                if (!allowedPaths.includes(joinPath)) {
                    throw new VexResErr(403, undefined, `Join path "${joinPath}" is not allowed`);
                }
            }

            next();
        };
    };
}

export default new JoinWhitelistMiddleware();
