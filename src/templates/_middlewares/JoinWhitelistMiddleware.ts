// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { VexResErr } from "../_types/vex";
import joinWhitelistRegistry from "./JoinWhitelistRegistry.gen";

/**
 * Validates join paths against the centralized whitelist registry.
 *
 * The registry maps documentName → { relationName → relatedDocumentName }
 * and is generated at build time by VeryExpress from schema FK metadata.
 *
 * Nested paths like "user.userContact" on Package are validated hop-by-hop:
 *   1. check "user"        in Package's map → next doc = "User"
 *   2. check "userContact" in User's map    → ok
 */
class JoinWhitelistMiddleware {
    middleware(documentName: string) {
        return (req: Request, res: Response, next: NextFunction): void => {
            const join = this.extractJoin(req);

            if (!join || join.length === 0) {
                return next();
            }

            for (const joinPath of join) {
                this.validateJoinPath(joinPath, documentName);
            }

            next();
        };
    }

    private validateJoinPath(joinPath: string, rootDocumentName: string): void {
        const segments = joinPath.split(".");
        let currentDoc = rootDocumentName;

        for (const segment of segments) {
            const relations = joinWhitelistRegistry[currentDoc];
            if (!relations || !(segment in relations)) {
                throw new VexResErr(403, undefined, `Join "${segment}" is not allowed on "${currentDoc}"`);
            }
            currentDoc = relations[segment];
        }
    }

    private extractJoin(req: Request): string[] | undefined {
        // getList sends join inside POST body; get sends it as query param
        const bodyJoin = (req.body as { join?: string[] })?.join;
        const queryJoin = req.query?.join;

        if (bodyJoin) return bodyJoin;
        if (!queryJoin) return undefined;
        return Array.isArray(queryJoin) ? (queryJoin as string[]) : [queryJoin as string];
    }
}

export default new JoinWhitelistMiddleware();


