// {{headerComment}}
import { Model, Document } from "mongoose";
import { VexRepository, Select, Filter, Join, VexPagination } from "../_types/vex";
import { entityVexFields, VexFieldEntry } from "../_middlewares/VexFieldRegistry.gen";
import DataIsolationContext from "../_middlewares/DataIsolationContext.gen";
import utils from "../_utils";

export class MongooseRepositoryAdapter<T extends Document> implements VexRepository<T> {
    constructor(private model: Model<T>) {}

    /** Get x-vexData field entries for this entity. */
    private getVexFields(): VexFieldEntry[] {
        return entityVexFields[this.model.modelName + "Entity"] ?? [];
    }

    /** Strip x-vexData fields from data, then inject correct values. */
    private sanitizeVexFields(data: Partial<T>, phase: "create" | "update"): void {
        const fields = this.getVexFields();
        if (fields.length === 0) return;

        // Strip — caller cannot set these fields
        for (const entry of fields) {
            delete (data as any)[entry.field];
        }

        // Inject
        const store = DataIsolationContext.getStore();
        for (const entry of fields) {
            if (entry.type === "unixTimestampOnCreate" && phase === "create") {
                (data as any)[entry.field] = Math.floor(Date.now() / 1000);
            }
            else if (entry.type === "unixTimestampOnUpdate") {
                (data as any)[entry.field] = Math.floor(Date.now() / 1000);
            }
            else if (entry.type === "userId" && store?.userId) {
                // All userId fields get injected on both create and update
                (data as any)[entry.field] = store.userId;
            }
        }
    }

    public get native(): Model<T> {
        return this.model;
    }

    find(filter: Filter, join?: Join, select?: Select, pagination?: VexPagination): Promise<T[]> {
        // TODO: complete mongoose support, handle join, select, and pagination
        return this.model.find(filter || {}).exec();
    }

    async count(filter: Filter): Promise<number> {
        // TODO: complete mongoose support, handle filter
        return 0;
    }

    findOne(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(filter).exec();
    }

    findOneWhere(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(filter).exec();
    }

    async create(data: Partial<T>): Promise<T> {
        const enriched = { ...data };
        this.sanitizeVexFields(enriched, "create");
        const doc = new this.model(enriched);
        return doc.save();
    }

    replace(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.replace called without id — refuse replace document");
            return Promise.resolve(null);
        }
        const enriched = { ...data };
        this.sanitizeVexFields(enriched, "update");
        return this.model.findByIdAndUpdate(id, enriched, { new: true, overwrite: true }).exec();
    }

    update(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.update called without id — refuse update document");
            return Promise.resolve(null);
        }
        const enriched = { ...data };
        this.sanitizeVexFields(enriched, "update");
        return this.model.findByIdAndUpdate(id, { $set: enriched }, { new: true }).exec();
    }

    async delete(id: string | undefined): Promise<void> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.delete called without id — refuse delete document");
            return;
        }
        await this.model.findByIdAndDelete(id).exec();
    }

    async deleteWhere(filter: Record<string, unknown>): Promise<void> {
        await this.model.deleteOne(filter).exec();
    }
}
