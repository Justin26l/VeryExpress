// {{headerComment}}
import { Model, Document } from "mongoose";
import { VexRepository, Select, Filter, Join, VexPagination, VexResErr } from "../_types/vex";
import UserContext from "../_middlewares/UserContext.gen";
import { entityVexFields, entitySoftDeleteFields, showSoftDeleted, VexFieldEntry } from "../_middlewares/VexFieldRegistry.gen";
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
     * Fail loud when an entity declares a create-phase user field but no identity is in
     * scope — a silent NULL is exactly the failure this enforcement exists to kill.
     *
     * `onUpdateUserId` is deliberately NOT enforced: `updatedBy` is allowed to stay absent,
     * and refusing a context-less update would also break pre-auth writes that don't touch it.
     */
    private assertCreateIdentity(fields: VexFieldEntry[]): void {
        if (!fields.some(f => f.type === "onCreateUserId")) return;
        if (UserContext.userId) return;

        throw new VexResErr(500, undefined,
            `${this.model.modelName} declares onCreateUserId but UserContext carries no user identity`);
    }

    /**
     * Framework-managed audit fields: strip the caller's values first — a client must never
     * forge createdBy / updatedAt — then fill the ones owned by this write phase.
     * Fields of the other phase are stripped without being written, which is what keeps
     * createdAt / createdBy immutable across an update.
     */
    private applyVexFields(data: Partial<T>, phase: writePhase): void {
        const fields = entityVexFields[this.model.modelName + "Entity"] ?? [];
        if (fields.length === 0) return;

        if (phase === "create") this.assertCreateIdentity(fields);

        const userId = UserContext.userId;
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

    /** Entity class name — the key used by the generated registries. */
    private getEntityName(): string {
        return this.model.modelName + "Entity";
    }

    /**
     * Soft-delete term for this model, or null when it declares no marker.
     *
     * `$ne: true` (not `$eq: false`) so documents written before the field existed still count as
     * live — the same leniency the SQL side gets from NOT NULL DEFAULT false.
     */
    private getSoftDeleteFilter(): Record<string, unknown> | null {
        if (showSoftDeleted) return null;

        const field = entitySoftDeleteFields[this.getEntityName()];
        if (!field) return null;

        return { [field]: { $ne: true } };
    }

    private mergeFilter(filter: Filter, options?: { includeSoftDeleted?: boolean }): Record<string, unknown> {
        const softDelete = options?.includeSoftDeleted ? null : this.getSoftDeleteFilter();
        return { ...((filter || {}) as Record<string, unknown>), ...softDelete };
    }

    find(filter: Filter, join?: Join, select?: Select, pagination?: VexPagination): Promise<T[]> {
        // TODO: complete mongoose support, handle join, select, and pagination
        return this.model.find(this.mergeFilter(filter) as any).exec();
    }

    async count(filter: Filter): Promise<number> {
        // TODO: complete mongoose support, handle filter
        return 0;
    }

    findOne(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(this.mergeFilter(filter) as any).exec();
    }

    findOneWhere(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(this.mergeFilter(filter) as any).exec();
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
        await this.model.deleteOne(this.mergeFilter(filter as Filter) as any).exec();
    }

    /**
     * Tombstone the document: run the normal update-phase field machinery (so `updatedAt` /
     * `updatedBy` record who deleted it and when), then write the marker plus any redaction
     * the caller merged in.
     */
    async softDelete(id: string | undefined, data?: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("MongooseRepositoryAdapter.softDelete called without id — refuse update document");
            return null;
        }

        const field = entitySoftDeleteFields[this.getEntityName()];
        if (!field) {
            utils.log.error(
                `MongooseRepositoryAdapter.softDelete on ${this.getEntityName()} — entity declares no ` +
                `x-vexData "softDelete" field, refuse update document`
            );
            return null;
        }

        const enriched: Record<string, unknown> = { ...((data ?? {}) as Record<string, unknown>) };
        this.applyVexFields(enriched as Partial<T>, "update");
        enriched[field] = true;

        const filter = this.mergeFilter({ _id: id } as Filter);
        return this.model.findOneAndUpdate(filter as any, { $set: enriched }, { new: true }).exec();
    }

    /**
     * Read a document that may be soft-deleted: skips the soft-delete term only.
     * Framework-internal — see VexRepository.
     */
    findOneWithDeleted(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        // TODO: complete mongoose support, handle join and select
        return this.model.findOne(this.mergeFilter(filter, { includeSoftDeleted: true }) as any).exec();
    }
}
