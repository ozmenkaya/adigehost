import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type ConsentType = 'service' | 'kvkk' | 'marketing' | 'international_transfer';

/** KVKK açık rıza kayıtları — değiştirilemez (audit) niteliğinde. */
export class Consent extends Model<InferAttributes<Consent>, InferCreationAttributes<Consent>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare consentType: ConsentType;
  declare accepted: boolean;
  declare ipAddress: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare version: CreationOptional<string | null>;
  declare acceptedAt: CreationOptional<Date>;
}

Consent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    consentType: {
      type: DataTypes.ENUM('service', 'kvkk', 'marketing', 'international_transfer'),
      allowNull: false,
    },
    accepted: { type: DataTypes.BOOLEAN, allowNull: false },
    ipAddress: { type: DataTypes.STRING(45), allowNull: true },
    userAgent: { type: DataTypes.TEXT, allowNull: true },
    version: { type: DataTypes.STRING(10), allowNull: true },
    acceptedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'consents',
    timestamps: false,
    indexes: [{ fields: ['user_id'] }, { fields: ['consent_type'] }],
  },
);
