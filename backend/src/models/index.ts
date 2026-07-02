import { sequelize } from '../config/database';
import { User } from './User';
import { Server } from './Server';
import { Service } from './Service';
import { Invoice, InvoiceItem } from './Invoice';
import { Payment, SavedCard } from './Payment';
import { Ticket, TicketReply } from './Ticket';
import { Domain } from './Domain';
import { Consent } from './Consent';
import { ActivityLog } from './ActivityLog';
import { Setting } from './Setting';
import { Product } from './Product';
import { Category } from './Category';
import { Integration } from './Integration';
import { SshKey } from './SshKey';

/**
 * Model ilişkileri (associations).
 * Tüm modeller import edildikten sonra burada tek yerde tanımlanır.
 */

// User -> Services / Invoices / Payments / Cards / Tickets / Domains / Consents / Logs
User.hasMany(Service, { foreignKey: 'userId', as: 'services' });
Service.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Server.hasMany(Service, { foreignKey: 'serverId', as: 'services' });
Service.belongsTo(Server, { foreignKey: 'serverId', as: 'server' });

Product.belongsTo(Server, { foreignKey: 'serverId', as: 'server' });
Service.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Category -> Products
Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

User.hasMany(Invoice, { foreignKey: 'userId', as: 'invoices' });
Invoice.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', as: 'items' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
InvoiceItem.belongsTo(Service, { foreignKey: 'serviceId', as: 'service' });

User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
Invoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments' });

User.hasMany(SavedCard, { foreignKey: 'userId', as: 'cards' });
SavedCard.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Ticket, { foreignKey: 'userId', as: 'tickets' });
Ticket.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Ticket.belongsTo(Service, { foreignKey: 'serviceId', as: 'service' });

Ticket.hasMany(TicketReply, { foreignKey: 'ticketId', as: 'replies' });
TicketReply.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' });
TicketReply.belongsTo(User, { foreignKey: 'userId', as: 'author' });

User.hasMany(Domain, { foreignKey: 'userId', as: 'domains' });
Domain.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Consent, { foreignKey: 'userId', as: 'consents' });
Consent.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(ActivityLog, { foreignKey: 'userId', as: 'logs' });
ActivityLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(SshKey, { foreignKey: 'userId', as: 'sshKeys' });
SshKey.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export {
  sequelize,
  User,
  Server,
  Service,
  Invoice,
  InvoiceItem,
  Payment,
  SavedCard,
  Ticket,
  TicketReply,
  Domain,
  Consent,
  ActivityLog,
  Setting,
  Product,
  Category,
  Integration,
  SshKey,
};

/** Tüm modellerin kaydı (migrate/sync için). */
export const models = {
  User,
  Server,
  Service,
  Invoice,
  InvoiceItem,
  Payment,
  SavedCard,
  Ticket,
  TicketReply,
  Domain,
  Consent,
  ActivityLog,
  Setting,
  Product,
  Category,
  Integration,
  SshKey,
};
