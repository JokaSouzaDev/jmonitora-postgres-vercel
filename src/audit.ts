import { randomUUID } from "node:crypto";
import type pg from "pg";
export async function audit(
  client: pg.PoolClient,
  actorId: string | null,
  action: string,
  entityType: string,
  entityKey: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  // No passwords, contacts or observations in audit metadata.
  await client.query(
    `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_key, metadata)
    VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      randomUUID(),
      actorId,
      action,
      entityType,
      entityKey,
      JSON.stringify(metadata),
    ],
  );
}
