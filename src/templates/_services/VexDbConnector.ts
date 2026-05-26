// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
import mongoose from "mongoose";
// import { Document } from "mongoose";
import { sqlMigrations } from "../_models/sqlMigration.gen";
import { VexRepository } from "../_types/vex";
import { TypeOrmRepositoryAdapter } from "./TypeOrmRepositoryAdapter.gen";
// import { MongooseRepositoryAdapter } from "./MongooseRepositoryAdapter.gen";
import utils from "./../_utils";

export class VexDbConnector {
    private sqlUrl: string;
    private sqlCa: string;
    private mongoUrl: string;
    private recordAccessLog: boolean = false;

    public dataSource?: DataSource;

    constructor(options: {
        sqlUrl?: string;
        sqlCa?: string;
        mongoUrl?: string;
        recordAccessLog?: boolean;
    }) {
        this.sqlUrl = options.sqlUrl || "";
        this.sqlCa = options.sqlCa || "";
        this.mongoUrl = options.mongoUrl || "";
        this.recordAccessLog = options.recordAccessLog || false;
        this.middleware = this.middleware.bind(this);
    }

    connect(): void {
        if (this.sqlUrl) this.connectSql();
        if (this.mongoUrl) this.connectMongo();
    }

    close(): void {
        if (this.sqlUrl) this.closeSql();
        if (this.mongoUrl) this.closeMongo();
    }

    connectSql(): void {
        utils.log.infoSql("Connecting to SQL DB (TypeORM)...");
        const sqlUrl = new URL(this.sqlUrl);

        const ca = !this.sqlCa ? undefined : this.sqlCa.startsWith("-----BEGIN") ? this.sqlCa : Buffer.from(this.sqlCa, "base64").toString("utf8");
        const insecure = (process.env.SQL_INSECURE_TLS || "").toLowerCase() === "true";
        const ssl = { 
            rejectUnauthorized: insecure ? false : true,
            ca,
        };

        const ds = new DataSource({
            type: "postgres",
            host: sqlUrl.hostname,
            port: Number(sqlUrl.port) || 5432,
            username: sqlUrl.username,
            password: sqlUrl.password,
            database: sqlUrl.pathname.slice(1),
            ssl,
            synchronize: (process.env.SQL_SYNCHRONIZE || "").toLowerCase() === "true",
            logging: false,
            entities: [__dirname + "/../_models/*.gen.{ts,js}"],
            migrations: [],
        });

        const connectWithRetry = (retryTime = 10): void => {
            ds.initialize()
                .then(() => {
                    this.dataSource = ds;
                    utils.log.infoSql("TypeORM DataSource initialized");
                    this.runSqlMigrations(ds);
                })
                .catch((err) => {
                    utils.log.errorSql(`Failed to initialize TypeORM, retrying in ${retryTime}s`, err);
                    setTimeout(() => connectWithRetry(retryTime), retryTime * 1000);
                });
        };

        connectWithRetry(10);
    }

    private async runSqlMigrations(ds: DataSource): Promise<void> {
        if (!sqlMigrations.length) return;
        const runner = ds.createQueryRunner();
        await runner.connect();
        try {
            for (const sql of sqlMigrations) {
                utils.log.infoSql(`Applying migration: ${sql}`);
                await runner.query(sql);
            }
            utils.log.infoSql(`${sqlMigrations.length} migrations applied`);
        } catch (err) {
            utils.log.errorSql("SQL migration failed", err);
        } finally {
            await runner.release();
        }
    }

    closeSql(): void {
        if (this.dataSource?.isInitialized) {
            this.dataSource.destroy()
                .then(() => utils.log.infoSql("TypeORM DataSource closed"))
                .catch((err) => utils.log.errorSql("Error closing TypeORM DataSource", err));
        }
    }

    // TODO: complete mongoose support, handle join and select
    connectMongo(): void {
        console.warn("VeryExpress unified db adapter (MongooseRepositoryAdapter) for Mongodb are under development, use with caution. Contribute to \"https://github.com/Justin26l/VeryExpress\"");
        utils.log.infoMongo("Connecting to MongoDB (Driver: Mongoose)...");
        const connectWithRetry = (retryTime = 10): void => {
            mongoose.connect(this.mongoUrl)
                .then(() => utils.log.infoMongo("Mongoose connected"))
                .catch((err) => {
                    utils.log.errorMongo(`Failed to connect Mongoose, retrying in ${retryTime}s`, err);
                    setTimeout(() => connectWithRetry(retryTime), retryTime * 1000);
                });
        };
        connectWithRetry(10);
    }

    // TODO: complete mongoose support, handle join and select
    closeMongo(): void {
        console.warn("VeryExpress unified db adapter (MongooseRepositoryAdapter) for Mongodb are under development, use with caution. Contribute to \"https://github.com/Justin26l/VeryExpress\"");
        mongoose.disconnect()
            .then(() => utils.log.infoMongo("Mongoose disconnected"))
            .catch((err) => utils.log.errorMongo("Error disconnecting Mongoose", err));
    }

    // getRepository<T extends Document>(target: { schema: unknown; modelName: string }): VexRepository<T>;
    getRepository<T extends ObjectLiteral>(target: EntityTarget<T>): VexRepository<T>;
    getRepository<T>(target: EntityTarget<ObjectLiteral> | any): VexRepository<T> {
        // TODO: complete mongoose support, handle join and select
        if (target?.schema && target?.modelName) {
            console.warn("VeryExpress unified db adapter (MongooseRepositoryAdapter) for Mongodb are under development, use with caution. Contribute to \"https://github.com/Justin26l/VeryExpress\"");
            // return new MongooseRepositoryAdapter<T & Document>(target);
        }
        if (!this.dataSource) throw new Error("SQL DataSource not initialized");
        return new TypeOrmRepositoryAdapter<T & ObjectLiteral>(this.dataSource.getRepository(target));
    }

    async middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (this.sqlUrl && (!this.dataSource || !this.dataSource.isInitialized)) {
                utils.response.send(res, 503, { code: utils.response.code.DB_CONN_ERR });
                return;
            }

            if (this.recordAccessLog && this.dataSource?.isInitialized) {
                const logEntry = {
                    timestamp: new Date().getTime(),
                    ipa: req.socket.remoteAddress || req.headers["x-forwarded-for"],
                    method: req.method,
                    url: req.url.split("?")[0],
                    headers: JSON.stringify(req.headers),
                    query: JSON.stringify(req.query),
                };
                try {
                    await this.dataSource.getRepository("AccessLog").save(logEntry);
                }
                catch { /* table may not exist */ }
            }

            next();
        }
        catch (err: unknown) {
            utils.response.send(res, 500, { code: utils.response.code.DB_CONN_ERR });
            return;
        }
    }
}

export default VexDbConnector;
