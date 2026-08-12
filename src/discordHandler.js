const { Events } = require('discord.js');
const { config } = require('./config');
const logger = require('./logger');
const { logAiEvent, getDatabase } = require('./database');
const { saveLearnedKnowledge } = require('./knowledgeService');
const { findRelevantContext } = require('./ragService');
const { askPro4KingsAI, FALLBACK_ANSWER, formatGroundedAnswer } = require('./openaiClient');
const { findFixedAnswer } = require('./fixedAnswerRouter');
const { addMemory, buildConversationalSearchQuery, buildMemoryContext, getMemory } = require('./memoryService');
const { handleAdminCommand } = require('./commands/adminCommands');
const { handleResignationMessage } = require('./resignationService');
const { splitForDiscord, stripDiscordMentions, cleanWhitespace } = require('./utils/text');

const INTERNAL_ERROR_ANSWER = 'A aparut o eroare interna. Incearca din nou mai tarziu.';

const recentMessageIds = new Set();
const chatQueues = new Map();

function hasLearnPermission(message) {
  if (config.adminUserIds.includes(message.author.id)) return true;

  const allowedRoles = config.channels.learnAllowedRoleIds;
  if (allowedRoles.length === 0) return false;

  return message.member?.roles?.cache?.some((role) => allowedRoles.includes(role.id)) || false;
}

function getDisplayName(message) {
  return message.member?.displayName || message.author.globalName || message.author.username || 'Jucator';
}

async function safeReply(message, content, { mentionAuthor = false } = {}) {
  const prefix = mentionAuthor ? `<@${message.author.id}>, ` : '';
  const chunks = splitForDiscord(`${prefix}${content || FALLBACK_ANSWER}`);
  const allowedMentions = mentionAuthor
    ? { repliedUser: false, users: [message.author.id] }
    : { repliedUser: false, users: [] };

  await message.reply({
    content: chunks.shift() || `${prefix}${FALLBACK_ANSWER}`,
    allowedMentions
  });

  for (const chunk of chunks) {
    await message.channel.send({
      content: chunk,
      allowedMentions: { users: [], roles: [] }
    });
  }
}

async function handleLearnMessage(message) {
  if (!hasLearnPermission(message)) {
    await safeReply(message, 'Nu ai permisiune sa inveti botul.');
    return;
  }

  const content = cleanWhitespace(stripDiscordMentions(message.content));
  if (!content) return;

  const saved = await saveLearnedKnowledge({
    content,
    authorId: message.author.id,
    authorUsername: message.author.username,
    channelId: message.channel.id,
    messageId: message.id
  });

  await logAiEvent('knowledge_saved', {
    messageId: message.id,
    topic: saved.normalizedTopic,
    knowledgeType: saved.knowledgeType,
    possibleConflict: Boolean(saved.possibleConflict)
  });

  if (saved.possibleConflict) {
    await safeReply(
      message,
      'Atentie: Am salvat informatia, dar pare sa intre in conflict cu o informatie existenta. Verifica /knowledge-list sau /search.'
    );
    return;
  }

  if (saved.duplicate) {
    await safeReply(message, `Informatia exista deja in Knowledge Base ca #${saved.id}. Nu am dublat-o.`);
    return;
  }

  await safeReply(message, 'Am salvat informatia.');
}

