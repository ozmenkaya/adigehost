import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./errors";
import { User } from "../models/User";
import { asyncHandler } from "./asyncHandler";

export interface AuthedRequest extends Request {
  userId?: number;
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) throw new ApiError(401, "Oturum bulunamadı");
  try {
    const payload = jwt.verify(token, env.jwt.secret) as unknown as { sub: number };
    req.userId = payload.sub;
    next();
  } catch {
    throw new ApiError(401, "Oturum geçersiz");
  }
}

export const requireAdmin = asyncHandler(async (req: AuthedRequest, _res, next) => {
  const user = await User.findByPk(req.userId);
  if (!user || user.role !== "admin") throw new ApiError(403, "Bu işlem için yönetici yetkisi gerekli");
  next();
});
