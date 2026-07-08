// {{headerComment}}
import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";

export interface DataIsolationStore {
  userId: string;
}

const als = new AsyncLocalStorage<DataIsolationStore>();

class DataIsolationContext {
    /**
   * Express middleware — creates ALS context with authenticated user's _id.
   * Must run AFTER Authentication.middleware (which sets req.user).
   */
    middleware(req: Request, _res: Response, next: NextFunction): void {
        const user = (req as any).user;
        if (user?._id) {
            als.run({ userId: user._id }, () => next());
        } else {
            next();
        }
    }

    /** Get current store from per-request ALS context. */
    getStore(): DataIsolationStore | undefined {
        return als.getStore();
    }
}

export default new DataIsolationContext();
