// {{headerComment}}
import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import utils from "./../_utils";

export default class VexDbConnector {
    private mongoUrl: string;
    private sqlUrl: string;

    private recordAccessLog: boolean = false;

    constructor(options:{
        mongoUrl?: string;
        sqlUrl?: string;
        recordAccessLog?: boolean;
    }){
        this.mongoUrl = options.mongoUrl || "";
        this.sqlUrl = options.sqlUrl || "";
        this.recordAccessLog = options.recordAccessLog || false;

        // Bind the middleware method to the instance
        this.middleware = this.middleware.bind(this);
    }
    
    
    connectMongo() : mongoose.Connection | void {
        if ( !this.mongoUrl ){
            utils.log.error("VexDbConnector : MongoUrl is not invalid");
            return;
        }
        /**
         * @param retryTime time in second
         */
        const connectWithRetry = (retryTime: number = 10) : Promise<void | typeof mongoose> => {
            // utils.log.infoMongo("Connection with retry");
            return mongoose.connect(this.mongoUrl, {
                autoCreate: true,
                connectTimeoutMS: 5000,
            })
                .catch((err) => {
                    utils.log.errorMongo(`Failed to Connect DB, Retrying in ${retryTime} seconds.`, err);
                    setTimeout(connectWithRetry, retryTime*1000);
                });
        };
        connectWithRetry(10);

        mongoose.connection.on("open", () => {
            utils.log.infoMongo("MongoDB Connection open");
        });

        mongoose.connection.on("error", (err: any) => {
            utils.log.errorMongo("MongoDB Connection error: ", err.message, err);
        });

        return mongoose.connection;
    }

    /**
     * Database Middleware  
     * Feature: 
     * - restrict access to app when DB connection down.
     * - record access log
     **/
    middleware(req: Request, res: Response, next: NextFunction) {
        if (mongoose.connection.readyState !== 1) { 
            utils.response.send(res, 503, {
                code: utils.response.code.DB_CONN_ERR,
            });
        }
        else if (this.recordAccessLog){
            mongoose.connection.collection("accessLogs").insertOne({
                timestamp: new Date().getTime(),
                ipa: req.socket.remoteAddress || req.headers["x-forwarded-for"],
                method: req.method,
                url: req.url.split("?")[0],
                headers: req.headers,
                // body: req.body,
                query: req.query,
            });
            next();
        }
        else{
            next();
        }
    }
}