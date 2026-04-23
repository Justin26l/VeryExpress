// {{headerComment}}

/**
 * DB-agnostic repository interface.
 * Controllers and services talk only to this — the adapter layer (TypeORM/Mongoose) absorbs DB specifics.
 */
export interface IVexRepository<T> {
    find(filter?: Record<string, unknown>): Promise<T[]>;
    findOne(id: string | number): Promise<T | null>;
    findOneWhere(filter: Record<string, unknown>): Promise<T | null>;
    create(data: Partial<T>): Promise<T>;
    replace(id: string | number, data: Partial<T>): Promise<T | null>;
    update(id: string | number, data: Partial<T>): Promise<T | null>;
    delete(id: string | number): Promise<void>;
    deleteWhere(filter: Record<string, unknown>): Promise<void>;
}
