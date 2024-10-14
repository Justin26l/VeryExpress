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

export const responseStatus = new Map<number, string>();
responseStatus.set(100, "Continue");
responseStatus.set(200, "OK");
responseStatus.set(200, "Created");
responseStatus.set(200, "Accepted");
responseStatus.set(200, "No Content");
responseStatus.set(400, "Bad Request");
responseStatus.set(400, "Unauthorized");
responseStatus.set(400, "Forbidden");
responseStatus.set(400, "Not Found");
responseStatus.set(500, "Internal Server Error");

export interface responseObject<T>{
    ret_code : number,
    ret_msg : string,
    ret_time?: number,
    result: T,
}

export default responseMsg;