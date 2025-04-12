import { Response } from "express";
import { responseMsg, responseCode, responseStatusCodeMap, type ResponseCode } from "./../_types/response/index.gen";

/**
 * @param res express response object
 * @param status http response code
 * @param code response code
 * @param message response message, default is response message by response code
 * @param result response data
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
    const noBody = !body || (body.code === undefined && body.message === undefined && body.result === undefined);

    if(noBody){
        return res.status(status).send();
    }
    else{
        const code :ResponseCode | undefined = body?.code ?? responseStatusCodeMap.get(status) as ResponseCode | undefined;
        const msg :string | undefined = body?.message ?? (code ? responseMsg[code] : undefined);

        return res.status(status)
            .header({
                "Content-Type": "application/json",
            })
            .json({
                ret_code: code,
                ret_msg: msg,
                elapse: Date.now() - res.locals?.startAt || 0,
                result: body?.result,
            });
    }
}

export interface responseObject<T>{
    ret_code : number,
    ret_msg : string,
    ret_time?: number,
    result: T,
}

export class VexResponseError extends Error {
    public status: number;
    public ret_code: ResponseCode;
    public ret_msg: any;

    constructor(
        status: number = 200, 
        code?: ResponseCode,
        message?: string,
    ) {
        super(message);
        this.name = "VexResponseError";
        this.status = status;
        this.ret_code = code || responseCode.SERVER_ERROR;
        this.ret_msg = message || responseMsg.SERVER_ERROR;
    }
}

export default {
    send,
    msg: responseMsg, 
    code: responseCode, 
    statusCodeMap: responseStatusCodeMap,
};