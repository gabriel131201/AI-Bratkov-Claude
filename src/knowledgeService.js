const { getDatabase } = require('./database');
const { sha256 } = require('./utils/hash');
const { cleanWhitespace, extractKeywords, guessTopic, normalizeForSearch } = require('./utils/text');

const KNOWLEDGE_TYPES = [
  'job',
  'regulament',
  'locatie',
  'pret',
  'item',
  'RP',
  'factiune',
  'economie',
  'sistem server',
  'necunoscut'
];

function detectKnowledgeType(content) {
  const normalized = normalizeForSearch(content);

  if (/\b(job|munca|serviciu|trucker|pescar|curier|constructor|autobuz)\b/.test(normalized)) return 'job';
  if (/\b(regulament|regula|sanctiune|pedeapsa|warn|ban)\b/.test(normalized)) return 'regulament';
  if (/\b(locatie|gps|cod postal|postal|unde|zona)\b/.test(normalized)) return 'locatie';
  if (/\b(pret|costa|cost|bani|dolari|ron|lei|\$)\b/.test(normalized)) return 'pret';
  if (/\b(item|arma|arme|pistol|ak|shotgun|obiect)\b/.test(normalized)) return 'item';
  if (/\b(rp|roleplay|fail rp|character|personaj)\b/.test(normalized)) return 'RP';
  if (/\b(mafie|mafii|factiune|politie|medic|sindicat|familie)\b/.test(normalized)) return 'factiune';
  if (/\b(economie|salariu|taxa|bonus|profit)\b/.test(normalized)) return 'economie';
  if (/\b(server|sistem|panel|discord|comanda|ticket)\b/.test(normalized)) return 'sistem server';

  return 'necunoscut';
}

function extractMetadata(content) {
  const text = String(content || '');
  const normalized = normalizeForSearch(text);

  return {
    hours: [...text.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0]),
    postalCodes: [...normalized.matchAll(/\b(?:cod postal|postal)\s*(\d{2,6})\b/g)].map((match) => match[1]),
    money: [...text.matchAll(/\b\d[\d.,]*\s*(?:\$|dolari|ron|lei|kk|m)\b/gi)].map((match) => match[0]),
    npcs: [...text.matchAll(/\bNPC(?:-ul)?\s+([A-Za-z0-9 _-]{2,40})/gi)].map((match) => match[1].trim()),
    items: extractKeywords(text, 12).filter((keyword) =>
      ['pistol', 'arma', 'arme', 'ak', 'shotgun', 'item', 'fish', 'peste'].includes(keyword)
    ),
    vehicles: extractKeywords(text, 12).filter((keyword) =>
      ['masina', 'vehicul', 'elicopter', 'camion', 'tir', 'autobuz', 'bus'].includes(keyword)
    ),
    jobs: extractKeywords(text, 12).filter((keyword) =>
      ['trucker', 'pescar', 'curier', 'constructor', 'autobuz', 'job'].includes(keyword)
    )
  };
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return fallback;
  }
}

async function findPossibleConflict(database, { normalizedTopic, content, contentHash }) {
  const existingRows = await database.all(
    `SELECT id, content, normalized_topic, content_hash
     FROM learned_knowledge
     WHERE active = 1
       AND normalized_topic = ?
       AND (content_hash IS NULL OR content_hash != ?)
     ORDER BY updated_at DESC
     LIMIT 10`,
    normalizedTopic,
    contentHash
  );

  const normalizedNew = normalizeForSearch(content);
  const conflictWords = ['nu', 'interzis', 'obligatoriu', 'doar', 'maxim', 'minim', 'poate', 'nu poate'];

  for (const existing of existingRows) {
    const normalizedExisting = normalizeForSearch(existing.content);
    const hasDifferentNegation =
      normalizedNew.includes(' nu ') !== normalizedExisting.includes(' nu ') ||
      normalizedNew.includes('interzis') !== normalizedExisting.includes('interzis');
    const sharesPolicyWord = conflictWords.some(
      (word) => normalizedNew.includes(word) && normalizedExisting.includes(word)
    );

    if (hasDifferentNegation || sharesPolicyWord) {
      return {
        existingKnowledgeId: existing.id,
        reason: hasDifferentNegation
          ? 'Posibila contradictie de negare/interdictie pe acelasi topic.'
          : 'Posibila suprapunere de regula pe acelasi topic.'
      };
    }
  }

  return null;
}

