import "dotenv/config";
import { closePool } from "../src/db.js";
import { migrate } from "./migrate.js";
// Never point Preview deployments at the production database.
// Production migration is transactional and completed before promoting the new application.
if (
  process.env.VERCEL_ENV === "production" ||
  process.env.RUN_DB_MIGRATIONS === "true"
) {
  try {
    await migrate();
  } finally {
    await closePool();
  }
} else {
  console.log(
    "Banco não alterado neste build. Execute db:migrate no banco isolado de desenvolvimento/preview.",
  );
}
