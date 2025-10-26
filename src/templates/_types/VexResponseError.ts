import { ResponseCode } from "./../_utils/response.gen";
import utils from "../_utils/index";

export default class VexResponseError extends Error {
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
        this.ret_code = code || utils.response.code.SERVER_ERROR;
        this.ret_msg = message || utils.response.msg.SERVER_ERROR;
    }
}