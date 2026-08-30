import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 5100),
  nodeEnv: process.env.NODE_ENV ?? "development",
  cookieDomain: process.env.COOKIE_DOMAIN ?? "localhost",
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    name: required("DB_NAME"),
    user: required("DB_USER"),
    pass: required("DB_PASS"),
  },
  jwt: {
    secret: required("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },
  encryptionKey: required("ENCRYPTION_KEY"),
};
