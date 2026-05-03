// {{headerComment}}
import { Repository, ObjectLiteral, FindOptionsWhere, DeepPartial, In, Not, Like, MoreThan, LessThan, MoreThanOrEqual, LessThanOrEqual, Raw } from "typeorm";
import { IVexRepository } from "../_types/IVexRepository.gen";
import { Select, Filter, Join, FieldFilter } from "../_types/VexRequest.gen";
import utils from "../_utils";

export class TypeOrmRepositoryAdapter<T extends ObjectLiteral> implements IVexRepository<T> {
    constructor(private repo: Repository<T>) {}

    private mapOperators(filter: Filter<T>): Record<string, unknown> {
        if (!filter || typeof filter !== "object") return {};
        // if (Array.isArray(filter)) return filter.map(f => this.mapOperators(f));

        const out: Record<string, unknown> = {};

        for (const [key, val] of Object.entries(filter)) {
            if (key === "$and" && Array.isArray(val)) {
                out["$and"] = val.map(v => this.mapOperators(v));
                continue;
            }
            else if (key === "$or" && Array.isArray(val)) {
                out["$or"] = val.map(v => this.mapOperators(v));
                continue;
            }
            else if (val && typeof val === "object" && !Array.isArray(val)) {
                // Common mongo-like operators supported in JSON payloads
                val as FieldFilter<T[Extract<keyof T, string>]>;

                if (val?.$in && Array.isArray(val.$in) && val.$in.every((v: unknown) => typeof v === "string")) {
                    out[key] = In(val.$in);
                    continue;
                }
                if (val?.$nin && Array.isArray(val.$nin) && val.$nin.every((v: unknown) => typeof v === "string")) {
                    out[key] = Not(In(val.$nin));

                    continue;
                }
                if (val?.$gt) {
                    out[key] = MoreThan(val.$gt);
                    continue;
                }
                if (val?.$gte) {
                    out[key] = MoreThanOrEqual(val.$gte);
                    continue;
                }
                if (val?.$lt) {
                    out[key] = LessThan(val.$lt);
                    continue;
                }
                if (val?.$lte) {
                    out[key] = LessThanOrEqual(val.$lte);
                    continue;
                }
                if (val?.$like) {
                    out[key] = Like(val.$like as string);
                    continue;
                }
                // if (val?.$raw) {
                //     out[key] = Raw(val.$raw as string);
                //     continue;
                // }
                // Recurse for nested objects
                out[key] = this.mapOperators(val);
            } else {
                out[key] = val;
            }
        }
        return out;
    }

    public get native(): Repository<T> {
        return this.repo;
    }

    find(filter: Filter<T>, join?: Join, select?: Select): Promise<T[]> {
        const where = this.mapOperators(filter) as FindOptionsWhere<T>;
        return this.repo.find({ 
            select,
            where,
            relations: join 
        });
    }

    findOne(filter: Filter<T>, join?: Join, select?: Select): Promise<T | null> {
        const where = this.mapOperators(filter) as FindOptionsWhere<T>;
        return this.repo.findOne({ 
            select, 
            where,
            relations: join 
        });
    }

    findOneWhere(filter: Filter<T>, join?: Join, select?: Select): Promise<T | null> {
        const where = this.mapOperators(filter) as FindOptionsWhere<T>;
        return this.repo.findOne({ 
            select,
            where,
            relations: join
        });
    }

    async create(data: Partial<T>): Promise<T> {
        return this.repo.save(this.repo.create(data as DeepPartial<T>));
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
        await this.repo.update({ _id: id } as unknown as FindOptionsWhere<T>, data);
        return this.findOne({ _id: id } as unknown as Filter<T>);
    }

    async delete(id: string | undefined): Promise<void> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.delete called without id — refuse delete entity");
            return;
        }
        await this.repo.delete({ _id: id } as unknown as FindOptionsWhere<T>);
    }

    async deleteWhere(filter: Record<string, unknown>): Promise<void> {
        await this.repo.delete(filter as FindOptionsWhere<T>);
    }
}
