import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function zodErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Geçersiz istek", details: err.flatten() });
    return;
  }
  next(err);
}
