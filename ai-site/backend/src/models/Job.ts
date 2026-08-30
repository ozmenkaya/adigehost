import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";
import { Resource } from "./Resource";
import { Reservation } from "./Reservation";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobKind = "chat" | "image";

export class Job extends Model<InferAttributes<Job>, InferCreationAttributes<Job>> {
  declare id: CreationOptional<number>;
  declare resourceId: number;
  declare reservationId: number;
  declare kind: CreationOptional<JobKind>;
  declare model: string;
  declare status: CreationOptional<JobStatus>;
  declare payload: Record<string, unknown>;
  declare result: Record<string, unknown> | null;
  declare errorMessage: string | null;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Job.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    resourceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: "resource_id" },
    reservationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: "reservation_id" },
    kind: { type: DataTypes.ENUM("chat", "image"), allowNull: false, defaultValue: "chat" },
    model: { type: DataTypes.STRING(120), allowNull: false },
    status: {
      type: DataTypes.ENUM("queued", "running", "completed", "failed", "cancelled"),
      allowNull: false,
      defaultValue: "queued",
    },
    payload: { type: DataTypes.JSON, allowNull: false },
    result: { type: DataTypes.JSON, allowNull: true },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: "error_message" },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: "started_at" },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
  },
  {
    sequelize,
    tableName: "jobs",
    timestamps: true,
  },
);

Resource.hasMany(Job, { foreignKey: "resourceId" });
Job.belongsTo(Resource, { foreignKey: "resourceId" });
Reservation.hasMany(Job, { foreignKey: "reservationId" });
Job.belongsTo(Reservation, { foreignKey: "reservationId" });
