import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type DomainStatus = 'active' | 'expired' | 'pending' | 'transferred';

export class Domain extends Model<InferAttributes<Domain>, InferCreationAttributes<Domain>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare name: string;
  declare tld: CreationOptional<string | null>;
  declare status: CreationOptional<DomainStatus>;
  declare expiresAt: CreationOptional<Date | null>;
  declare autoRenew: CreationOptional<boolean>;
  declare nameservers: CreationOptional<string[] | null>;
  declare registrar: CreationOptional<string | null>;
  declare price: CreationOptional<number | null>;
  declare domainnameapiId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Domain.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(253), allowNull: false, unique: true },
    tld: { type: DataTypes.STRING(20), allowNull: true },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'pending', 'transferred'),
      defaultValue: 'pending',
    },
    expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
    autoRenew: { type: DataTypes.BOOLEAN, defaultValue: true },
    nameservers: { type: DataTypes.JSON, allowNull: true },
    registrar: { type: DataTypes.STRING(50), allowNull: true },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    domainnameapiId: { type: DataTypes.STRING(100), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'domains',
    indexes: [{ fields: ['user_id'] }, { fields: ['status'] }, { fields: ['expires_at'] }],
  },
);
