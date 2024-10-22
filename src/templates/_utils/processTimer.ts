import { Request, Response, NextFunction } from "express";

export default function processTimer(req: Request, res: Response, next: NextFunction) {
  // @ts-ignore
  res.start = Date.now(); 
  next(); 
}