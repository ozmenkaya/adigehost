import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../models/User";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errors";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import { env } from "../config/env";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function issueSession(res: import("express").Response, userId: number) {
  const token = jwt.sign({ sub: userId }, env.jwt.secret, { expiresIn: env.jwt.expiresIn as jwt.SignOptions["expiresIn"] });
  res.cookie("token", token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);

    const existing = await User.findOne({ where: { email: body.email } });
    if (existing) throw new ApiError(409, "Bu e-posta zaten kayıtlı");

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await User.create({ name: body.name, email: body.email, passwordHash });

    issueSession(res, user.id);
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    const user = await User.findOne({ where: { email: body.email } });
    if (!user) throw new ApiError(401, "E-posta veya şifre hatalı");

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new ApiError(401, "E-posta veya şifre hatalı");

    issueSession(res, user.id);
    res.json({ id: user.id, name: user.name, email: user.email });
  }),
);

router.post("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.status(204).end();
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await User.findByPk(req.userId, { attributes: { exclude: ["passwordHash"] } });
    if (!user) throw new ApiError(401, "Oturum geçersiz");
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  }),
);

export default router;
