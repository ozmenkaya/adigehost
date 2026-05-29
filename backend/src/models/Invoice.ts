import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'overdue' | 'cancelled';

export class Invoice extends Model<InferAttributes<Invoice>, InferCreationAttributes<Invoice>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare invoiceNum: string;
  declare status: CreationOptional<InvoiceStatus>;
  declare subtotal: number;
  declare tax: number;
  declare total: number;
  declare dueDate: Date;
  declare paidAt: CreationOptional<Date | null>;
  declare paymentMethod: CreationOptional<string | null>;
  declare iyzicoPaymentId: CreationOptional<string | null>;
  declare edmInvoiceId: CreationOptional<string | null>;
  declare edmInvoiceUuid: CreationOptional<string | null>;
  declare edmType: CreationOptional<'efatura' | 'earsiv' | null>;
  declare notes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Invoice.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    invoiceNum: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('draft', 'unpaid', 'paid', 'overdue', 'cancelled'),
      defaultValue: 'unpaid',
    },
    subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    paymentMethod: { type: DataTypes.STRING(30), allowNull: true },
    iyzicoPaymentId: { type: DataTypes.STRING(100), allowNull: true },
    edmInvoiceId: { type: DataTypes.STRING(100), allowNull: true },
    edmInvoiceUuid: { type: DataTypes.STRING(100), allowNull: true },
    edmType: { type: DataTypes.ENUM('efatura', 'earsiv'), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'invoices',
    indexes: [{ fields: ['user_id'] }, { fields: ['status'] }, { fields: ['invoice_num'] }],
  },
);

export class InvoiceItem extends Model<
  InferAttributes<InvoiceItem>,
  InferCreationAttributes<InvoiceItem>
> {
  declare id: CreationOptional<string>;
  declare invoiceId: string;
  declare serviceId: CreationOptional<string | null>;
  declare description: string;
  declare quantity: CreationOptional<number>;
  declare unitPrice: number;
  declare total: number;
}

InvoiceItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    invoiceId: { type: DataTypes.UUID, allowNull: false },
    serviceId: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.STRING(255), allowNull: false },
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  },
  {
    sequelize,
    tableName: 'invoice_items',
    timestamps: false,
    indexes: [{ fields: ['invoice_id'] }],
  },
);
