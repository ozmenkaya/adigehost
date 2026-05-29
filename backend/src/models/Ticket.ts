import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type TicketStatus = 'open' | 'answered' | 'customer_reply' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketDepartment = 'sales' | 'support' | 'billing' | 'abuse';

export class Ticket extends Model<InferAttributes<Ticket>, InferCreationAttributes<Ticket>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare serviceId: CreationOptional<string | null>;
  declare ticketNum: string;
  declare subject: string;
  declare status: CreationOptional<TicketStatus>;
  declare priority: CreationOptional<TicketPriority>;
  declare department: CreationOptional<TicketDepartment>;
  declare lastReply: CreationOptional<Date | null>;
  declare aiSuggestion: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Ticket.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    serviceId: { type: DataTypes.UUID, allowNull: true },
    ticketNum: { type: DataTypes.STRING(15), allowNull: false, unique: true },
    subject: { type: DataTypes.STRING(200), allowNull: false },
    status: {
      type: DataTypes.ENUM('open', 'answered', 'customer_reply', 'closed'),
      defaultValue: 'open',
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium',
    },
    department: {
      type: DataTypes.ENUM('sales', 'support', 'billing', 'abuse'),
      defaultValue: 'support',
    },
    lastReply: { type: DataTypes.DATE, allowNull: true },
    aiSuggestion: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'tickets',
    indexes: [{ fields: ['user_id'] }, { fields: ['status'] }, { fields: ['priority'] }],
  },
);

export class TicketReply extends Model<
  InferAttributes<TicketReply>,
  InferCreationAttributes<TicketReply>
> {
  declare id: CreationOptional<string>;
  declare ticketId: string;
  declare userId: CreationOptional<string | null>;
  declare message: string;
  declare isAdmin: CreationOptional<boolean>;
  declare isAiSuggestion: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

TicketReply.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticketId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: false },
    isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    isAiSuggestion: { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'ticket_replies', indexes: [{ fields: ['ticket_id'] }] },
);
