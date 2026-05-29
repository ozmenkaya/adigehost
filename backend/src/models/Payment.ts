import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

/** İyzico kart token/userKey alanları AES-256-GCM ile şifreli saklanır. */
export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare invoiceId: CreationOptional<string | null>;
  declare amount: number;
  declare status: CreationOptional<PaymentStatus>;
  declare iyzicoPaymentId: CreationOptional<string | null>;
  declare iyzicoCardToken: CreationOptional<string | null>; // şifreli
  declare iyzicoCardUserKey: CreationOptional<string | null>; // şifreli
  declare payment3d: CreationOptional<boolean>;
  declare errorMessage: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Payment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    invoiceId: { type: DataTypes.UUID, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'success', 'failed', 'refunded'),
      defaultValue: 'pending',
    },
    iyzicoPaymentId: { type: DataTypes.STRING(100), allowNull: true },
    iyzicoCardToken: { type: DataTypes.STRING(512), allowNull: true },
    iyzicoCardUserKey: { type: DataTypes.STRING(512), allowNull: true },
    payment3d: { type: DataTypes.BOOLEAN, defaultValue: false },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'payments',
    indexes: [{ fields: ['user_id'] }, { fields: ['invoice_id'] }, { fields: ['status'] }],
  },
);

/** Kayıtlı kartlar — yalnızca İyzico token saklanır, PAN/CVV asla. */
export class SavedCard extends Model<
  InferAttributes<SavedCard>,
  InferCreationAttributes<SavedCard>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare cardAlias: CreationOptional<string | null>;
  declare cardLast4: CreationOptional<string | null>;
  declare cardBrand: CreationOptional<string | null>;
  declare cardToken: string; // şifreli
  declare cardUserKey: string; // şifreli
  declare isDefault: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SavedCard.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    cardAlias: { type: DataTypes.STRING(50), allowNull: true },
    cardLast4: { type: DataTypes.STRING(4), allowNull: true },
    cardBrand: { type: DataTypes.STRING(20), allowNull: true },
    cardToken: { type: DataTypes.STRING(512), allowNull: false },
    cardUserKey: { type: DataTypes.STRING(512), allowNull: false },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'saved_cards', indexes: [{ fields: ['user_id'] }] },
);
