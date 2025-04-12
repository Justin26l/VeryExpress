export { responseMsg } from "./responseMsg.gen";
export { responseCode, ResponseCode } from "./responseCode.gen";
export { responseStatusCodeMap } from "./responseStatusCodeMap.gen";

export interface responseObject<T>{
    ret_code : number,
    ret_msg : string,
    ret_time?: number,
    result: T,
}