async function saveLearnedKnowledge({
  content,
  authorId,
  authorUsername,
  channelId,
  messageId,
  sourceType = 'discord_learn_channel',
  normalizedTopic,
  knowledgeType,
  metadata
}) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const cleaned = cleanWhitespace(content);
  const topic = normalizedTopic || guessTopic(cleaned);
  const type = knowledgeType || detectKnowledgeType(cleaned);
  const extractedMetadata = metadata || extractMetadata(cleaned);
  const contentHash = sha256(cleaned);

  const duplicate = await database.get(
    `SELECT id, content, normalized_topic, knowledge_type, metadata_json
     FROM learned_knowledge
     WHERE active = 1
       AND content_hash = ?
       AND message_id != ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    contentHash,
    messageId
  );

  if (duplicate) {
    return {
      id: duplicate.id,
      content: duplicate.content,
      normalizedTopic: duplicate.normalized_topic,
      knowledgeType: duplicate.knowledge_type,
      metadata: safeJsonParse(duplicate.metadata_json),
      possibleConflict: null,
      duplicate: true
    };
  }

  const result = await database.run(
    `
      INSERT INTO learned_knowledge (
        content,
        normalized_topic,
        author_id,
        author_username,
        channel_id,
        message_id,
        source_type,
        content_hash,
        knowledge_type,
        metadata_json,
        created_at,
        updated_at,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(message_id) DO UPDATE SET
        content = excluded.content,
        normalized_topic = excluded.normalized_topic,
        content_hash = excluded.content_hash,
        knowledge_type = excluded.knowledge_type,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        active = 1
    `,
    cleaned,
    topic,
    authorId,
    authorUsername,
    channelId,
    messageId,
    sourceType,
    contentHash,
    type,
    JSON.stringify(extractedMetadata),
    now,
    now
  );

  const row = await database.get('SELECT id FROM learned_knowledge WHERE message_id = ?', messageId);
  let possibleConflict = null;

  if (sourceType === 'discord_learn_channel' || sourceType === 'manual_admin') {
    possibleConflict = await findPossibleConflict(database, {
      normalizedTopic: topic,
      content: cleaned,
      contentHash
    });

    if (possibleConflict && row?.id) {
      await database.run(
        `INSERT INTO knowledge_conflicts (
          new_knowledge_id,
          existing_knowledge_id,
          reason,
          created_at,
          resolved
        ) VALUES (?, ?, ?, ?, 0)`,
        row.id,
        possibleConflict.existingKnowledgeId,
        possibleConflict.reason,
        now
      );
    }
  }

  return {
    id: row?.id || result.lastID,
    content: cleaned,
    normalizedTopic: topic,
    knowledgeType: type,
    metadata: extractedMetadata,
    possibleConflict
  };
}

async function disableKnowledge(id) {
  const database = await getDatabase();
  const result = await database.run(
    'UPDATE learned_knowledge SET active = 0, updated_at = ? WHERE id = ? AND active = 1',
    new Date().toISOString(),
    id
  );

  return result.changes > 0;
}

async function listKnowledge(limit = 10) {
  const database = await getDatabase();
  return database.all(
    `SELECT id, normalized_topic, knowledge_type, content, source_type, created_at, updated_at
     FROM learned_knowledge
     WHERE active = 1
     ORDER BY updated_at DESC
     LIMIT ?`,
    limit
  );
}

module.exports = {
  KNOWLEDGE_TYPES,
  detectKnowledgeType,
  disableKnowledge,
  extractMetadata,
  listKnowledge,
  saveLearnedKnowledge
};
