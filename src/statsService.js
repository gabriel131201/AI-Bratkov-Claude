const { config } = require('./config');
const { getDatabase } = require('./database');

async function getStats() {
  const database = await getDatabase();
  const [knowledge, rules, conversations, conflicts] = await Promise.all([
    database.get('SELECT COUNT(*) AS count FROM learned_knowledge WHERE active = 1'),
    database.get('SELECT COUNT(*) AS count FROM official_rules WHERE active = 1'),
    database.get('SELECT COUNT(*) AS count FROM conversations'),
    database.get('SELECT COUNT(*) AS count FROM knowledge_conflicts WHERE resolved = 0')
  ]);

  return {
    learnedKnowledge: knowledge.count,
    activeRules: rules.count,
    conversations: conversations.count,
    unresolvedConflicts: conflicts.count,
    model: config.openai.model
  };
}

async function getHealth() {
  const database = await getDatabase();
  const activeRules = await database.get('SELECT COUNT(*) AS count FROM official_rules WHERE active = 1');

  return {
    ok: Boolean(config.discord.token && config.openai.apiKey && activeRules.count > 0),
    botConfig: Boolean(config.discord.token),
    database: true,
    openaiConfig: Boolean(config.openai.apiKey),
    activeRules: activeRules.count,
    model: config.openai.model
  };
}

module.exports = {
  getHealth,
  getStats
};
