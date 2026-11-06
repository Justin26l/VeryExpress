// {{headerComment}}
import { Repository, ObjectLiteral, FindOptionsWhere, DeepPartial, In, Not, Like, MoreThan, LessThan, MoreThanOrEqual, LessThanOrEqual, FindManyOptions } from "typeorm";
import { VexRepository, Select, Filter, Join, FieldOperators, VexPagination, VexResErr } from "../_types/vex";
import UserContext from "../_middlewares/UserContext.gen";
import { entityIsolation, DataIsolationEntry } from "../_middlewares/DataIsolationRegistry.gen";
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
 * Returns undefined when the field has no value in this context (no authenticated user) —
 * the column is then left untouched instead of being set to "undefined".
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

export class TypeOrmRepositoryAdapter<T extends ObjectLiteral> implements VexRepository<T> {
    constructor(private repo: Repository<T>) {}

    /** Entity class name from TypeORM metadata — the key used by the generated registries. */
    private getEntityName(): string {
        return this.repo.metadata.target instanceof Function
            ? this.repo.metadata.target.name
            : "";
    }

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
            `${this.getEntityName()} declares onCreateUserId but UserContext carries no user identity`);
    }

    /**
     * Framework-managed audit fields: strip the caller's values first — a client must never
     * forge createdBy / updatedAt — then fill the ones owned by this write phase.
     * Fields of the other phase are stripped without being written, which is what keeps
     * createdAt / createdBy immutable across an update.
     */
    private applyVexFields(data: Partial<T>, phase: writePhase): void {
        const fields = entityVexFields[this.getEntityName()] ?? [];
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

    /** Value the request context supplies for one isolation rule. */
    private resolveIsolationValue(source: DataIsolationEntry["source"]): string | undefined {
        return source === "user.tenantId" ? UserContext.tenantId : UserContext.userId;
    }

    /**
     * Isolation terms for this entity, ANDed into the caller's filter.
     *
     * A tenant term fails closed: a document that declares one is unreachable when the
     * request carries no tenant, unless a cross-tenant role lifted the scope. An ownership
     * term keeps its historical skip-when-unauthenticated behaviour.
     */
    private getIsolationFilter(): Record<string, unknown> | null {
        const rules = entityIsolation[this.getEntityName()] ?? [];
        if (rules.length === 0) return null;

        const terms: Record<string, unknown> = {};

        for (const rule of rules) {
            const value = this.resolveIsolationValue(rule.source);
            if (value === undefined) {
                if (rule.onMissing === "deny") {
                    throw new VexResErr(403, undefined,
                        `${this.getEntityName()} is isolated by ${rule.source} but the request carries no such value`);
                }
                continue;
            }

            terms[rule.field] = value;
        }

        return Object.keys(terms).length > 0 ? terms : null;
    }

    /**
     * Remove isolation fields from caller-supplied data. A client must never be able to
     * move a row under another owner or into another tenant.
     */
    private stripIsolationFields(data: Partial<T>): void {
        for (const rule of entityIsolation[this.getEntityName()] ?? []) {
            if (rule.field === "_id") continue;
            delete (data as Record<string, unknown>)[rule.field];
        }
    }

    /** Fill isolation fields from the request context on create. */
    private stampIsolationFields(data: Partial<T>): void {
        for (const rule of entityIsolation[this.getEntityName()] ?? []) {
            // a rule on `_id` filters the row's own id; it is never stamped
            if (rule.field === "_id") continue;

            // `all` is a read scope: a write still needs a concrete tenant to stamp.
            const value = this.resolveIsolationValue(rule.source);
            if (value !== undefined) {
                (data as Record<string, unknown>)[rule.field] = value;
            }
            else if (rule.onMissing === "deny") {
                throw new VexResErr(403, undefined,
                    `${this.getEntityName()} is isolated by ${rule.source} but the request carries no such value`);
            }
        }
    }

    /**
     * Soft-delete term for this entity, or null when it declares no marker.
     *
     * `Not(true)` rather than `deleted: false`: the generated column is NOT NULL DEFAULT false, so
     * the two are equivalent for rows written by this schema, and `Not(true)` stays correct for a
     * row that predates the column (NULL) on a target where that can happen.
     */
    private getSoftDeleteFilter(): Record<string, unknown> | null {
        if (showSoftDeleted) return null;

        const field = entitySoftDeleteFields[this.getEntityName()];
        if (!field) return null;

        return { [field]: Not(true) };
    }

    /** Merge caller filter with isolation and soft-delete terms. Isolation always wins. */
    private mergeFilter(
        callerFilter: Filter<T>,
        options?: { includeSoftDeleted?: boolean },
    ): Record<string, unknown> | Array<Record<string, unknown>> {
        const mapped = this.mapOperators(callerFilter);
        const isolation = this.getIsolationFilter();
        const softDelete = options?.includeSoftDeleted ? null : this.getSoftDeleteFilter();

        if (mapped instanceof Array) {
            return mapped.map(branch => ({ ...branch, ...softDelete, ...isolation }));
        } 
        else {
            return { ...mapped, ...softDelete, ...isolation };
        }
    }

    private mapOperators(filter: Filter<T>): Record<string, unknown> | Array<Record<string, unknown>> {
        if (!filter || typeof filter !== "object") return {};

        let out: Record<string, unknown> | Array<Record<string, unknown>> = {};

        if( filter["$or"] && Array.isArray(filter["$or"])) {
            out = [];
            out.push(...filter["$or"].map(v => this.mapOperators(v) as Record<string, unknown>));
            return out;
        }

        for (const [key, val] of Object.entries(filter)) { 
            if (val && typeof val === "object" && !Array.isArray(val)) {
                // Common mongo-like operators supported in JSON payloads
                const oval = val as FieldOperators;

                if (oval?.$in && Array.isArray(oval.$in) && oval.$in.every((v: unknown) => typeof v === "string")) {
                    out[key] = In(oval.$in);
                    continue;
                }
                if (oval?.$nin && Array.isArray(oval.$nin) && oval.$nin.every((v: unknown) => typeof v === "string")) {
                    out[key] = Not(In(oval.$nin));

                    continue;
                }
                if (oval?.$gt) {
                    out[key] = MoreThan(oval.$gt);
                    continue;
                }
                if (oval?.$gte) {
                    out[key] = MoreThanOrEqual(oval.$gte);
                    continue;
                }
                if (oval?.$lt) {
                    out[key] = LessThan(oval.$lt);
                    continue;
                }
                if (oval?.$lte) {
                    out[key] = LessThanOrEqual(oval.$lte);
                    continue;
                }
                if (oval?.$like) {
                    out[key] = Like(oval.$like as string);
                    continue;
                }
            } else {
                out[key] = val;
            }
        }
        return out;
    }

    public get native(): Repository<T> {
        return this.repo;
    }

    find(filter: Filter<T>, join?: Join, select?: Select, pagination?: VexPagination): Promise<T[]> {
        const where = this.mergeFilter(filter) as FindOptionsWhere<T>;
        const options: FindManyOptions<T> = {
            select: select as any,
            where,
            relations: join,
            take: 500,
        };
        if (pagination) {
            const page = pagination.page || 1;
            const perPage = Math.min(pagination.perPage || 20, 9999);
            options.take = Math.min(perPage, 9999);
            options.skip = (page - 1) * perPage;
            if (pagination.sort) options.order = pagination.sort as any;
        }
        return this.repo.find(options);
    }

    async count(filter: Filter<T>): Promise<number> {
        const where = this.mergeFilter(filter) as FindOptionsWhere<T>;
        return this.repo.count({ where });
    }

    findOne(filter: Filter<T>, join?: Join, select?: Select): Promise<T | null> {
        const where = this.mergeFilter(filter) as FindOptionsWhere<T>;
        return this.repo.findOne({
            select,
            where,
            relations: join
        });
    }

    findOneWhere(filter: Filter<T>, join?: Join, select?: Select): Promise<T | null> {
        const where = this.mergeFilter(filter) as FindOptionsWhere<T>;
        return this.repo.findOne({
            select,
            where,
            relations: join
        });
    }

    async create(data: Partial<T>): Promise<T> {
        const enriched = { ...data };
        this.stripIsolationFields(enriched);
        this.stampIsolationFields(enriched);
        this.applyVexFields(enriched, "create");
        return this.repo.save(this.repo.create(enriched as DeepPartial<T>));
    }

    async replace(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.replace called without id — refuse replace entity");
            return null;
        }
        const enriched = { ...data };
        this.stripIsolationFields(enriched);
        this.applyVexFields(enriched, "update");
        const existing = await this.findOne({ _id: id } as unknown as Filter<T>);
        if (!existing) return null;
        return this.repo.save(this.repo.merge(existing, enriched as DeepPartial<T>));
    }

    async update(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.update called without id — refuse update entity");
            return null;
        }
        const enriched = { ...data };
        this.stripIsolationFields(enriched);
        this.applyVexFields(enriched, "update");
        const where = this.mergeFilter({ _id: id } as unknown as Filter<T>);
        await this.repo.update(where as FindOptionsWhere<T>, enriched);
        return this.findOne({ _id: id } as unknown as Filter<T>);
    }

    async delete(id: string | undefined): Promise<void> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.delete called without id — refuse delete entity");
            return;
        }
        const where = this.mergeFilter({ _id: id } as unknown as Filter<T>);
        await this.repo.delete(where as FindOptionsWhere<T>);
    }

    async deleteWhere(filter: Record<string, unknown>): Promise<void> {
        const where = this.mergeFilter(filter as unknown as Filter<T>);
        await this.repo.delete(where as FindOptionsWhere<T>);
    }

    /**
     * Tombstone the row: run the normal update-phase field machinery (so `updatedAt` /
     * `updatedBy` record who deleted it and when), then write the marker plus any redaction
     * the caller merged in.
     */
    async softDelete(id: string | undefined, data?: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.softDelete called without id — refuse update entity");
            return null;
        }

        const field = entitySoftDeleteFields[this.getEntityName()];
        if (!field) {
            utils.log.error(
                `TypeOrmRepositoryAdapter.softDelete on ${this.getEntityName()} — entity declares no ` +
                `x-vexData "softDelete" field, refuse update entity`
            );
            return null;
        }

        const enriched = { ...(data ?? {}) } as Record<string, unknown>;
        this.applyVexFields(enriched as Partial<T>, "update");
        enriched[field] = true;

        const where = this.mergeFilter({ _id: id } as unknown as Filter<T>);
        // the generic ObjectLiteral constraint makes TypeORM's own _QueryDeepPartialEntity
        // unresolvable here; `update` already accepts the same shape on the ordinary path
        await this.repo.update(where as FindOptionsWhere<T>, enriched as never);
        return this.repo.findOne({
            where: { _id: id } as unknown as T
        });
    }

    /**
     * Read a row that may be soft-deleted: skips the soft-delete term only, so the ownership
     * filter still applies. Framework-internal — see VexRepository.
     */
    findOneWithDeleted(filter: Filter<T>, join?: Join, select?: Select): Promise<T | null> {
        const where = this.mergeFilter(filter, { includeSoftDeleted: true }) as FindOptionsWhere<T>;
        return this.repo.findOne({
            select,
            where,
            relations: join
        });
    }
}
