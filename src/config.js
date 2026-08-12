require('dotenv').config();

const requiredForRuntime = ['DISCORD_TOKEN', 'OPENAI_API_KEY'];

const defaultRuleSources = [
  { name: 'Regulament Server', url: 'https://panel.pro4kings.ro/rules/4' },
  { name: 'Regulament Civil', url: 'https://panel.pro4kings.ro/rules/5' },
  { name: 'Regulament Mafii', url: 'https://panel.pro4kings.ro/rules/6' },
  { name: 'Regulament Sindicat', url: 'https://panel.pro4kings.ro/rules/7' },
  { name: 'Regulament Jafuri', url: 'https://panel.pro4kings.ro/rules/8' },
  { name: 'Regulament Cayo', url: 'https://panel.pro4kings.ro/rules/9' },
  { name: 'Regulament Turfs', url: 'https://panel.pro4kings.ro/rules/10' },
  { name: 'Regulament PC Check', url: 'https://panel.pro4kings.ro/rules/11' },
  { name: 'Sanctiuni si pedepse', url: 'https://panel.pro4kings.ro/rules/18' }
];

const defaultChannels = {
  aiChat: '1525633996766187650',
  aiLearn: '1525634377349071050',
  resignations: '1221141777885691924'
};

const defaultAdminRoleIds = ['1107100643291828224', '1515017621127299303', '1107099637644529684'];
const defaultAdminUserIds = ['937132477791752222'];

function parseList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseReasoningEffort(value, fallback = 'high') {
  const normalized = String(value || fallback).trim().toLowerCase();
  const allowed = new Set(['none', 'low', 'medium', 'high', 'xhigh']);
  return allowed.has(normalized) ? normalized : fallback;
}

// Railway injecteaza RAILWAY_VOLUME_MOUNT_PATH cand serviciul are un volum atasat.
// Fara el baza ar ramane pe discul efemer al containerului si tot ce a invatat botul
// s-ar pierde la fiecare redeploy. Detectia automata scuteste o variabila manuala.
function resolveDatabasePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;

  const volumePath = String(process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
  if (volumePath) return `${volumePath.replace(/[\\/]+$/, '')}/pro4kings_ai.sqlite`;

  return './data/pro4kings_ai.sqlite';
}

function parseRuleSources(value) {
  if (!value) {
    if (process.env.RULES_URL) {
      return [{ name: 'Regulament Oficial', url: process.env.RULES_URL }];
    }
    return defaultRuleSources;
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`RULE_SOURCES_JSON is not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('RULE_SOURCES_JSON must be a non-empty JSON array');
  }

  return parsed.map((source, index) => {
    const name = String(source?.name || '').trim();
    const url = String(source?.url || '').trim();

    if (!name || !url) {
      throw new Error(`RULE_SOURCES_JSON item ${index + 1} must include name and url`);
    }

    return { name, url };
  });
}

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    applicationId: process.env.DISCORD_APPLICATION_ID || '1409753933353713667',
    guildId: process.env.DISCORD_GUILD_ID || '1107074840378220645',
    publicKey:
      process.env.DISCORD_PUBLIC_KEY ||
      '7d07aaf48639cbad9165340969dafdc1e3a38080d3684b8dbcffce8e1239a7d6'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    reasoningEffort: parseReasoningEffort(process.env.OPENAI_REASONING_EFFORT),
    timeoutMs: parseInteger(process.env.OPENAI_TIMEOUT_MS, 45_000, { min: 5_000, max: 120_000 }),
    maxRetries: parseInteger(process.env.OPENAI_MAX_RETRIES, 2, { min: 0, max: 5 }),
    maxOutputTokens: parseInteger(process.env.OPENAI_MAX_OUTPUT_TOKENS, 3_000, { min: 500, max: 8_000 })
  },
  channels: {
    aiChat: process.env.AI_CHAT_CHANNEL_ID || defaultChannels.aiChat,
    aiLearn: process.env.AI_LEARN_CHANNEL_ID || defaultChannels.aiLearn,
    resignations: process.env.RESIGNATION_CHANNEL_ID || defaultChannels.resignations,
    ruleUpdate: process.env.RULE_UPDATE_CHANNEL_ID,
    learnAllowedRoleIds: parseList(process.env.AI_LEARN_ALLOWED_ROLE_IDS || defaultAdminRoleIds.join(','))
  },
  adminRoleIds: parseList(process.env.ADMIN_ROLE_IDS || defaultAdminRoleIds.join(',')),
  adminUserIds: parseList(process.env.ADMIN_USER_IDS || defaultAdminUserIds.join(',')),
  rules: {
    sources: parseRuleSources(process.env.RULE_SOURCES_JSON),
    syncCron: process.env.RULE_SYNC_CRON || '0 4 * * 0'
  },
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== 'false',
    port: Number(process.env.DASHBOARD_PORT || process.env.PORT || 3000),
    token: process.env.DASHBOARD_TOKEN
  },
  startup: {
    registerCommands: process.env.REGISTER_COMMANDS_ON_START !== 'false',
    syncRules: process.env.SYNC_RULES_ON_START !== 'false',
    importKnowledge: process.env.IMPORT_KNOWLEDGE_ON_START !== 'false'
  },
  database: {
    path: resolveDatabasePath()
  },
  memory: {
    messageLimit: parseInteger(process.env.MEMORY_MESSAGE_LIMIT, 20, { min: 10, max: 50 }),
    contextMessageLimit: parseInteger(process.env.MEMORY_CONTEXT_LIMIT, 12, { min: 6, max: 30 })
  },
  logLevel: process.env.LOG_LEVEL || 'info'
};

function validateRuntimeConfig() {
  const missing = requiredForRuntime.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  config,
  validateRuntimeConfig
};
