import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/** KVKK/BTK uyumlu denetim kaydı (2 yıl saklanır). */
export class ActivityLog extends Model<
  InferAttributes<ActivityLog>,
  InferCreationAttributes<ActivityLog>
> {
  declare id: CreationOptional<string>;
  declare userId: CreationOptional<string | null>;
  declare action: string;
  declare resource: CreationOptional<string | null>;
  declare resourceId: CreationOptional<string | null>;
  declare details: CreationOptional<Record<string, unknown> | null>;
  declare ip: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

ActivityLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(100), allowNull: false },
    resource: { type: DataTypes.STRING(50), allowNull: true },
    resourceId: { type: DataTypes.STRING(50), allowNull: true },
    details: { type: DataTypes.JSON, allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'activity_logs',
    updatedAt: false,
    indexes: [{ fields: ['user_id'] }, { fields: ['action'] }, { fields: ['created_at'] }],
  },
);
