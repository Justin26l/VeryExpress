export default function knexModelTemplate(options: {
    documentName: string,
    tableName?: string,
    compilerOptions?: any,
}): string {
    const doc = options.documentName;
    const table = options.tableName || doc.toLowerCase();

    return `{{headerComment}}
import knex, { Knex } from 'knex';

let _db: Knex | undefined;
export function setDb(db: Knex) { _db = db; }
function getDb(): Knex {
    if (!_db) {
        const sqlUri = process.env.SQL_URI || process.env.DATABASE_URL || "";
        if (!sqlUri) {
            // fallback to in-memory sqlite for quick tests
            _db = knex({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
        }
        else {
            const url = sqlUri.toLowerCase();
            const client = url.includes('postgres') ? 'pg' : url.includes('mysql') ? 'mysql2' : 'sqlite3';
            const cfg: any = client === 'pg' ? { client: 'pg', connection: sqlUri } : { client, connection: sqlUri, useNullAsDefault: client === 'sqlite3' };
            _db = knex(cfg);
        }
    }
    return _db;
}

const tableName = "${table}";

function createThenable(qb: any) {
    const obj: any = { _promise: qb };
    obj.then = function(resolve: any, reject: any) { return this._promise.then(resolve, reject); };
    obj.catch = function(fn: any) { return this._promise.catch(fn); };
    obj.populate = function() { return this; };
    return obj;
}

export const ${doc}Model = {
    query() { return getDb()(tableName); },
    find(filter: any = {}, selectedFields?: any) {
        let qb: any = getDb()(tableName).where(filter || {});
        if (selectedFields) qb = qb.select(selectedFields);
        return createThenable(qb);
    },
    async findById(id: any) {
        return await getDb()(tableName).where({ id }).first();
    },
    async create(doc: any) {
        const db = getDb();
        const sql = (process.env.DB_CLIENT || process.env.SQL_URI || '').toLowerCase();
        if (sql.includes('pg') || (process.env.SQL_URI || '').includes('postgres')) {
            const [row] = await db(tableName).insert(doc).returning('*');
            return row;
        }
        const res = await db(tableName).insert(doc);
        const id = Array.isArray(res) ? res[0] : res;
        return await db(tableName).where({ id }).first();
    },
    async findByIdAndUpdate(id: any, patch: any) {
        const db = getDb();
        const sql = (process.env.DB_CLIENT || process.env.SQL_URI || '').toLowerCase();
        if (sql.includes('pg') || (process.env.SQL_URI || '').includes('postgres')) {
            const [row] = await db(tableName).where({ id }).update(patch).returning('*');
            return row;
        }
        await db(tableName).where({ id }).update(patch);
        return await db(tableName).where({ id }).first();
    },
    async replaceOne(filter: any, doc: any) {
        const db = getDb();
        const first = await db(tableName).where(filter || {}).first();
        if (!first) return null;
        await db(tableName).where({ id: first.id }).update(doc);
        return await db(tableName).where({ id: first.id }).first();
    },
    async findByIdAndDelete(id: any) {
        const db = getDb();
        const rec = await db(tableName).where({ id }).first();
        if (!rec) return undefined;
        await db(tableName).where({ id }).del();
        return rec;
    }
};

export default ${doc}Model;
`;
}
