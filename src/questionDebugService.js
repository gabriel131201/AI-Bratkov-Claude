const { getDatabase } = require('./database');
const { FALLBACK_ANSWER } = require('./openaiClient');

async function listUnansweredQuestions(limit) {
  const database = await getDatabase();
  const baseQuery = `SELECT user_display_name, question, created_at
     FROM conversations
     WHERE answer = ?
     ORDER BY id DESC`;

  if (!Number.isInteger(limit) || limit <= 0) {
    return database.all(baseQuery, FALLBACK_ANSWER);
  }

  return database.all(
    `${baseQuery}\nLIMIT ?`,
    FALLBACK_ANSWER,
    limit
  );
}

module.exports = {
  listUnansweredQuestions
};
