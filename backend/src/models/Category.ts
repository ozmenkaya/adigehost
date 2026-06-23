import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Ürün/paket kategorisi.
 * Admin, ürünleri kategorilere ayırır; her kategori satış sayfasında
 * ayrı bir bölüm (başlık + açıklama) olarak gösterilir.
 */
export class Category extends Model<
  InferAttributes<Category>,
  InferCreationAttributes<Category>
> {
  declare id: CreationOptional<string>;
  declare name: string; // müşteriye gösterilen başlık ("Linux Hosting")
  declare slug: string; // URL/anahtar dostu benzersiz ad
  declare description: CreationOptional<string | null>; // bölüm alt başlığı
  declare isActive: CreationOptional<boolean>; // satış sayfasında görünsün mü
  declare sortOrder: CreationOptional<number>; // bölüm sırası
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Category.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'categories',
    indexes: [{ fields: ['is_active'] }, { fields: ['sort_order'] }],
  },
);
