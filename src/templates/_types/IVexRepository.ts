// {{headerComment}}

import { Select, Filter, Join } from "./VexRequest.gen";

/**
 * DB-agnostic repository interface.
 * Controllers and services talk only to this — the adapter layer (TypeORM/Mongoose) absorbs DB specifics.
 */
export interface IVexRepository<T> {
    find(filter: Filter, join?: Join, select?: Select): Promise<T[]>;
    findOne(filter: Filter, join?: Join, select?: Select): Promise<T | null>;
    findOneWhere(filter: Filter, join?: Join, select?: Select): Promise<T | null>;
    create(data: Partial<T>): Promise<T>;
    replace(id: string | undefined, data: Partial<T>): Promise<T | null>;
    update(id: string | undefined, data: Partial<T>): Promise<T | null>;
    delete(id: string | undefined): Promise<void>;
    deleteWhere(filter: Filter): Promise<void>;
}
