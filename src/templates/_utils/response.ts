import { Response } from "express";
import { responseStatusToCode, responseMsg, ResponseCode } from "./../_types/response/index.gen";

/**
 * @param res express response object
 * @param status http response code
 * @param code custom response/error code
 * @param message response data message
 * @param result response data result
 * @returns express response object
 */
export function send<T = undefined>(
    res: Response,
    status: number = 200, 
    body?:{ 
        code?: ResponseCode,
        message?: string|null,
        result?: T,
    }
): Response<any, Record<string, any>> {
    const code :ResponseCode | undefined = body?.code || responseStatusToCode.get(status) as ResponseCode | undefined;
    const msg :string | undefined = body?.message || (code ? responseMsg[code] : undefined);
    const noBody = !code && !msg && !body?.result;

    if(noBody){
        return res.status(status).send();
    }
    else{
        return res.status(status)
        .json({
            ret_code: code,
            ret_msg: msg,
            elapse: Date.now() - res.locals?.startAt || 0,
            result: body?.result,
        });
    };
};

export default {
    send
};