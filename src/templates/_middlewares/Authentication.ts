// {{headerComment}}

import { Request, Response, NextFunction } from "express";
import * as jwt from "../_plugins/auth/jwt.gen";
import Log from "../_utils/logger.gen";
import responseGen from "../_utils/response.gen";

export default class Authentication {

    public middleware = (req: Request, res: Response, next: NextFunction) => {
        try {
            Log.info("Authentication.middleware", req.headers.authorization);
            if (!req.headers.authorization) {
                Log.ok("no Header", req.headers.authorization);
                responseGen.send(res, 401);
                return;
            }

            // verify token with jwt.verify
            const token = req.headers.authorization.split(" ")[1];
            const clientIndex = req.cookies.tokenIndex;
            const tokenData = jwt.verifyToken(token, clientIndex);

            if (!tokenData) {
                Log.ok("tokenInvalid", tokenData);
                responseGen.send(res, 401);
                return;
            }

            // if token is valid, set req.user to the decoded token
            Log.ok("tokenValid", tokenData);
            req.user = tokenData;
            next();
        }
        catch (e) {
            if (typeof e === "number") {
                responseGen.send(res, e);
            }
            else {
                Log.errorNoExit(e);
                responseGen.send(res, 500);
            }
        }
    };
}