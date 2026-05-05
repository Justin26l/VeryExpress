// {{headerComment}}
import { Model, Document } from "mongoose";
import { VexRepository, Select, Filter, Join } from "../_types/vex";
import utils from "../_utils";

export class MongooseRepositoryAdapter<T extends Document> implements VexRepository<T> {
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

    replace(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.replace called without id — refuse replace document");
            return Promise.resolve(null);
        }
        return this.model.findByIdAndUpdate(id, data, { new: true, overwrite: true }).exec();
    }

    update(id: string | undefined, data: Partial<T>): Promise<T | null> {
        if(!id) {
            utils.log.error("MongooseRepositoryAdapter.update called without id — refuse update document");
            return Promise.resolve(null);
        }
        return this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
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
