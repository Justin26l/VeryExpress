// {{headerComment}}

import { Request, Response, NextFunction } from "express";
import * as jwt from "../_plugins/auth/jwt.gen";
import Log from "../_utils/logger.gen";

export default class Authentication {

    public middleware = (req: Request, res: Response, next: NextFunction) => {
        try {
            Log.info("Authentication.middleware", req.headers.authorization);
            if (!req.headers.authorization) {
                Log.ok("no Header", req.headers.authorization);
                throw 401;
            }

            // verify token with jwt.verify
            const token = req.headers.authorization.split(' ')[1];
            const clientIndex = req.cookies.tokenIndex;
            const tokenValid = jwt.verifyToken(token, clientIndex);

            // if token is valid, set req.user to the decoded token
            if (tokenValid) {
                Log.ok("tokenValid", tokenValid);
                req.user = tokenValid;
            }
            else {
                Log.ok("tokenInvalid", tokenValid);
                throw 401;
            }

            next();
        }
        catch (e) {
            Log.errorNoExit(e);
            if (typeof e === 'number') {
                res.status(e).send("Unauthorized");
            }
            else {
                res.status(500).send("Internal server error");
            }
        }
    }
}