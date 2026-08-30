import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";
import { Resource } from "./Resource";
import { User } from "./User";

export type ReservationStatus = "scheduled" | "active" | "completed" | "cancelled";

export class Reservation extends Model<InferAttributes<Reservation>, InferCreationAttributes<Reservation>> {
  declare id: CreationOptional<number>;
  declare resourceId: number | null;
  declare userId: number;
  declare startsAt: Date;
  declare endsAt: Date;
  declare status: CreationOptional<ReservationStatus>;
  declare notes: string | null;
  declare label: string | null;
  declare accessTokenHash: string | null;
  declare quotaTokens: CreationOptional<number>;
  declare tokensUsed: CreationOptional<number>;
  declare allowedModels: string[] | null;
  declare daysOfWeek: number[] | null;
  declare timeStart: string | null;
  declare timeEnd: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Reservation.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    resourceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: "resource_id" },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: "user_id" },
    startsAt: { type: DataTypes.DATE, allowNull: false, field: "starts_at" },
    endsAt: { type: DataTypes.DATE, allowNull: false, field: "ends_at" },
    status: {
      type: DataTypes.ENUM("scheduled", "active", "completed", "cancelled"),
      allowNull: false,
      defaultValue: "scheduled",
    },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    label: { type: DataTypes.STRING(120), allowNull: true },
    accessTokenHash: { type: DataTypes.STRING(64), allowNull: true, field: "access_token_hash" },
    quotaTokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 200000, field: "quota_tokens" },
    tokensUsed: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: "tokens_used" },
    // null = tüm modellere erişim
    allowedModels: { type: DataTypes.JSON, allowNull: true, field: "allowed_models" },
    // null = haftanın her günü; aksi halde 0=Pazar..6=Cumartesi
    daysOfWeek: { type: DataTypes.JSON, allowNull: true, field: "days_of_week" },
    // "HH:MM" (Türkiye saati), ikisi de null = gün boyu
    timeStart: { type: DataTypes.STRING(5), allowNull: true, field: "time_start" },
    timeEnd: { type: DataTypes.STRING(5), allowNull: true, field: "time_end" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
  },
  {
    sequelize,
    tableName: "reservations",
    timestamps: true,
  },
);

Resource.hasMany(Reservation, { foreignKey: "resourceId" });
Reservation.belongsTo(Resource, { foreignKey: "resourceId" });
User.hasMany(Reservation, { foreignKey: "userId" });
Reservation.belongsTo(User, { foreignKey: "userId" });
