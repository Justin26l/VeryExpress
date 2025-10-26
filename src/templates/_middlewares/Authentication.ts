// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { JsonWebTokenError } from "jsonwebtoken";
import JWTService from "../_services/auth/JWTService.gen";
import log from "../_utils/logger.gen";
import response from "../_utils/response.gen";

export default class Authentication {

    private JWTService = new JWTService();

    public middleware = (req: Request, res: Response, next: NextFunction) => {
        try {
            // gate keeper
            log.info("Authentication.middleware", req.headers["x-auth-index"], req.headers.authorization);
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

            // set req.user to the decoded token
            log.info("tokenValid", tokenData);
            req.user = tokenData;
            next();
        }
        catch (e: any) {
            if (typeof e === "number") {
                response.send(res, e);
            }
            else if (e instanceof JsonWebTokenError) {
                response.send(res, 400, { message: e?.message});
            }
            else {
                log.errorNoExit(e);
                response.send(res, 500, { message: e?.message});
            }
        }
    };
}