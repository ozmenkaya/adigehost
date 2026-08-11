import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Satılabilir ürün/paket.
 *
 * - `hosting`: WHM/cPanel paketi — admin hangi whmPackage'ın satılacağına karar verir.
 * - `vps`: Hetzner sunucu (fiyat yapılandırıcıda hesaplanır).
 * - `website`: web sitesi yapım paketi — `setupFee` tek seferlik tasarım/kurulum bedeli,
 *   `priceMonthly` ise hosting + bakım + destek aboneliği (düzenli gelir kalemi).
 *   Otomatik provizyon yoktur; teslim admin tarafından elle yapılır.
 */
export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<string>;
  declare name: string; // müşteriye gösterilen ad ("Başlangıç Hosting")
  /**
   * Katalog/vitrin tipi. Provizyon tipi DEĞİLDİR — `Service.type` ayrı bir
   * alandır. 'email' paketleri cPanel hesabı olarak açıldığı için servis
   * tarafında 'hosting'e eşlenir (bkz. routes/services.ts).
   */
  declare type: CreationOptional<'hosting' | 'vps' | 'website' | 'email'>;
  declare categoryId: CreationOptional<string | null>; // ait olduğu kategori (null = kategorisiz)
  declare whmPackage: CreationOptional<string | null>; // WHM paket adı
  declare serverId: CreationOptional<string | null>; // tercih edilen sunucu (null = otomatik)
  declare priceMonthly: number;
  declare priceAnnually: CreationOptional<number | null>;
  declare setupFee: CreationOptional<number>;
  declare specs: CreationOptional<Record<string, unknown> | null>; // disk, bw vb.
  declare description: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>; // satılabilir mi
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Product.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    type: {
      type: DataTypes.ENUM('hosting', 'vps', 'website', 'email'),
      allowNull: false,
      defaultValue: 'hosting',
    },
    categoryId: { type: DataTypes.UUID, allowNull: true },
    whmPackage: { type: DataTypes.STRING(120), allowNull: true },
    serverId: { type: DataTypes.UUID, allowNull: true },
    priceMonthly: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    priceAnnually: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    setupFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    specs: { type: DataTypes.JSON, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'products',
    indexes: [{ fields: ['is_active'] }, { fields: ['type'] }, { fields: ['category_id'] }],
  },
);
