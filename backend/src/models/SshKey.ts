import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/** Müşteri SSH public anahtarları — VPS oluştururken/rebuild'de kullanılır. */
export class SshKey extends Model<InferAttributes<SshKey>, InferCreationAttributes<SshKey>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare name: string;
  declare publicKey: string;
  declare fingerprint: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

SshKey.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    publicKey: { type: DataTypes.TEXT, allowNull: false },
    fingerprint: { type: DataTypes.STRING(100), allowNull: true },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'ssh_keys',
    timestamps: false,
    indexes: [{ fields: ['user_id'] }],
  },
);
