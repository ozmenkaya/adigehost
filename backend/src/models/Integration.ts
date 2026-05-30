import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type IntegrationStatus = 'unknown' | 'connected' | 'error';

/**
 * Harici servis sağlayıcı bağlantısı (Hetzner, DomainNameAPI, İyzico, EDM, SMTP, ...).
 * Aynı sağlayıcıdan birden fazla bağlantı tanımlanabilir; biri varsayılan (isDefault) olur.
 * `credentials` tüm alanların AES-256-GCM ile şifrelenmiş JSON halidir.
 */
export class Integration extends Model<
  InferAttributes<Integration>,
  InferCreationAttributes<Integration>
> {
  declare id: CreationOptional<string>;
  declare provider: string; // 'hetzner' | 'domainnameapi' | 'iyzico' | 'edm' | 'smtp' | 'anthropic'
  declare name: string; // etiket ("Hetzner Ana Hesap")
  declare credentials: string; // şifreli JSON
  declare isActive: CreationOptional<boolean>;
  declare isDefault: CreationOptional<boolean>;
  declare status: CreationOptional<IntegrationStatus>;
  declare lastChecked: CreationOptional<Date | null>;
  declare lastError: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Integration.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    credentials: { type: DataTypes.TEXT, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: {
      type: DataTypes.ENUM('unknown', 'connected', 'error'),
      allowNull: false,
      defaultValue: 'unknown',
    },
    lastChecked: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'integrations',
    indexes: [{ fields: ['provider'] }, { fields: ['is_default'] }],
  },
);
