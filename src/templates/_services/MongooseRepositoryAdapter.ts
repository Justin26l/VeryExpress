// {{headerComment}}
import { Model, Document, FilterQuery } from "mongoose";
import { IVexRepository } from "../_types/IVexRepository.gen";

export class MongooseRepositoryAdapter<T extends Document> implements IVexRepository<T> {
    constructor(private model: Model<T>) {}

    public get native(): Model<T> {
        return this.model;
    }

    find(filter?: Record<string, unknown>): Promise<T[]> {
        return this.model.find((filter || {}) as FilterQuery<T>).exec();
    }

    findOne(id: string | number): Promise<T | null> {
        return this.model.findById(id).exec();
    }

    findOneWhere(filter: Record<string, unknown>): Promise<T | null> {
        return this.model.findOne(filter as FilterQuery<T>).exec();
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
