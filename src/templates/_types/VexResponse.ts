import { ResponseCode } from "./../_utils/response.gen";

export default class VexResponse<T = unknown> extends Error {
    public status: number;
    public body?: {
        code?: ResponseCode;
        message?: string | null;
        result?: T;
    };

    constructor(
        status: number = 200,
        body?: {
            code?: ResponseCode;
            message?: string | null;
            result?: T;
        }
    ) {
        super("VexResponse");
        this.name = "VexResponse";
        this.status = status;
        this.body = body;
    }
}
