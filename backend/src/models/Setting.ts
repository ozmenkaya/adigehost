import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type SettingType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Sistem ayarları (anahtar-değer). Hassas değerler (api key vb.)
 * uygulama katmanında AES-256-GCM ile şifrelenip saklanır.
 */
export class Setting extends Model<InferAttributes<Setting>, InferCreationAttributes<Setting>> {
  declare key: string;
  declare value: CreationOptional<string | null>;
  declare type: CreationOptional<SettingType>;
  declare group: CreationOptional<string | null>;
  declare isEncrypted: CreationOptional<boolean>;
}

Setting.init(
  {
    key: { type: DataTypes.STRING(100), primaryKey: true },
    value: { type: DataTypes.TEXT, allowNull: true },
    type: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
      defaultValue: 'string',
    },
    group: { type: DataTypes.STRING(50), allowNull: true },
    isEncrypted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, tableName: 'settings', timestamps: false, indexes: [{ fields: ['group'] }] },
);
