const OpenAI = require('openai');
const { config } = require('./config');
const { SYSTEM_PROMPT } = require('./prompts');
const logger = require('./logger');
const { normalizeForSearch } = require('./utils/text');

const FALLBACK_ANSWER = 'Nu am această informație salvată momentan.';

let client;

function getOpenAIClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeoutMs,
      maxRetries: config.openai.maxRetries
    });
  }

  return client;
}

function extractResponseText(response) {
  if (response.output_text) return response.output_text.trim();

  const output = response.output || [];
  const text = output
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text' && item.text)
    .map((item) => item.text)
    .join('\n')
    .trim();

  return text || FALLBACK_ANSWER;
}

function sanitizeBlock(value) {
  return String(value || '').replace(/<\/?(?:FACTS|MEMORY|QUESTION)>/gi, '').trim();
}

function sanitizeSources(sources) {
  return [...new Set(sources || [])]
    .map((source) => String(source || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 5);
}

function stripGeneratedSources(answer) {
  const sourceHeader = answer.search(/\n+\s*Surse\s*:\s*(?:\n|$)/i);
  return sourceHeader >= 0 ? answer.slice(0, sourceHeader).trim() : answer.trim();
}

function formatGroundedAnswer(answer) {
  const cleaned = stripGeneratedSources(answer || FALLBACK_ANSWER);
  const normalized = normalizeForSearch(cleaned);
  if (!cleaned || normalized.startsWith(normalizeForSearch(FALLBACK_ANSWER))) return FALLBACK_ANSWER;
  return cleaned;
}

async function askPro4KingsAI({ question, context, memoryContext = '', sources = [] }) {
  if (!String(context || '').trim()) return FALLBACK_ANSWER;

  const openai = getOpenAIClient();
  const safeSources = sanitizeSources(sources);
  const startedAt = Date.now();

  try {
    const response = await openai.responses.create({
      model: config.openai.model,
      reasoning: {
        effort: config.openai.reasoningEffort
      },
      input: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: `<FACTS>\n${sanitizeBlock(context)}\n\nSurse permise pentru aceste fapte:\n${safeSources
            .map((source) => `- ${source}`)
            .join('\n')}\n</FACTS>\n\n<MEMORY>\n${sanitizeBlock(memoryContext) || 'Fara memorie relevanta.'}\n</MEMORY>\n\n<QUESTION>\n${sanitizeBlock(question)}\n</QUESTION>`
        }
      ],
      max_output_tokens: config.openai.maxOutputTokens
    });

    const answer = formatGroundedAnswer(extractResponseText(response));
    logger.info('OpenAI response completed', {
      model: config.openai.model,
      reasoningEffort: config.openai.reasoningEffort,
      durationMs: Date.now() - startedAt,
      sourceCount: safeSources.length
    });
    return answer;
  } catch (error) {
    logger.error('OpenAI request failed', {
      message: error.message,
      status: error.status
    });
    throw new Error('OpenAI request failed');
  }
}

module.exports = {
  FALLBACK_ANSWER,
  askPro4KingsAI,
  formatGroundedAnswer
};
