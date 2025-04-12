// {{headerComment}}

import { Request, Response } from "express";
import vex from "./../_utils/index.gen";
import { VexResponseError } from "../_utils/response.gen";
import responseCode from "../_types/response/responseCode.gen";

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
        return vex.response.send(res, err.status, { 
          code: err.ret_code,
          message: err.message
        });
      }
      else {
        return vex.response.send(res, 500, { 
          code: responseCode.SERVER_ERROR, 
          message: err.message || "Internal Server Error"
        });
      };
    });
  }
}