// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import utils from "./../_utils";
import VexResponseError from "../_types/VexResponseError.gen";

export default class VexSystem {

    /**
     * Express error-handling middleware.
     * Register AFTER all routes: app.use(VexSystem.errorHandler)
     */
    static errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): Response {
        if (err instanceof VexResponseError) {
            const vexErr = err as VexResponseError;
            return utils.response.send(res, vexErr.status, {
                code: vexErr.ret_code,
                message: vexErr.message,
            });
        }
        const e = err as any;
        return utils.response.send(res, e?.status ?? 500, {
            code: e?.ret_code ?? utils.response.code.SERVER_ERROR,
            message: e?.message ?? "Internal Server Error",
        });
    }

}