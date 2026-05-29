import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type ServiceType = 'vps' | 'hosting' | 'domain';
export type ServiceStatus = 'pending' | 'active' | 'suspended' | 'cancelled' | 'terminated';
export type BillingCycle = 'monthly' | 'quarterly' | 'annually';

export class Service extends Model<InferAttributes<Service>, InferCreationAttributes<Service>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare serverId: CreationOptional<string | null>;
  declare type: ServiceType;
  declare name: string;
  declare status: CreationOptional<ServiceStatus>;
  declare hetznerId: CreationOptional<number | null>;
  declare hetznerIp: CreationOptional<string | null>;
  declare hetznerIpv6: CreationOptional<string | null>;
  declare hetznerPlan: CreationOptional<string | null>;
  declare hetznerLocation: CreationOptional<string | null>;
  declare hetznerOs: CreationOptional<string | null>;
  declare price: number;
  declare billingCycle: CreationOptional<BillingCycle>;
  declare nextDue: CreationOptional<Date | null>;
  declare domain: CreationOptional<string | null>;
  declare config: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Service.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    serverId: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM('vps', 'hosting', 'domain'), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'suspended', 'cancelled', 'terminated'),
      defaultValue: 'pending',
    },
    hetznerId: { type: DataTypes.INTEGER, allowNull: true },
    hetznerIp: { type: DataTypes.STRING(45), allowNull: true },
    hetznerIpv6: { type: DataTypes.STRING(100), allowNull: true },
    hetznerPlan: { type: DataTypes.STRING(20), allowNull: true },
    hetznerLocation: { type: DataTypes.STRING(10), allowNull: true },
    hetznerOs: { type: DataTypes.STRING(30), allowNull: true },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'annually'),
      defaultValue: 'monthly',
    },
    nextDue: { type: DataTypes.DATEONLY, allowNull: true },
    domain: { type: DataTypes.STRING(100), allowNull: true },
    config: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'services',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['server_id'] },
      { fields: ['status'] },
      { fields: ['next_due'] },
    ],
  },
);
