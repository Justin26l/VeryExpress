// {{headerComment}}
import { Model, Document } from "mongoose";
import { IVexRepository } from "../_types/IVexRepository.gen";
import { Select, Filter, Join } from "../_types/VexRequest.gen";

export class MongooseRepositoryAdapter<T extends Document> implements IVexRepository<T> {
    constructor(private model: Model<T>) {}

    public get native(): Model<T> {
        return this.model;
    }

    find(filter: Filter, join?: Join, select?: Select): Promise<T[]> {
        // TODO: complete mongoose support, handle join and select
        return this.model.find((filter || {}) as any).exec();
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
        const doc = new this.model(data);
        return doc.save();
    }

    replace(id: string | number, data: Partial<T>): Promise<T | null> {
        return this.model.findByIdAndUpdate(id, data, { new: true, overwrite: true }).exec();
    }

    update(id: string | number, data: Partial<T>): Promise<T | null> {
        return this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    }

    async delete(id: string | number): Promise<void> {
        await this.model.findByIdAndDelete(id).exec();
    }

    async deleteWhere(filter: Record<string, unknown>): Promise<void> {
        await this.model.deleteOne(filter as FilterQuery<T>).exec();
    }
}
