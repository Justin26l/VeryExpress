// {{headerComment}}
import { Request, Response } from "express";
import utils from "./../_utils";
import VexResponseError from "../_types/VexResponseError.gen";

export default class VexSystem {
  
    constructor() {
    // Bind the middleware method to the instance
        this.RouteHandler = this.RouteHandler.bind(this);
    }

    /**
   * System Middleware  
   * Feature: 
   * - error handling
   **/
    public RouteHandler(req: Request, res: Response, handler: (req: Request, res: Response) => any) {
        return handler(req, res).catch((err: any) => {
      
            if ( err instanceof VexResponseError ) {
                return utils.response.send(res, err.status, { 
                    code: err.ret_code,
                    message: err.message
                });
            }
            else {
                return utils.response.send(res, 500, { 
                    code: utils.response.code.SERVER_ERROR, 
                    message: err.message || "Internal Server Error"
                });
            }
        });
    }
}