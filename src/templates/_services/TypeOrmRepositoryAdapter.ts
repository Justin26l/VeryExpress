// {{headerComment}}
import { Repository, ObjectLiteral, FindOptionsWhere, DeepPartial } from "typeorm";
import { IVexRepository } from "../_types/IVexRepository.gen";

export class TypeOrmRepositoryAdapter<T extends ObjectLiteral> implements IVexRepository<T> {
    constructor(private repo: Repository<T>) {}

    public get native(): Repository<T> {
        return this.repo;
    }

    find(filter?: Record<string, unknown>): Promise<T[]> {
        return this.repo.find({ where: filter as FindOptionsWhere<T> });
    }

    findOne(id: string | number): Promise<T | null> {
        return this.repo.findOne({ where: { _id: id } as unknown as FindOptionsWhere<T> });
    }

    findOneWhere(filter: Record<string, unknown>): Promise<T | null> {
        return this.repo.findOne({ where: filter as FindOptionsWhere<T> });
    }

    async create(data: Partial<T>): Promise<T> {
        return this.repo.save(this.repo.create(data as DeepPartial<T>));
    }

    async replace(id: string | number, data: Partial<T>): Promise<T | null> {
        const existing = await this.findOne(id);
        if (!existing) return null;
        return this.repo.save(this.repo.merge(existing, data as DeepPartial<T>));
    }

    async update(id: string | number, data: Partial<T>): Promise<T | null> {
        await this.repo.update({ _id: id } as unknown as FindOptionsWhere<T>, data as any);
        return this.findOne(id);
    }

    async delete(id: string | number): Promise<void> {
        await this.repo.delete({ _id: id } as unknown as FindOptionsWhere<T>);
    }

    async deleteWhere(filter: Record<string, unknown>): Promise<void> {
        await this.repo.delete(filter as FindOptionsWhere<T>);
    }
}
