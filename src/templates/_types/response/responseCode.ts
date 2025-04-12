import { responseMsg } from "./responseMsg.gen";

/** custom response code **/
export type ResponseCode = keyof typeof responseMsg;

/** 
 * response code of response message
 **/
export const responseCode = Object.keys(responseMsg).reduce((acc, key) => {
    acc[key] = key as ResponseCode;
    return acc;
}, {} as Record<string, ResponseCode>);


export default responseCode;