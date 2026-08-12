const { config } = require('./config');
const { getDatabase } = require('./database');
const { cleanWhitespace, extractKeywords, normalizeForSearch } = require('./utils/text');

const VALID_ROLES = new Set(['user', 'assistant']);

async function addMemory({ userId, displayName = '', channelId, role, content }) {
  const database = await getDatabase();
  const cleaned = cleanWhitespace(content).slice(0, 4_000);
  if (!cleaned || !VALID_ROLES.has(role)) return;

  await database.run(
    `INSERT INTO conversation_memory (user_id, display_name, channel_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    userId,
    cleanWhitespace(displayName).slice(0, 100),
    channelId,
    role,
    cleaned,
    new Date().toISOString()
  );

  const oldRows = await database.all(
    `SELECT id
     FROM conversation_memory
     WHERE user_id = ? AND channel_id = ?
     ORDER BY id DESC
     LIMIT -1 OFFSET ?`,
    userId,
    channelId,
    config.memory.messageLimit
  );

  if (oldRows.length > 0) {
    const placeholders = oldRows.map(() => '?').join(',');
    await database.run(`DELETE FROM conversation_memory WHERE id IN (${placeholders})`, ...oldRows.map((row) => row.id));
  }
}

async function getMemory({ userId, channelId, limit = config.memory.messageLimit }) {
  const database = await getDatabase();
  const rows = await database.all(
    `SELECT role, display_name, content, created_at
     FROM conversation_memory
     WHERE user_id = ? AND channel_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    userId,
    channelId,
    Math.min(limit, config.memory.messageLimit)
  );

  return rows.reverse();
}

function buildMemoryContext(rows, limit = config.memory.contextMessageLimit) {
  if (!rows || rows.length === 0) return '';

  return rows
    .slice(-limit)
    .map((row) => {
      const speaker = row.role === 'assistant' ? 'Pro4Kings Intelligence' : row.display_name || 'Utilizator';
      return `${speaker}: ${row.content}`;
    })
    .join('\n');
}

function isFollowUpQuestion(question) {
  const normalized = normalizeForSearch(question);
  if (!normalized) return false;

  if (/^(si|dar|iar|atunci|apoi)\b/.test(normalized)) return true;
  if (/^(?:si\s+)?(?:altceva(?:\s+mai\s+ai)?|mai\s+ai\s+(?:ceva|altceva))$/.test(normalized)) return true;
  if (/\b(asta|acesta|aceasta|acestia|acelea|acolo|respectiv|respectiva|el|ea|ele)\b/.test(normalized)) return true;

  return extractKeywords(question, 4).length === 0;
}

function isContextualFollowUp(question, rows) {
  const keywords = extractKeywords(question, 5);
  if (keywords.length < 2 || keywords.length > 4 || !rows?.length) return false;

  const recentAssistantMessages = rows.filter((row) => row.role === 'assistant').slice(-3);
  const requiredMatches = Math.max(2, Math.ceil(keywords.length * 0.67));

  return recentAssistantMessages.some((row) => {
    const normalizedAnswer = ` ${normalizeForSearch(row.content)} `;
    const matchedKeywords = keywords.filter((keyword) => normalizedAnswer.includes(` ${normalizeForSearch(keyword)} `));
    return matchedKeywords.length >= requiredMatches;
  });
}

function buildConversationalSearchQuery(question, rows) {
  if ((!isFollowUpQuestion(question) && !isContextualFollowUp(question, rows)) || !rows?.length) return question;

  const recentUserMessages = rows
    .filter((row) => row.role === 'user' && !isFollowUpQuestion(row.content))
    .slice(-2)
    .map((row) => cleanWhitespace(row.content))
    .filter(Boolean);

  if (recentUserMessages.length === 0) return question;
  return `${recentUserMessages.join('\n')}\n${question}`;
}

module.exports = {
  addMemory,
  buildConversationalSearchQuery,
  buildMemoryContext,
  getMemory,
  isContextualFollowUp,
  isFollowUpQuestion
};
