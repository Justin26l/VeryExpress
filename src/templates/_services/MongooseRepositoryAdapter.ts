// {{headerComment}}
import { Model, Document } from "mongoose";
import { VexRepository, Select, Filter, Join, VexPagination } from "../_types/vex";
import DataIsolationContext from "../_middlewares/DataIsolationContext.gen";
import { entityVexFields, VexFieldEntry } from "../_middlewares/VexFieldRegistry.gen";
import utils from "../_utils";

/** When a framework-managed field is written. */
type writePhase = "create" | "update";

/** Phase a reserved default keyword belongs to — `onCreate*` is write-once, `onUpdate*` is refreshed. */
function vexFieldPhaseOf(type: VexFieldEntry["type"]): writePhase {
    return type.startsWith("onCreate") ? "create" : "update";
}

/**
 * Value the DB layer writes for a framework-managed field.
 * Mongo documents store `Timestamp` fields as ISO strings and `UnixTimestamp` fields as
 * epoch seconds, so both targets end up with the same values.
 * Returns undefined when the field has no value in this context (no authenticated user).
 */
function resolveVexFieldValue(type: VexFieldEntry["type"], userId?: string): unknown {
    switch (type) {
    case "onCreateTimestamp":
    case "onUpdateTimestamp":
        return new Date().toISOString();
    case "onCreateUnixTimestamp":
    case "onUpdateUnixTimestamp":
        return Math.floor(Date.now() / 1000);
    case "onCreateUserId":
    case "onUpdateUserId":
        return userId;
    default:
        return undefined;
    }
}

export class MongooseRepositoryAdapter<T extends Document> implements VexRepository<T> {
    constructor(private model: Model<T>) {}

    /**
     * Framework-managed audit fields: strip the caller's values first — a client must never
     * forge createdBy / updatedAt — then fill the ones owned by this write phase.
     * Fields of the other phase are stripped without being written, which is what keeps
     * createdAt / createdBy immutable across an update.
     */
    private applyVexFields(data: Partial<T>, phase: writePhase): void {
        const fields = entityVexFields[this.model.modelName + "Entity"] ?? [];
        if (fields.length === 0) return;

        const userId = DataIsolationContext.getStore()?.userId;
        const values: Record<string, unknown> = {};

        for (const entry of fields) {
            delete (data as Record<string, unknown>)[entry.field];

            if (vexFieldPhaseOf(entry.type) !== phase) continue;

            const value = resolveVexFieldValue(entry.type, userId);
            if (value !== undefined) values[entry.field] = value;
        }

        Object.assign(data, values);
    }

    public get native(): Model<T> {
        return this.model;
    }

    find(filter: Filter, join?: Join, select?: Select, pagination?: VexPagination): Promise<T[]> {
        // TODO: complete mongoose support, handle join, select, and pagination
        return this.model.find((filter || {}) as any).exec();
    }

    async count(filter: Filter): Promise<number> {
        // TODO: complete mongoose support, handle filter
        return 0;
    }

    findOne(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(filter as any).exec();
    }

    findOneWhere(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(filter as any).exec();
    }

    async create(data: Partial<T>): Promise<T> {
        const enriched = { ...data };
        this.applyVexFields(enriched, "create");
        const doc = new this.model(enriched);
        return doc.save();
    }

    replace(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.replace called without id — refuse replace document");
            return Promise.resolve(null);
        }
        const enriched = { ...data };
        this.applyVexFields(enriched, "update");
        return this.model.findByIdAndUpdate(id, enriched, { new: true, overwrite: true }).exec();
    }

    update(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.update called without id — refuse update document");
            return Promise.resolve(null);
        }
        const enriched = { ...data };
        this.applyVexFields(enriched, "update");
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
        await this.model.deleteOne(filter as any).exec();
    }
}
