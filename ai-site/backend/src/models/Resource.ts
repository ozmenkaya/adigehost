import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";

export type ResourceType = "llm_api" | "compute";
export type ResourceStatus = "active" | "inactive";

export class Resource extends Model<InferAttributes<Resource>, InferCreationAttributes<Resource>> {
  declare id: CreationOptional<number>;
  declare type: ResourceType;
  declare name: string;
  declare provider: string | null;
  declare status: CreationOptional<ResourceStatus>;
  declare meta: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Resource.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.ENUM("llm_api", "compute"), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    provider: { type: DataTypes.STRING(60), allowNull: true },
    status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
    meta: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
  },
  {
    sequelize,
    tableName: "resources",
    timestamps: true,
  },
);
