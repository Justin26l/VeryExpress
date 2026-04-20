// {{headerComment}}
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import utils from './../_utils';

export class VexDbConnector {
    private sqlUrl: string;
    private sqlCa: string;
    private recordAccessLog: boolean = false;

    public sqlDataSource?: DataSource;

    constructor(options: {
        sqlUrl?: string;
        sqlCa?: string;
        recordAccessLog?: boolean;
    }) {
        this.sqlUrl = options.sqlUrl || '';
        this.sqlCa = options.sqlCa || '';
        this.recordAccessLog = options.recordAccessLog || false;
        this.middleware = this.middleware.bind(this);
    }

    connect(): void {
        if (this.sqlUrl) this.connectSql();
    }

    close(): void {
        if (this.sqlUrl) this.closeSql();
    }

    connectSql(): void {
        utils.log.infoSql('Connecting to SQL DB (TypeORM)...');

        const caRaw = this.sqlCa || undefined;
        let ca: string | undefined;
        if (caRaw) {
            ca = caRaw.startsWith('-----BEGIN') ? caRaw : Buffer.from(caRaw, 'base64').toString('utf8');
        }
        const insecure = (process.env.SQL_INSECURE_TLS || '').toLowerCase() === 'true';
        const ssl = insecure
            ? { rejectUnauthorized: false }
            : (ca ? { rejectUnauthorized: true, ca } : undefined);

        const sqlUrl = new URL(this.sqlUrl);
        const ds = new DataSource({
            type: 'postgres',
            host: sqlUrl.hostname,
            port: Number(sqlUrl.port) || 5432,
            username: sqlUrl.username,
            password: sqlUrl.password,
            database: sqlUrl.pathname.slice(1),
            ssl,
            synchronize: (process.env.SQL_SYNCHRONIZE || '').toLowerCase() === 'true',
            logging: false,
            entities: [],
            migrations: [],
        });

        const connectWithRetry = (retryTime = 10): void => {
            ds.initialize()
                .then(() => {
                    this.sqlDataSource = ds;
                    utils.log.infoSql('TypeORM DataSource initialized');
                })
                .catch((err) => {
                    utils.log.errorSql(`Failed to initialize TypeORM, retrying in ${retryTime}s`, err);
                    setTimeout(() => connectWithRetry(retryTime), retryTime * 1000);
                });
        };

        connectWithRetry(10);
    }

    closeSql(): void {
        if (this.sqlDataSource?.isInitialized) {
            this.sqlDataSource.destroy()
                .then(() => utils.log.infoSql('TypeORM DataSource closed'))
                .catch((err) => utils.log.errorSql('Error closing TypeORM DataSource', err));
        }
    }

    getSqlDataSource(): DataSource | undefined {
        return this.sqlDataSource;
    }

    async middleware(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (this.sqlUrl && (!this.sqlDataSource || !this.sqlDataSource.isInitialized)) {
                utils.response.send(res, 503, { code: utils.response.code.DB_CONN_ERR });
                return;
            }

            if (this.recordAccessLog && this.sqlDataSource?.isInitialized) {
                const logEntry = {
                    timestamp: new Date().getTime(),
                    ipa: req.socket.remoteAddress || req.headers['x-forwarded-for'],
                    method: req.method,
                    url: req.url.split('?')[0],
                    headers: JSON.stringify(req.headers),
                    query: JSON.stringify(req.query),
                };
                try {
                    const repo = this.sqlDataSource.getRepository('AccessLog');
                    await repo.save(logEntry);
                }
                catch { /* table may not exist */ }
            }

            next();
        }
        catch (err: unknown) {
            utils.response.send(res, 503, { code: utils.response.code.DB_Action_ERR, message: (err as Error).message });
        }
    }
}

const AppDataSource = new VexDbConnector({
    sqlUrl: process.env.SQL_URI ?? undefined,
    sqlCa: process.env.SQL_CA ?? undefined,
    recordAccessLog: false,
});

export default AppDataSource;
