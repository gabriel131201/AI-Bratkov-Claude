const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { config } = require('./config');
const logger = require('./logger');
const { sha256 } = require('./utils/hash');

let db;

// Pe Railway discul containerului este sters la fiecare redeploy. Cand DATABASE_PATH
// indica un volum persistent, copiem o singura data baza livrata in repo, ca volumul
// gol sa porneasca cu tot Knowledge Base-ul, nu de la zero.
function seedDatabaseFile(dbPath) {
  if (fs.existsSync(dbPath)) return;

  const seedPath = path.resolve(__dirname, '..', 'data', 'pro4kings_ai.sqlite');
  if (path.resolve(seedPath) === path.resolve(dbPath) || !fs.existsSync(seedPath)) return;

  // Copierea este o optimizare, nu o conditie de pornire. Daca volumul nu permite
  // scrierea, pornim cu o baza goala care se reconstruieste din `imports/`.
  try {
    fs.copyFileSync(seedPath, dbPath);
    logger.info('Database seeded from repository snapshot', { from: seedPath, to: dbPath });
  } catch (error) {
    logger.warn('Database seeding failed; starting with an empty database', { message: error.message });
  }
}

async function initDatabase() {
  if (db) return db;

  const dbPath = path.resolve(process.cwd(), config.database.path);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  seedDatabaseFile(dbPath);

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS learned_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      normalized_topic TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_username TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      content_hash TEXT,
      knowledge_type TEXT NOT NULL DEFAULT 'necunoscut',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS official_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'Regulament Oficial',
      url TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_display_name TEXT NOT NULL DEFAULT '',
      channel_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      used_context TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      channel_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      new_knowledge_id INTEGER NOT NULL,
      existing_knowledge_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_learned_active_topic
      ON learned_knowledge(active, normalized_topic);

    CREATE INDEX IF NOT EXISTS idx_memory_user_channel
      ON conversation_memory(user_id, channel_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_conflicts_resolved
      ON knowledge_conflicts(resolved, created_at);

    CREATE INDEX IF NOT EXISTS idx_rules_active
      ON official_rules(active, synced_at);
  `);

  const officialRuleColumns = await db.all('PRAGMA table_info(official_rules)');
  const hasRuleNameColumn = officialRuleColumns.some((column) => column.name === 'name');

  if (!hasRuleNameColumn) {
    await db.exec("ALTER TABLE official_rules ADD COLUMN name TEXT NOT NULL DEFAULT 'Regulament Oficial'");
  }

  const learnedColumns = await db.all('PRAGMA table_info(learned_knowledge)');
  const learnedColumnNames = new Set(learnedColumns.map((column) => column.name));

  if (!learnedColumnNames.has('content_hash')) {
    await db.exec('ALTER TABLE learned_knowledge ADD COLUMN content_hash TEXT');
  }

  if (!learnedColumnNames.has('knowledge_type')) {
    await db.exec("ALTER TABLE learned_knowledge ADD COLUMN knowledge_type TEXT NOT NULL DEFAULT 'necunoscut'");
  }

  if (!learnedColumnNames.has('metadata_json')) {
    await db.exec("ALTER TABLE learned_knowledge ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
  }

  const conversationColumns = await db.all('PRAGMA table_info(conversations)');
  const conversationColumnNames = new Set(conversationColumns.map((column) => column.name));
  if (!conversationColumnNames.has('user_display_name')) {
    await db.exec("ALTER TABLE conversations ADD COLUMN user_display_name TEXT NOT NULL DEFAULT ''");
  }

  const memoryColumns = await db.all('PRAGMA table_info(conversation_memory)');
  const memoryColumnNames = new Set(memoryColumns.map((column) => column.name));
  if (!memoryColumnNames.has('display_name')) {
    await db.exec("ALTER TABLE conversation_memory ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
  }

  const rowsWithoutHash = await db.all(
    'SELECT id, content FROM learned_knowledge WHERE content_hash IS NULL OR content_hash = "" LIMIT 1000'
  );

  for (const row of rowsWithoutHash) {
    await db.run('UPDATE learned_knowledge SET content_hash = ? WHERE id = ?', sha256(row.content), row.id);
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_learned_content_hash
      ON learned_knowledge(content_hash);

    CREATE INDEX IF NOT EXISTS idx_rules_active_name
      ON official_rules(active, name, synced_at);
  `);

  logger.info('Database initialized', { path: dbPath });
  return db;
}

async function getDatabase() {
  if (!db) return initDatabase();
  return db;
}

async function logAiEvent(eventType, details = {}) {
  const database = await getDatabase();
  await database.run(
    'INSERT INTO ai_logs (event_type, details, created_at) VALUES (?, ?, ?)',
    eventType,
    JSON.stringify(details),
    new Date().toISOString()
  );
}

module.exports = {
  initDatabase,
  getDatabase,
  logAiEvent
};
