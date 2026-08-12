const { AttachmentBuilder } = require('discord.js');
const { config } = require('../config');
const { getHealth, getStats } = require('../statsService');
const { saveLearnedKnowledge, disableKnowledge, listKnowledge } = require('../knowledgeService');
const { findRelevantContext } = require('../ragService');
const { syncRules } = require('../ruleSyncService');
const { listUnansweredQuestions } = require('../questionDebugService');
const { splitForDiscord } = require('../utils/text');

function hasAdminAccess(interaction) {
  if (config.adminUserIds.includes(interaction.user.id)) return true;
  if (config.adminRoleIds.length === 0) return false;
  return interaction.member?.roles?.cache?.some((role) => config.adminRoleIds.includes(role.id)) || false;
}

async function replyChunks(interaction, content, ephemeral = true) {
  const chunks = splitForDiscord(content);
  await interaction.editReply({ content: chunks.shift() || 'OK' });

  for (const chunk of chunks) {
    await interaction.followUp({ content: chunk, ephemeral });
  }
}

function formatRows(rows) {
  if (!rows || rows.length === 0) return 'Nu exista rezultate.';
  return rows
    .map((row) => `#${row.id} [${row.knowledge_type}] ${row.normalized_topic}: ${row.content.slice(0, 180)}`)
    .join('\n');
}

async function handleAdminCommand(interaction) {
  if (!interaction.isChatInputCommand()) return false;

  const adminCommands = new Set([
    'health',
    'stats',
    'rulesync',
    'search',
    'knowledge-add',
    'knowledge-disable',
    'knowledge-list',
    'intrebari',
    'reload-config'
  ]);

  if (!adminCommands.has(interaction.commandName)) return false;

  if (!hasAdminAccess(interaction)) {
    await interaction.reply({ content: 'Nu ai acces la aceasta comanda.', ephemeral: true });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  if (interaction.commandName === 'health') {
    const health = await getHealth();
    await replyChunks(interaction, `Health: ${health.ok ? 'OK' : 'ATENTIE'}\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``);
    return true;
  }

  if (interaction.commandName === 'stats') {
    const stats = await getStats();
    await replyChunks(interaction, `Stats:\n\`\`\`json\n${JSON.stringify(stats, null, 2)}\n\`\`\``);
    return true;
  }

  if (interaction.commandName === 'rulesync') {
    const result = await syncRules(interaction.client);
    await replyChunks(interaction, `Rules sync: ${result.status}\nSurse procesate: ${result.sources?.length || 0}`);
    return true;
  }

  if (interaction.commandName === 'search') {
    const query = interaction.options.getString('query', true);
    const result = await findRelevantContext(query);
    if (!result.found) {
      await replyChunks(interaction, 'Nu am gasit context relevant.');
      return true;
    }
    const lines = result.results
      .slice(0, 8)
      .map((item) => `Scor ${item.score.toFixed(2)} | ${item.sourceLabel}\n${item.text.slice(0, 220)}`);
    await replyChunks(interaction, lines.join('\n\n'));
    return true;
  }

  if (interaction.commandName === 'knowledge-add') {
    const content = interaction.options.getString('content', true);
    const saved = await saveLearnedKnowledge({
      content,
      authorId: interaction.user.id,
      authorUsername: interaction.user.username,
      channelId: interaction.channelId,
      messageId: `manual-${interaction.id}`,
      sourceType: 'manual_admin'
    });
    const warning = saved.possibleConflict
      ? '\nAtentie: pare sa intre in conflict cu o informatie existenta.'
      : '';
    await replyChunks(interaction, `Salvat #${saved.id} pe topic "${saved.normalizedTopic}".${warning}`);
    return true;
  }

  if (interaction.commandName === 'knowledge-disable') {
    const id = interaction.options.getInteger('id', true);
    const disabled = await disableKnowledge(id);
    await replyChunks(interaction, disabled ? `Knowledge #${id} dezactivat.` : `Knowledge #${id} nu a fost gasit activ.`);
    return true;
  }

  if (interaction.commandName === 'knowledge-list') {
    const limit = Math.min(interaction.options.getInteger('limit') || 10, 20);
    const rows = await listKnowledge(limit);
    await replyChunks(interaction, formatRows(rows));
    return true;
  }

  if (interaction.commandName === 'intrebari') {
    const requestedLimit = interaction.options.getInteger('limit');
    const limit = requestedLimit ? Math.min(requestedLimit, 1000) : undefined;
    const rows = await listUnansweredQuestions(limit);
    if (rows.length === 0) {
      await replyChunks(interaction, 'Nu exista intrebari salvate cu raspunsul de fallback.');
      return true;
    }

    const content = rows
      .map((row, index) => {
        const date = new Date(row.created_at).toLocaleString('ro-RO', { timeZone: 'Europe/Berlin' });
        return `${index + 1}. [${date}] ${row.user_display_name || 'Utilizator'}: ${row.question}`;
      })
      .join('\n');
    const attachment = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
      name: 'intrebari-fara-raspuns.txt'
    });
    await interaction.editReply({
      content: `Intrebari fara raspuns documentat: ${rows.length}. Raportul complet este atasat.`,
      files: [attachment]
    });
    return true;
  }

  if (interaction.commandName === 'reload-config') {
    await replyChunks(
      interaction,
      `Config incarcata: model=${config.openai.model}, ruleSources=${config.rules.sources.length}, dashboard=${config.dashboard.enabled}`
    );
    return true;
  }

  return false;
}

module.exports = {
  handleAdminCommand,
  hasAdminAccess
};
