import { sequelize } from "./config/database";
import "./models/User";
import "./models/Resource";
import "./models/ResourceCredential";
import "./models/Reservation";
import "./models/Job";

async function main() {
  const alter = process.argv.includes("--alter");
  await sequelize.authenticate();
  await sequelize.sync({ alter });
  console.log(`Şema senkronize edildi${alter ? " (--alter)" : ""}.`);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
