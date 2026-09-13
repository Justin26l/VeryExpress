// {{headerComment}}
import { AsyncLocalStorage } from "async_hooks";
import { Request, Response, NextFunction } from "express";

export interface DataIsolationStore {
  userId: string;
}

const als = new AsyncLocalStorage<DataIsolationStore>();

class DataIsolationContext {
    /**
   * Express middleware — creates ALS context with the authenticated user's identity value.
   * Must run AFTER Authentication.middleware (which sets req.user).
   *
   * The identity is the `vexUserId` token claim, which the auth service fills from the field
   * tagged `x-vexData: "userId"` in the schemas. `_id` is the fallback for tokens issued
   * before that claim existed.
   */
    middleware(req: Request, _res: Response, next: NextFunction): void {
        const user = (req as Request & { user?: { vexUserId?: string, _id?: string } }).user;
        const userId = user?.vexUserId ?? user?._id;

        if (userId) {
            als.run({ userId }, () => next());
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
