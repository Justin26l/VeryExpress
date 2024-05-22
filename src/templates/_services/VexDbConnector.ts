// {{headerComment}}

import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import vex from "./../_utils/index.gen";

export default class VexDbConnector {
    private mongoUrl: string;
    private sqlUrl: string;


    constructor(options:{
        mongoUrl?: string;
        sqlUrl?: string;
    }){
        this.mongoUrl = options.mongoUrl || "";
        this.sqlUrl = options.sqlUrl || "";
    }
    
    connectMongo() : mongoose.Connection | void {
        if ( !this.mongoUrl ){
            vex.log.error(`VexDbConnector : MongoUrl is not invalid "${this.mongoUrl}"`);
            return;
        }
        /**
         * @param retryTime time in second
         */
        const connectWithRetry = (retryTime: number = 10) : Promise<void | typeof mongoose> => {
            // vex.log.infoMongo("Connection with retry");
            return mongoose.connect(this.mongoUrl, {
                autoCreate: true,
                connectTimeoutMS: 5000,
            })
                .catch((err) => {
                    vex.log.errorMongo(`Failed to Connect DB, Retrying in ${retryTime} seconds.`, err);
                    setTimeout(connectWithRetry, retryTime*1000);
                });
        };
        connectWithRetry(10);

        mongoose.connection.on("open", () => {
            vex.log.infoMongo("MongoDB Connection open : " + this.mongoUrl);
        });

        mongoose.connection.on("error", (err: any) => {
            vex.log.errorMongo("MongoDB Connection error:", err.message, err);
        });

        return mongoose.connection;
    }

    middleware(req: Request, res: Response, next: NextFunction) {
        if (mongoose.connection.readyState !== 1) { 
            vex.response.send(res, 503, "Database Connection Down");
        }
        else {
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
    }
}