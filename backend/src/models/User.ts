import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

export type UserRole = 'admin' | 'client';
export type UserStatus = 'active' | 'suspended' | 'pending';
export type IdentityType = 'individual' | 'corporate';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare password: string;
  declare phone: CreationOptional<string | null>;
  declare company: CreationOptional<string | null>;
  declare address: CreationOptional<string | null>;
  declare city: CreationOptional<string | null>;
  declare district: CreationOptional<string | null>; // ilçe
  declare postalCode: CreationOptional<string | null>;
  declare country: CreationOptional<string | null>;
  declare identityType: CreationOptional<IdentityType>; // bireysel / kurumsal
  declare taxNumber: CreationOptional<string | null>; // VKN (kurumsal) / TCKN (bireysel)
  declare taxOffice: CreationOptional<string | null>; // vergi dairesi (kurumsal)
  declare role: CreationOptional<UserRole>;
  declare status: CreationOptional<UserStatus>;
  declare emailVerified: CreationOptional<boolean>;
  declare credit: CreationOptional<number>;
  declare resetToken: CreationOptional<string | null>;
  declare resetExpires: CreationOptional<Date | null>;
  declare lastLogin: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: { type: DataTypes.STRING(255), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    company: { type: DataTypes.STRING(150), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    district: { type: DataTypes.STRING(100), allowNull: true },
    postalCode: { type: DataTypes.STRING(20), allowNull: true },
    country: { type: DataTypes.STRING(100), allowNull: true, defaultValue: 'Türkiye' },
    identityType: {
      type: DataTypes.ENUM('individual', 'corporate'),
      allowNull: false,
      defaultValue: 'individual',
    },
    taxNumber: { type: DataTypes.STRING(20), allowNull: true },
    taxOffice: { type: DataTypes.STRING(100), allowNull: true },
    role: { type: DataTypes.ENUM('admin', 'client'), allowNull: false, defaultValue: 'client' },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'pending'),
      allowNull: false,
      defaultValue: 'pending',
    },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    credit: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    resetToken: { type: DataTypes.STRING(255), allowNull: true },
    resetExpires: { type: DataTypes.DATE, allowNull: true },
    lastLogin: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
    indexes: [{ fields: ['email'] }, { fields: ['role'] }, { fields: ['status'] }],
    defaultScope: { attributes: { exclude: ['password', 'resetToken', 'resetExpires'] } },
    scopes: { withSecret: { attributes: { include: ['password'] } } },
  },
);
