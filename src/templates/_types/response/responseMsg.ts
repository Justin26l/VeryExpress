/** 
 * default response message by response code
 * { code: message }
 **/
export const responseMsg = {
    
    DB_CONN_ERR: "Database connection error",
    SERVER_ERROR: "Unknown Server Error",

    success: "Success",

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

export default responseMsg;