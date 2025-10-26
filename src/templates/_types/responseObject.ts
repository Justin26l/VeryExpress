
export interface responseObject<T>{
    ret_code : number,
    ret_msg : string,
    ret_time?: number,
    result: T,
}