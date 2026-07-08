// {{headerComment}}
import { Repository, ObjectLiteral, FindOptionsWhere, DeepPartial, In, Not, Like, MoreThan, LessThan, MoreThanOrEqual, LessThanOrEqual, FindManyOptions } from "typeorm";
import { VexRepository, Select, Filter, Join, FieldOperators, VexPagination } from "../_types/vex";
import DataIsolationContext from "../_middlewares/DataIsolationContext.gen";
import { entityIsolation } from "../_middlewares/DataIsolationRegistry.gen";
import utils from "../_utils";

export class TypeOrmRepositoryAdapter<T extends ObjectLiteral> implements VexRepository<T> {
    constructor(private repo: Repository<T>) {}

    /** Build ownership filter from current request context, or null. */
    private getOwnershipFilter(): Record<string, unknown> | null {
        const store = DataIsolationContext.getStore();
        if (!store?.userId) return null;

        const entityName = this.repo.metadata.target instanceof Function
            ? this.repo.metadata.target.name
            : "";
        const config = entityIsolation[entityName];
        if (!config) return null;

        return { [config.field]: store.userId };
    }

    /** Merge caller filter with ownership filter. Ownership always wins. */
    private mergeFilter(callerFilter: Filter<T>): Record<string, unknown> | Array<Record<string, unknown>> {
        const mapped = this.mapOperators(callerFilter);
        const ownership = this.getOwnershipFilter();

        if (mapped instanceof Array) {
            return mapped.map(branch => ({ ...branch, ...ownership }));
        } 
        else {
            return { ...mapped, ...ownership };
        }
    }

    private mapOperators(filter: Filter<T>): Record<string, unknown> | Array<Record<string, unknown>> {
        if (!filter || typeof filter !== "object") return {};
        // if (Array.isArray(filter)) return filter.map(f => this.mapOperators(f));

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
                // if (val?.$raw) {
                //     out[key] = Raw(val.$raw as string);
                //     continue;
                // }
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
        const store = DataIsolationContext.getStore();
        if (store?.userId) {
            const entityName = this.repo.metadata.target instanceof Function
                ? this.repo.metadata.target.name
                : "";
            const config = entityIsolation[entityName];
            if (config && config.field !== "_id") {
                (enriched as any)[config.field] = store.userId;
            }
        }
        return this.repo.save(this.repo.create(enriched as DeepPartial<T>));
    }

    async replace(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.replace called without id — refuse replace entity");
            return null;
        }
        const existing = await this.findOne({ _id: id } as unknown as Filter<T>);
        if (!existing) return null;
        return this.repo.save(this.repo.merge(existing, data as DeepPartial<T>));
    }

    async update(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.update called without id — refuse update entity");
            return null;
        }
        const where = this.mergeFilter({ _id: id } as unknown as Filter<T>);
        await this.repo.update(where as FindOptionsWhere<T>, data);
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
}
