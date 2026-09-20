import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePool, transaction } from "../src/db.js";

export async function migrate(): Promise<void> {
  const directory = new URL("../db/migrations/", import.meta.url);
  await transaction(async (client) => {
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SELECT pg_advisory_xact_lock(20260919)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    for (const name of (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const source = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const old = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (old.rows[0]) {
        if (old.rows[0].checksum !== checksum)
          throw new Error(
            `Migração alterada: ${name}. Crie uma nova migração.`,
          );
        continue;
      }
      await client.query(source.replace(/^\s*(BEGIN|COMMIT);\s*$/gm, ""));
      await client.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)",
        [name, checksum],
      );
      console.log(`Migração aplicada: ${name}`);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
  } finally {
    await closePool();
  }
}
