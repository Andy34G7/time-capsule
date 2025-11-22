const { createClient } = require('@libsql/client');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'capsules.db');
const DEFAULT_DB_URL = `file:${DEFAULT_DB_PATH}`;
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL || DEFAULT_DB_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

let client;
let initPromise;

async function ensureLocalDir() {
  if (!TURSO_DATABASE_URL.startsWith('file:')) {
    return;
  }
  const dir = path.dirname(DEFAULT_DB_PATH);
  await fs.mkdir(dir, { recursive: true });
}

function getClient() {
  if (!client) {
    client = createClient({
      url: TURSO_DATABASE_URL,
      authToken: TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

async function ensureSchema() {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureLocalDir();
      const db = getClient();
      const statements = [
        `CREATE TABLE IF NOT EXISTS capsules (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          author TEXT,
          owner_id TEXT,
          created_at TEXT NOT NULL,
          reveal_at TEXT NOT NULL,
          is_locked INTEGER NOT NULL DEFAULT 0,
          passphrase_hash TEXT
        );`,
        'CREATE INDEX IF NOT EXISTS idx_capsules_reveal ON capsules (reveal_at);',
        'CREATE INDEX IF NOT EXISTS idx_capsules_locked ON capsules (is_locked);',
        'CREATE INDEX IF NOT EXISTS idx_capsules_owner ON capsules (owner_id);',
        `CREATE TABLE IF NOT EXISTS capsule_attachments (
          id TEXT PRIMARY KEY,
          capsule_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          file_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (capsule_id) REFERENCES capsules(id) ON DELETE CASCADE
        );`,
        'CREATE INDEX IF NOT EXISTS idx_capsule_attachments_capsule ON capsule_attachments (capsule_id);',
      ];

      for (const sql of statements) {
        await db.execute(sql);
      }

      const migrations = ['ALTER TABLE capsules ADD COLUMN owner_id TEXT'];

      for (const sql of migrations) {
        try {
          await db.execute(sql);
        } catch (error) {
          const message = String(error.message || error);
          if (
            message.includes('duplicate') ||
            message.includes('exists') ||
            message.includes('already')
          ) {
            continue;
          }
          throw error;
        }
      }
    })();
  }
  return initPromise;
}

module.exports = {
  getClient,
  ensureSchema,
};
