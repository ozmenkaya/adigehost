import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/database";
import { Resource } from "./Resource";

export class ResourceCredential extends Model<InferAttributes<ResourceCredential>, InferCreationAttributes<ResourceCredential>> {
  declare id: CreationOptional<number>;
  declare resourceId: number;
  declare secretEncrypted: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ResourceCredential.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    resourceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: "resource_id" },
    secretEncrypted: { type: DataTypes.TEXT, allowNull: false, field: "secret_encrypted" },
    createdAt: { type: DataTypes.DATE, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, field: "updated_at" },
  },
  {
    sequelize,
    tableName: "resource_credentials",
    timestamps: true,
  },
);

Resource.hasOne(ResourceCredential, { foreignKey: "resourceId", as: "credential" });
ResourceCredential.belongsTo(Resource, { foreignKey: "resourceId" });
