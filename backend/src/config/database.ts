import { Sequelize } from 'sequelize';
import { env } from './env';
import { logger } from './logger';

/**
 * Merkezi Sequelize bağlantısı (MySQL 8).
 * Modeller models/index.ts içinde bu instance ile tanımlanır.
 */
export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASS, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: env.DB_LOGGING ? (msg) => logger.debug(msg) : false,
  timezone: '+00:00', // Tüm tarihler UTC saklanır
  define: {
    underscored: true, // snake_case kolon adları
    freezeTableName: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: {
    dateStrings: false,
    typeCast: true,
    decimalNumbers: true,
  },
});

/** Bağlantıyı test eder; hata olursa fırlatır. */
export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  logger.info('✅ MySQL bağlantısı kuruldu');
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
  logger.info('MySQL bağlantısı kapatıldı');
}