async function saveConversation({ message, question, answer, context, model = config.openai.model }) {
  const database = await getDatabase();
  await database.run(
    `
      INSERT INTO conversations (
        user_id,
        user_display_name,
        channel_id,
        question,
        answer,
        used_context,
        model,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    message.author.id,
    getDisplayName(message),
    message.channel.id,
    question,
    answer,
    context,
    model,
    new Date().toISOString()
  );
}

async function saveMemoryExchange({ message, question, answer }) {
  const displayName = getDisplayName(message);
  await addMemory({
    userId: message.author.id,
    displayName,
    channelId: message.channel.id,
    role: 'user',
    content: question
  });
  await addMemory({
    userId: message.author.id,
    displayName: 'Pro4Kings Intelligence',
    channelId: message.channel.id,
    role: 'assistant',
    content: answer
  });
}

function startTypingKeepAlive(message) {
  message.channel.sendTyping().catch(() => {});
  const timer = setInterval(() => message.channel.sendTyping().catch(() => {}), 8_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function replyWithFixedAnswer({ message, question, fixedAnswer, contextPrefix = 'Replica fixa' }) {
  const answer = formatGroundedAnswer(fixedAnswer.answer);
  await saveConversation({
    message,
    question,
    answer,
    context: `${contextPrefix}: ${fixedAnswer.id}`,
    model: 'deterministic'
  });
  await saveMemoryExchange({ message, question, answer });
  await safeReply(message, answer, { mentionAuthor: true });
}

async function handleChatMessage(message) {
  const question = cleanWhitespace(stripDiscordMentions(message.content));
  if (!question) return;

  const stopTyping = startTypingKeepAlive(message);

  try {
    const fixedAnswer = findFixedAnswer(question);
    if (fixedAnswer) {
      await replyWithFixedAnswer({ message, question, fixedAnswer });
      return;
    }

    const memoryRows = await getMemory({
      userId: message.author.id,
      channelId: message.channel.id
    });
    const memoryContext = buildMemoryContext(memoryRows);
    const searchQuery = buildConversationalSearchQuery(question, memoryRows);

    const contextualFixedAnswer =
      searchQuery !== question
        ? findFixedAnswer(question, {
            contextQuestion: searchQuery,
            allowImplicitInventory: true
          })
        : null;
    if (contextualFixedAnswer) {
      await replyWithFixedAnswer({
        message,
        question,
        fixedAnswer: contextualFixedAnswer,
        contextPrefix: 'Replica fixa din continuarea conversatiei'
      });
      return;
    }

    let relevant = await findRelevantContext(searchQuery);
    if (!relevant.found && searchQuery !== question) {
      relevant = await findRelevantContext(question);
    }

    await logAiEvent('rag_search', {
      userId: message.author.id,
      found: relevant.found,
      topScore: relevant.topScore || 0,
      keywords: relevant.keywords || [],
      usedConversationContext: searchQuery !== question
    });

    if (!relevant.found) {
      const answer = FALLBACK_ANSWER;
      await saveConversation({ message, question, answer, context: '' });
      await saveMemoryExchange({ message, question, answer });
      await safeReply(message, answer, { mentionAuthor: true });
      return;
    }

    let answer;
    try {
      answer = await askPro4KingsAI({
        question,
        context: relevant.context,
        memoryContext,
        sources: relevant.sources || []
      });
    } catch (error) {
      // Mesajul de eroare nu se salveaza in memorie: ar deveni "raspunsul asistentului"
      // si ar contamina rezolvarea urmatoarelor continuari de conversatie.
      await safeReply(message, INTERNAL_ERROR_ANSWER, { mentionAuthor: true });
      return;
    }

    await saveConversation({
      message,
      question,
      answer,
      context: relevant.context
    });
    await saveMemoryExchange({ message, question, answer });
    await safeReply(message, answer, { mentionAuthor: true });
  } finally {
    stopTyping();
  }
}

function enqueueChatMessage(message) {
  const key = `${message.channel.id}:${message.author.id}`;
  const previous = chatQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => handleChatMessage(message));
  chatQueues.set(key, current);

  return current.finally(() => {
    if (chatQueues.get(key) === current) chatQueues.delete(key);
  });
}

function registerDiscordHandlers(client) {
  client.once(Events.ClientReady, () => {
    logger.info('Discord client ready', {
      user: client.user?.tag,
      guildId: config.discord.guildId
    });
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      await handleAdminCommand(interaction);
    } catch (error) {
      logger.error('Discord interaction handling failed', {
        commandName: interaction.commandName,
        error: error.message
      });

      const payload = {
        content: 'A aparut o eroare interna. Incearca din nou mai tarziu.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (recentMessageIds.has(message.id)) return;

    recentMessageIds.add(message.id);
    setTimeout(() => recentMessageIds.delete(message.id), 60_000);

    try {
      if (message.channel.id === config.channels.aiLearn) {
        await handleLearnMessage(message);
        return;
      }

      if (message.channel.id === config.channels.resignations) {
        await handleResignationMessage(message);
        return;
      }

      if (message.channel.id === config.channels.aiChat) {
        await enqueueChatMessage(message);
      }
    } catch (error) {
      logger.error('Discord message handling failed', {
        messageId: message.id,
        channelId: message.channel.id,
        error: error.message
      });
      await logAiEvent('discord_handler_error', {
        messageId: message.id,
        error: error.message
      });
      // Daca si raspunsul de eroare esueaza (mesaj sters, lipsa permisiuni), nu lasam
      // o respingere netratata sa urce in process-ul principal.
      await safeReply(message, INTERNAL_ERROR_ANSWER, {
        mentionAuthor: message.channel.id === config.channels.aiChat
      }).catch((replyError) => {
        logger.error('Discord error reply failed', {
          messageId: message.id,
          error: replyError.message
        });
      });
    }
  });
}

module.exports = {
  registerDiscordHandlers
};
