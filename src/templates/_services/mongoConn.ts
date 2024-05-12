// {{headerComment}}

import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import log from "./../../system/_utils/logger.gen";

export function connect(mongoUrl:string): mongoose.Connection {
    mongoose.connect(mongoUrl, {
        autoCreate: true,
    });

    mongoose.connection.on("open", () => {
        log.ok("MongoDB Connection open : " + mongoUrl);
    });

    mongoose.connection.on("error", (err: any) => {
        log.error("MongoDB Connection error:", err.message, err);
    });

    return mongoose.connection;
}

export function middleware(req: Request, res: Response, next: NextFunction) {
    const db = mongoose.connection;
    if (db.readyState !== 1) { 
        return res.status(503).json({ error: "Database connection issue" });
    }
    else {
        next();
    }
}

const mongo = {
    connect,
    middleware
};

export default mongo;