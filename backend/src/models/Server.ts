import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type ServerStatus = 'active' | 'maintenance' | 'full' | 'offline';

/** Çok-sunucu yönetimi. whm_token AES-256-GCM ile şifreli saklanır. */
export class Server extends Model<InferAttributes<Server>, InferCreationAttributes<Server>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare type: 'dedicated' | 'vps';
  declare provider: 'hetzner_dedicated' | 'hetzner_cloud';
  declare hetznerId: CreationOptional<number | null>;
  declare ipAddress: CreationOptional<string | null>;
  declare location: CreationOptional<string | null>;
  declare purpose: CreationOptional<'hosting' | 'vps' | 'mixed'>;
  declare whmHost: CreationOptional<string | null>;
  declare whmPort: CreationOptional<number>;
  declare whmUser: CreationOptional<string>;
  declare whmToken: CreationOptional<string | null>; // şifreli
  declare diskTotal: CreationOptional<number>;
  declare diskUsed: CreationOptional<number>;
  declare diskThreshold: CreationOptional<number>;
  declare accountLimit: CreationOptional<number>;
  declare accountCount: CreationOptional<number>;
  declare bandwidthLimit: CreationOptional<number>;
  declare status: CreationOptional<ServerStatus>;
  declare isDefault: CreationOptional<boolean>;
  declare acceptsNew: CreationOptional<boolean>;
  declare lastSync: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Server.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    type: { type: DataTypes.ENUM('dedicated', 'vps'), allowNull: false },
    provider: { type: DataTypes.ENUM('hetzner_dedicated', 'hetzner_cloud'), allowNull: false },
    hetznerId: { type: DataTypes.INTEGER, allowNull: true },
    ipAddress: { type: DataTypes.STRING(45), allowNull: true },
    location: { type: DataTypes.STRING(10), allowNull: true },
    purpose: { type: DataTypes.ENUM('hosting', 'vps', 'mixed'), defaultValue: 'mixed' },
    whmHost: { type: DataTypes.STRING(255), allowNull: true },
    whmPort: { type: DataTypes.INTEGER, defaultValue: 2087 },
    whmUser: { type: DataTypes.STRING(100), defaultValue: 'root' },
    whmToken: { type: DataTypes.STRING(512), allowNull: true },
    diskTotal: { type: DataTypes.BIGINT, defaultValue: 0 },
    diskUsed: { type: DataTypes.BIGINT, defaultValue: 0 },
    diskThreshold: { type: DataTypes.INTEGER, defaultValue: 80 },
    accountLimit: { type: DataTypes.INTEGER, defaultValue: 0 },
    accountCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    bandwidthLimit: { type: DataTypes.BIGINT, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('active', 'maintenance', 'full', 'offline'),
      defaultValue: 'active',
    },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
    acceptsNew: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastSync: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'servers', indexes: [{ fields: ['status'] }, { fields: ['purpose'] }] },
);
