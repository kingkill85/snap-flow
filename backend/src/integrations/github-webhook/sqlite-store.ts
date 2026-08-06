import { DB } from "sqlite";
import type { WebhookHandoffStore, WebhookQueueRecord } from "./handler.ts";

export interface QueuedWebhookWork {
  [column: string]: unknown;
  deliveryId: string;
  event: string;
  action: string;
  repository: string;
  issueNumber: number;
  commentId: number | null;
  profile: string;
  payloadVersion: number;
  status: string;
}

export class SqliteWebhookHandoffStore implements WebhookHandoffStore {
  readonly #database: DB;

  constructor(databasePath: string) {
    if (!databasePath) throw new Error("A durable database path is required");
    this.#database = new DB(databasePath);
    this.#database.execute("PRAGMA journal_mode = WAL");
    this.#database.execute("PRAGMA foreign_keys = ON");
    this.#database.execute(`
      CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
        delivery_id TEXT PRIMARY KEY,
        received_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS github_webhook_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        delivery_id TEXT NOT NULL UNIQUE REFERENCES github_webhook_deliveries(delivery_id),
        event TEXT NOT NULL,
        action TEXT NOT NULL,
        repository TEXT NOT NULL,
        issue_number INTEGER NOT NULL,
        comment_id INTEGER,
        profile TEXT NOT NULL CHECK (profile = 'dev'),
        payload_version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
        created_at TEXT NOT NULL
      );
    `);
  }

  accept(record: WebhookQueueRecord): "accepted" | "duplicate" {
    this.#database.query("BEGIN IMMEDIATE");
    try {
      this.#database.query(
        "INSERT OR IGNORE INTO github_webhook_deliveries (delivery_id, received_at) VALUES (?, ?)",
        [record.deliveryId, record.receivedAt],
      );
      const [{ changed }] = this.#database.queryEntries<{ changed: number }>(
        "SELECT changes() AS changed",
      );
      if (changed === 0) {
        this.#database.query("COMMIT");
        return "duplicate";
      }

      this.#database.query(
        `INSERT INTO github_webhook_queue (
          delivery_id, event, action, repository, issue_number, comment_id,
          profile, payload_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.deliveryId,
          record.event,
          record.action,
          record.repository,
          record.issueNumber,
          record.commentId,
          record.profile,
          record.payloadVersion,
          record.receivedAt,
        ],
      );
      this.#database.query("COMMIT");
      return "accepted";
    } catch (error) {
      this.#database.query("ROLLBACK");
      throw error;
    }
  }

  listQueued(): QueuedWebhookWork[] {
    return this.#database.queryEntries<QueuedWebhookWork>(`
      SELECT
        delivery_id AS deliveryId,
        event,
        action,
        repository,
        issue_number AS issueNumber,
        comment_id AS commentId,
        profile,
        payload_version AS payloadVersion,
        status
      FROM github_webhook_queue
      WHERE status = 'queued'
      ORDER BY id
    `);
  }

  close(): void {
    this.#database.close();
  }
}
