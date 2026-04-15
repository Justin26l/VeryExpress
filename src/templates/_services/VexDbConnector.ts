// {{headerComment}}
import mongoose from "mongoose";
import { Request, Response, NextFunction } from "express";
import knex, { Knex } from "knex";
import utils from "./../_utils";

export default class VexDbConnector {
    private mongoUrl: string;
    private sqlUrl: string;

    private sqlConnection?: Knex;
    private sqlClient?: string;
    private sqlCa: string;
    private recordAccessLog: boolean = false;

    constructor(options:{
        mongoUrl?: string;
        sqlUrl?: string;
        sqlCa?: string;
        recordAccessLog?: boolean;
    }){
        this.mongoUrl = options.mongoUrl || "";
        this.sqlUrl = options.sqlUrl || "";
        this.sqlCa = options.sqlCa || "";
        this.recordAccessLog = options.recordAccessLog || false;

        // Bind the middleware method to the instance
        this.middleware = this.middleware.bind(this);
    }
    
    connect(): void {
        if (this.mongoUrl) this.connectMongo();
        if (this.sqlUrl) this.connectSql();
    }

    close(): void {
        if (this.mongoUrl) this.closeMongo();
        if (this.sqlUrl) this.closeSql();
    }
    
    connectMongo() : mongoose.Connection | void {
        if ( !this.mongoUrl ){
            utils.log.error("VexDbConnector : MongoUrl is not invalid");
            return;
        }
        else {
            utils.log.infoMongo("Connecting to MongoDB...");
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

    connectSql(): Knex | void {
        if (!this.sqlUrl) {
            return;
        }
        else {
            utils.log.infoSql("Connecting to SQL DB...");
        }

        const url = this.sqlUrl.toLowerCase();
        if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
            this.sqlClient = "pg";
        } else if (url.startsWith("mysql://") || url.startsWith("mariadb://")) {
            this.sqlClient = "mysql2";
        } else {
            // try to guess by common keywords
            if (url.indexOf("postgres") !== -1) this.sqlClient = "pg";
            else this.sqlClient = "mysql2";
        }

        try {
            const caRaw = this.sqlCa || undefined;
            let ca: string | undefined;
            if (caRaw) {
                ca = caRaw.startsWith("-----BEGIN") ? caRaw : Buffer.from(caRaw, "base64").toString("utf8");
            }
            const insecure = (process.env.SQL_INSECURE_TLS || "").toLowerCase() === "true";
            const ssl = insecure ? { rejectUnauthorized: false } : (ca ? { rejectUnauthorized: true, ca } : undefined);

            utils.log.infoSql(`Using SQL client: ${this.sqlClient}, SSL: ${ssl ? "enabled" : "disabled"}`);
            const connection: Knex.Config["connection"] | string = this.sqlClient === "pg" ? { 
                user: new URL(this.sqlUrl).username,
                password: new URL(this.sqlUrl).password,
                host: new URL(this.sqlUrl).hostname,
                port: Number(new URL(this.sqlUrl).port),
                database: new URL(this.sqlUrl).pathname.slice(1),
                ssl
            } : this.sqlUrl;

            this.sqlConnection = knex({
                client: this.sqlClient,
                connection,
                pool: { min: 0, max: 10 }
            });

            // quick health check
            this.sqlConnection.raw("select 1").then(() => {
                utils.log.infoSql("SQL DB Connection established");
            })
            .catch((err:any) => {
                utils.log.errorSql("Failed to establish SQL DB connection", err);
            });

            return this.sqlConnection;
        }
        catch (err:any) {
            utils.log.errorSql("VexDbConnector: connectSql error", err);
            return;
        }
    }

    closeMongo(): void {
        if (mongoose.connection.readyState === 1) {
            mongoose.connection.close().then(() => {
                utils.log.infoMongo("MongoDB Connection closed");
            }).catch((err:any) => {
                utils.log.errorMongo("Error closing MongoDB connection", err);
            });
        }
    }

    closeSql(): void {
        if (this.sqlConnection) {
            this.sqlConnection.destroy().then(() => {
                utils.log.infoSql("SQL DB Connection closed");
            }).catch((err:any) => {
                utils.log.errorSql("Error closing SQL DB connection", err);
            });
        }
    }

    /**
     * Database Middleware  
     * Feature: 
     * - restrict access to app when DB connection down.
     * - record access log
     **/
    async middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (this.mongoUrl && mongoose.connection.readyState !== 1) {
                utils.response.send(res, 503, { code: utils.response.code.DB_CONN_ERR });
                return;
            }

            if (this.sqlUrl && this.sqlConnection) {
                try {
                    await this.sqlConnection.raw("select 1");
                }
                catch (err:any) {
                    utils.response.send(res, 503, { code: utils.response.code.DB_CONN_ERR });
                    return;
                }
            }

            if (this.recordAccessLog) {
                const logEntry = {
                    timestamp: new Date().getTime(),
                    ipa: req.socket.remoteAddress || req.headers["x-forwarded-for"],
                    method: req.method,
                    url: req.url.split("?")[0],
                    headers: req.headers,
                    query: req.query,
                } as any;

                // write to Mongo if available
                if (this.mongoUrl && mongoose.connection.readyState === 1) {
                    try {
                        mongoose.connection.collection("accessLogs").insertOne(logEntry);
                    }
                    catch (e:any) {
                        utils.log.error("Failed to write access log to Mongo", e);
                    }
                }

                // write to SQL if available
                if (this.sqlUrl && this.sqlConnection) {
                    try {
                        const table = "accessLogs";
                        const insert = { ...logEntry };
                        // knex may not accept headers/query objects directly for some DBs,
                        // so stringify them to be safe
                        insert.headers = JSON.stringify(insert.headers || {});
                        insert.query = JSON.stringify(insert.query || {});
                        await this.sqlConnection(table).insert(insert as any).catch(()=>{});
                    }
                    catch (e:any) {
                        utils.log.error("Failed to write access log to SQL", e);
                    }
                }

                next();
                return;
            }

            next();
        }
        catch (err:any) {
            utils.response.send(res, 503, { code: utils.response.code.DB_Action_ERR, message: err.message });
        }
    }
}

