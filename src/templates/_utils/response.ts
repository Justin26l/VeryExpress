import { Response } from "express";

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
    body?: {
        code?: ResponseCode,
        message?: string | null,
        result?: T,
    }
): Response<any, Record<string, any>> {
    const noBody = !body || (body.code === undefined && body.message === undefined && body.result === undefined);

    if (noBody) {
        return res.status(status).send();
    }
    else {
        const code: ResponseCode | undefined = body?.code ?? responseStatusCodeMap.get(status) as ResponseCode | undefined;
        const msg: string | undefined = body?.message ?? (code ? responseMessage[code] : undefined);

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

const responseMessage = {

    DB_CONN_ERR: "Database connection error",
    SERVER_ERROR: "Unknown Server Error",

    success: "Success",

    err_db_data: "Corrupted Database Record",

    err_permission: "Permission Denied",

    err_payload: "Invalid Request Payload",
    err_query: "Invalid Request Query",
    err_body: "Invalid Request Body",

    err_validation: "Validation Error",
    err_query_validation: "Query Validation Error",
    err_body_validation: "Body Validation Error",

    err_create: "Falied to Insert Data",
    err_read: "Falied to Read Data",
    err_update: "Falied to Edit Data",
    err_delete: "Falied to Delete Data",
};

const responseCode = Object.keys(responseMessage).reduce((acc, key) => {
    acc[key] = key as ResponseCode;
    return acc;
}, {} as Record<string, ResponseCode>);

const responseStatusCodeMap = new Map<number, string>([
    [100, "Continue"],
    [101, "Switching Protocols"],
    [102, "Processing"],
    [103, "Early Hints"],
    [200, responseCode.success],
    [201, responseCode.success],
    [202, responseCode.success],
    [203, "Non-Authoritative Information"],
    [204, "No Content"],
    [205, "Reset Content"],
    [206, "Partial Content"],
    [207, "Multi-Status"],
    [208, "Already Reported"],
    [226, "IM Used"],
    [300, "Multiple Choices"],
    [301, "Moved Permanently"],
    [302, "Found"],
    [303, "See Other"],
    [304, "Not Modified"],
    [307, "Temporary Redirect"],
    [308, "Permanent Redirect"],
    [400, responseCode.err_payload],
    [401, responseCode.err_permission],
    [402, "Payment Required"],
    [403, "Forbidden"],
    [404, "Not Found"],
    [405, "Method Not Allowed"],
    [406, "Not Acceptable"],
    [407, "Proxy Authentication Required"],
    [408, "Request Timeout"],
    [409, "Conflict"],
    [410, "Gone"],
    [411, "Length Required"],
    [412, "Precondition Failed"],
    [413, "Content Too Large"],
    [414, "URI Too Long"],
    [415, "Unsupported Media Type"],
    [416, "Range Not Satisfiable"],
    [417, "Expectation Failed"],
    [418, "I'm a teapot"],
    [421, "Misdirected Request"],
    [422, "Unprocessable Content"],
    [423, "Locked"],
    [424, "Failed Dependency"],
    [425, "Too Early"],
    [426, "Upgrade Required"],
    [428, "Precondition Required"],
    [429, "Too Many Requests"],
    [431, "Request Header Fields Too Large"],
    [451, "Unavailable For Legal Reasons"],
    [500, "Internal Server Error"],
    [501, "Not Implemented"],
    [502, "Bad Gateway"],
    [503, "Service Unavailable"],
    [504, "Gateway Timeout"],
    [505, "HTTP Version Not Supported"],
    [506, "Variant Also Negotiates"],
    [507, "Insufficient Storage"],
    [508, "Loop Detected"],
    [510, "Not Extended"],
    [511, "Network Authentication Required"],
]);

export type ResponseCode = keyof typeof responseMessage;

export default {
    send,
    msg: responseMessage,
    code: responseCode,
    statusCodeMap: responseStatusCodeMap,
};