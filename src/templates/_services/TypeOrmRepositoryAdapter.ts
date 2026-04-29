// {{headerComment}}
import { Repository, ObjectLiteral, FindOptionsWhere, DeepPartial } from "typeorm";
import { IVexRepository } from "../_types/IVexRepository.gen";
import { Select, Filter, Join } from "../_types/VexRequest.gen";
import utils from "../_utils";

export class TypeOrmRepositoryAdapter<T extends ObjectLiteral> implements IVexRepository<T> {
    constructor(private repo: Repository<T>) {}

    public get native(): Repository<T> {
        return this.repo;
    }

    find(filter: Filter, join?: Join, select?: Select): Promise<T[]> {
        return this.repo.find({ 
            select, 
            where: filter as FindOptionsWhere<T>, 
            relations: join 
        });
    }

    findOne(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        return this.repo.findOne({ 
            select, 
            where: filter as FindOptionsWhere<T>, 
            relations: join 
        });
    }

    findOneWhere(filter: Filter, join?: Join, select?: Select): Promise<T | null> {
        return this.repo.findOne({ 
            select,
            where: filter as FindOptionsWhere<T>,
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
        const existing = await this.findOne({ _id: id });
        if (!existing) return null;
        return this.repo.save(this.repo.merge(existing, data as DeepPartial<T>));
    }

    async update(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if (!id) {
            utils.log.error("TypeOrmRepositoryAdapter.update called without id — refuse update entity");
            return null;
        }
        await this.repo.update({ _id: id } as unknown as FindOptionsWhere<T>, data as any);
        return this.findOne({ _id: id });
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
