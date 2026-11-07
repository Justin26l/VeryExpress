// {{headerComment}}
import { Request, Response, NextFunction } from "express";
import { AsyncLocalStorage } from "async_hooks";
import { DataSource, EntityTarget, ObjectLiteral } from "typeorm";
import mongoose from "mongoose";
import { VexRepository } from "../_types/vex";
import { TypeOrmRepositoryAdapter } from "./TypeOrmRepositoryAdapter.gen";
import utils from "./../_utils";

/** The only surface a transaction callback gets. It never exposes the TypeORM manager. */
export interface VexTransaction {
    getRepository<T extends ObjectLiteral>(target: EntityTarget<T>): VexRepository<T>;
}

export class VexDbConnector {
    private sqlUrl: string;
    private sqlCa: string;
    private mongoUrl: string;
    private recordAccessLog: boolean = false;

    private dataSource?: DataSource;
    private transactionScope = new AsyncLocalStorage<boolean>();

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
        this.transaction = this.transaction.bind(this);
    }

    /**
     * Run `fn` in one database transaction. Throwing inside `fn` rolls everything back.
     *
     * Repositories come from the transaction's own manager, but the callback only receives
     * `getRepository`: handing out the manager would let call sites take the raw repository and
     * bypass isolation, audit stamping and fail-closed checks.
     *
     * Isolation reads `UserContext` from AsyncLocalStorage, so it applies inside the callback
     * unchanged. Nested calls are rejected rather than silently opening a second transaction.
     */
    async transaction<T>(fn: (tx: VexTransaction) => Promise<T>): Promise<T> {
        if (!this.sqlUrl) {
            throw new Error("VexDb.transaction is only available for the SQL target");
        }
        if (!this.dataSource) {
            throw new Error("SQL DataSource not initialized");
        }
        if (this.transactionScope.getStore()) {
            throw new Error("nested transaction is not supported");
        }

        return this.dataSource.transaction((manager) => this.transactionScope.run(true, () => fn({
            getRepository: <E extends ObjectLiteral>(target: EntityTarget<E>): VexRepository<E> =>
                new TypeOrmRepositoryAdapter<E & ObjectLiteral>(manager.getRepository(target)),
        })));
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
        const sslRequired = sqlUrl.searchParams.get("sslmode") === "require";
        const ssl = sslRequired ? 
            {
                rejectUnauthorized: insecure ? false : true,
                ca,
            } : 
            undefined;

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
                })
                .catch((err) => {
                    utils.log.errorSql(`Failed to initialize TypeORM, retrying in ${retryTime}s`, err);
                    setTimeout(() => connectWithRetry(retryTime), retryTime * 1000);
                });
        };

        connectWithRetry(10);
    }

    closeSql(): void {
        if (this.dataSource?.isInitialized) {
            this.dataSource.destroy()
                .then(() => utils.log.infoSql("TypeORM DataSource closed"))
                .catch((err) => utils.log.errorSql("Error closing TypeORM DataSource", err));
        }
    }

    // TODO: complete mongoose support
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

    closeMongo(): void {
        console.warn("VeryExpress unified db adapter (MongooseRepositoryAdapter) for Mongodb are under development, use with caution. Contribute to \"https://github.com/Justin26l/VeryExpress\"");
        mongoose.disconnect()
            .then(() => utils.log.infoMongo("Mongoose disconnected"))
            .catch((err) => utils.log.errorMongo("Error disconnecting Mongoose", err));
    }

    getRepository<T extends ObjectLiteral>(target: EntityTarget<T>): VexRepository<T>;
    getRepository<T>(target: EntityTarget<ObjectLiteral> | any): VexRepository<T> {
        if (target?.schema && target?.modelName) {
            console.warn("VeryExpress unified db adapter (MongooseRepositoryAdapter) for Mongodb are under development, use with caution. Contribute to \"https://github.com/Justin26l/VeryExpress\"");
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
