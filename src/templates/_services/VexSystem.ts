// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import utils from "./../_utils";
import { VexResErr, VexResOk } from "../_types/vex";


export default class VexSystem {

    /**
     * Express error-handling middleware.
     * Register AFTER all routes: app.use(VexSystem.responseHandler)
     */
    static responseHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): Response {
        if (err instanceof VexResOk) {
            return utils.response.send(res, err.status, err.body);
        }
        else if (err instanceof VexResErr) {
            const vexErr = err as VexResErr;
            return utils.response.send(res, vexErr.status, {
                code: vexErr.ret_code,
                message: vexErr.message,
            });
        }
        else {
            utils.log.error("Unhandled error:", err);
            const e: any = err;
            return utils.response.send(res, e?.status ?? 500, {
                code: e?.ret_code ?? utils.response.code.SERVER_ERROR,
                message: e?.message ?? "Internal Server Error",
            });
        }
    }

}