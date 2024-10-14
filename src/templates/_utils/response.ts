import { Response } from "express";
import { responseStatus } from "./../_types/responseMsg.gen";

/**
 * @param res express response object
 * @param code http status
 * @param message response data message
 * @param result response data result
 * @returns express response object
 */
export function send<T = undefined>(
    res: Response,
    code: number = 200,
    message?: string,
    result?: T,
): Response<any, Record<string, any>> {
    return res.status(code).json({
        ret_code: code,
        ret_msg: message || responseStatus.get(code) || "",
        ret_time: new Date().getTime(),
        result: result,
    });
}

export default {
    send
};