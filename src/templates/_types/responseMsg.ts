export enum responseMsg {
    permissionDeny = "Permission Denied",
    ok = "OK", 
    notFound = "Not Found", 
    queryError = "Query Error", 
    validateError = "Validation Error", 
    unexpectedError = "Unexpected Error", 
    createFail = "Create Fail", 
    updateFail = "Update Fail", 
    deleteFail = "Delete Fail", 
}

export interface responseObject<T>{
    ret_code : number,
    ret_msg : string,
    ret_time?: number,
    result: T,
}

export default responseMsg;