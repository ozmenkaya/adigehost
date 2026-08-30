import crypto from "node:crypto";

export function generateAccessToken(): string {
  return `ahai_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
