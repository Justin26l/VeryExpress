import { Request, Response, NextFunction } from "express";

export default function processTimer(req: Request, res: Response, next: NextFunction) {
    res.locals.startAt = Date.now(); 
    next(); 
}