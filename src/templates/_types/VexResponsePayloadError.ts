import { ResponseCode } from "../_utils/response.gen";
import utils from "../_utils/index";

export default class VexResponsePayloadError extends Error {
    public status: number;
    public ret_code: ResponseCode | null;
    public ret_msg: any;
    public result: any;

    constructor(
        result?: any
    ) {
        super(utils.response.msg.err_payload);
        this.name = "VexResponsePayloadError";
        this.status = 400;
        this.ret_code = utils.response.code.err_payload;
        this.ret_msg = utils.response.msg.err_payload;
        this.result = result;
    }
}