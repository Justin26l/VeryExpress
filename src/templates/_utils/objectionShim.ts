// Compatibility shim: expose a Mongoose-like API backed by Objection model classes
import { Model } from "objection";

export function createMongooseLikeModel<T = any>(ObjectionModelClass: typeof Model) {
    return class M {
        [k: string]: any;
        constructor(data?: Partial<T>) { 
            if (data) {
                Object.assign(this, data);
                // normalize id/_id fields for mongoose-like compatibility
                try {
                    if ((this as any).id && !(this as any)._id) (this as any)._id = (this as any).id;
                    if ((this as any)._id && !(this as any).id) (this as any).id = (this as any)._id;
                } catch (e) {}
            }
        }
        get(key: string) { return (this as any)[key]; }
        async save() {
            const myId = (this as any)._id || (this as any).id;
            if (myId) {
                const updated = await (M as any).findByIdAndUpdate(myId, this);
                if (updated) Object.assign(this, updated);
                return this;
            }
            const created = await (M as any).create(this);
            if (created) Object.assign(this, created);
            return this;
        }

        // ensure Objection model is bound to a Knex instance if available
        static bindIfNeeded() {
            try {
                const g = (globalThis as any).__vex_sql;
                if (g && !(ObjectionModelClass as any).__vex_knexBound) {
                    ObjectionModelClass.knex(g);
                    (ObjectionModelClass as any).__vex_knexBound = true;
                }
            }
            catch (e) {
                // ignore
            }
        }

        static toPlain(obj: any): Partial<T> | undefined {
            if (!obj) return obj;
            try {
                if (typeof obj.toJSON === "function") return obj.toJSON();
                if (typeof obj.$toJson === "function") return obj.$toJson();
            }
            catch (e) {
                // ignore
            }
            if (typeof obj === "object") {
                const plain = Object.assign({}, obj) as any;
                // normalize id/_id
                if (plain.id && !plain._id) plain._id = plain.id;
                if (plain._id && !plain.id) plain.id = plain._id;
                return plain as Partial<T>;
            }
            return obj as Partial<T>;
        }

        static query() { M.bindIfNeeded(); return ObjectionModelClass.query(); }

        static find(filter: any = {}, fields?: any) {
            M.bindIfNeeded();
            let qb: any = ObjectionModelClass.query().where(filter || {});
            if (fields) qb = qb.select(fields);
            const promise = qb.then((rows: any[]) => rows.map(r => new M(M.toPlain(r))));
            const q: any = { exec: () => promise };
            q.then = (res: any, rej: any) => promise.then(res, rej);
            q.catch = (fn: any) => promise.catch(fn);
            return q;
        }

        static findOne(filter: any = {}) {
            M.bindIfNeeded();
            const qb = ObjectionModelClass.query().where(filter || {}).first();
            const promise = qb.then((row: any) => row ? new M(M.toPlain(row)) : null);
            const q: any = { exec: () => promise };
            q.then = (res: any, rej: any) => promise.then(res, rej);
            q.catch = (fn: any) => promise.catch(fn);
            return q;
        }

        static deleteOne(filter: any = {}) {
            M.bindIfNeeded();
            const promise = ObjectionModelClass.query().delete().where(filter || {});
            const q: any = { exec: () => promise };
            q.then = (res: any, rej: any) => promise.then(res, rej);
            q.catch = (fn: any) => promise.catch(fn);
            return q;
        }

        static async create(doc: any) {
            // use insertAndFetch when available
            M.bindIfNeeded();
            const qb: any = ObjectionModelClass.query();
            const row = typeof qb.insertAndFetch === "function"
                ? await qb.insertAndFetch(doc)
                : await qb.insert(doc).then(() => ObjectionModelClass.query().findOne(doc));
            return new M(M.toPlain(row));
        }

        static async findById(id: any) {
            M.bindIfNeeded();
            const row = await ObjectionModelClass.query().findById(id);
            return row ? new M(M.toPlain(row)) : null;
        }

        static async findByIdAndUpdate(id: any, patch: any) {
            M.bindIfNeeded();
            const qb: any = ObjectionModelClass.query();
            const row = typeof qb.patchAndFetchById === "function"
                ? await qb.patchAndFetchById(id, patch)
                : (await qb.where({ id }).update(patch), await qb.findById(id));
            return row ? new M(M.toPlain(row)) : null;
        }

        static async findByIdAndDelete(id: any) {
            M.bindIfNeeded();
            const row = await ObjectionModelClass.query().findById(id);
            if (!row) return null;
            await ObjectionModelClass.query().deleteById(id);
            return new M(M.toPlain(row));
        }

        static async replaceOne(filter: any, doc: any) {
            M.bindIfNeeded();
            const qb: any = ObjectionModelClass.query();
            const first = await qb.where(filter || {}).first();
            if (!first) return null;
            const id = (first as any).id || (first as any)._id;
            const row = typeof qb.patchAndFetchById === "function"
                ? await qb.patchAndFetchById(id, doc)
                : (await qb.where({ id }).update(doc), await qb.findById(id));
            return row ? new M(M.toPlain(row)) : null;
        }

        // instance helper to mimic Mongoose's document.updateOne
        async updateOne(patch: any) {
            const myId = (this as any)._id || (this as any).id;
            if (!myId) throw new Error("updateOne: missing id");
            const updated = await (M as any).findByIdAndUpdate(myId, patch);
            if (updated) Object.assign(this, updated);
            return updated;
        }
    } as any;
}

export default createMongooseLikeModel;
