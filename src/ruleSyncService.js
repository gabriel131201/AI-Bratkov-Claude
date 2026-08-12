const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs/promises');
const path = require('path');
const { config } = require('./config');
const { initDatabase, getDatabase } = require('./database');
const logger = require('./logger');
const { sha256 } = require('./utils/hash');
const { cleanWhitespace, normalizeForSearch } = require('./utils/text');

const UI_CHROME_LINES = new Set([
  'pagini',
  'acasa',
  'regulamente',
  'server',
  'civil',
  'mafii',
  'sindicat',
  'jafuri',
  'cayo',
  'turfs',
  'pc check',
  'sanctiuni',
  'tutoriale',
  'cauta un jucator',
  'jucatori online',
  'staff',
  'shop',
  'factiuni',
  'banuri',
  'harta teritoriala',
  'setari tema',
  'scheme de culori'
]);

function isUiChromeLine(line) {
  return UI_CHROME_LINES.has(normalizeForSearch(line));
}

function extractUsefulText(html) {
  const $ = cheerio.load(html);

  $('script, style, nav, footer, header, aside, noscript, svg').remove();
  $('[aria-hidden="true"]').remove();
  $('br').replaceWith('\n');
  $('h1, h2, h3, h4, h5, h6, p, li, tr').each((_, element) => {
    $(element).prepend('\n').append('\n');
  });
  $('section, article, main').each((_, element) => {
    $(element).prepend('\n').append('\n');
  });

  const mainText = $('main').text() || $('article').text() || $('.content').text() || $('body').text();
  return mainText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => cleanWhitespace(line))
    .filter(Boolean)
    .filter((line) => !isUiChromeLine(line))
    .join('\n');
}

function safeFileName(value) {
  return String(value || 'regulament')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function formatRuleTextForTxt(content) {
  let formatted = String(content || '')
    .replace(/^Pagini Acasă.*?Harta teritorială\s*/u, '')
    .replace(/\s*Setări temă.*$/u, '')
    .replace(/\s*Scheme de culori.*$/u, '');

  const withoutUiChrome = [];
  let droppingHeader = true;
  let droppingFooter = false;

  for (const line of formatted.split('\n')) {
    const normalizedLine = normalizeForSearch(line);

    if (normalizedLine === 'setari tema' || normalizedLine === 'scheme de culori') {
      droppingFooter = true;
    }
    if (droppingFooter) continue;

    if (droppingHeader && UI_CHROME_LINES.has(normalizedLine)) {
      if (normalizedLine === 'harta teritoriala') droppingHeader = false;
      continue;
    }

    droppingHeader = false;
    withoutUiChrome.push(line);
  }

  formatted = withoutUiChrome.join('\n');

  const headings = [
    'INFORMAȚII GENERALE',
    'CE ESTE',
    'REGULAMENT',
    'ACTIVITĂȚILE ILEGALE PE LOCAȚII',
    'INTERVALUL PENTRU JAFURI',
    'ACCESUL PE INSULĂ',
    'ZONE ÎN CARE JAFURILE ȘI RĂPIRILE SUNT INTERZISE',
    'ATERIZAREA PE CAYO PERICO',
    'REGULA DE FAKE MAFIA',
    'VEHICULELE PERMISE PE CAYO PERICO',
    'ECHIPAMENTUL OBLIGATORIU',
    'EXCEPȚII PRIVIND ECHIPAMENTUL',
    'CONTROLUL LOCAȚIILOR',
    'CONFLICTELE DINTRE MAFII',
    'TAXELE DE PE CAYO PERICO',
    'ACTIVITATEA ORGANIZAȚIILOR MAFIOTE',
    'ATENȚIE:',
    'SANCȚIUNI'
  ];

  formatted = formatted
    .replace(/CAYO\s+INFORMAȚII GENERALE\s+CAYO PERICO\s+CE ESTE\s+CAYO PERICO\?/u, 'CAYO\n\nINFORMAȚII GENERALE CAYO PERICO\n\nCE ESTE CAYO PERICO?')
    .replace(/REGULAMENT\s+CAYO PERICO/u, 'REGULAMENT CAYO PERICO')
    .replace(/➤\s*/g, '\n➤ ');

  for (const heading of headings.sort((a, b) => b.length - a.length)) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    formatted = formatted.replace(new RegExp(`\\s*(${escaped})`, 'gu'), '\n\n$1');
  }

  formatted = formatted
    .replace(/([.;])(?=(?:[A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ\s/-]{4,}))/gu, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return formatted;
}

async function exportRulesToTxt() {
  const database = await getDatabase();
  const outputDir = path.resolve(process.cwd(), 'data', 'official_rules_txt');
  await fs.mkdir(outputDir, { recursive: true });

  const rows = await database.all(
    `SELECT id, name, url, content, content_hash, synced_at
     FROM official_rules
     WHERE active = 1
     ORDER BY name`
  );

  for (const row of rows) {
    const filePath = path.join(outputDir, `${safeFileName(row.name)}.txt`);
    const body = `${formatRuleTextForTxt(row.content)}\n`;

    await fs.writeFile(filePath, body, 'utf8');
  }

  logger.info('Rules exported to TXT', { outputDir, count: rows.length });
  return { outputDir, count: rows.length };
}

async function writeSyncLog({ sourceUrl, status, message }) {
  const database = await getDatabase();
  await database.run(
    'INSERT INTO sync_logs (source_url, status, message, created_at) VALUES (?, ?, ?, ?)',
    sourceUrl,
    status,
    message,
    new Date().toISOString()
  );
}

function summarizeRuleChange(previousContent, nextContent) {
  if (!previousContent) return 'Prima versiune sincronizata.';

  const previousSentences = new Set(previousContent.split(/(?<=[.!?])\s+/).map(cleanWhitespace).filter(Boolean));
  const added = nextContent
    .split(/(?<=[.!?])\s+/)
    .map(cleanWhitespace)
    .filter((sentence) => sentence.length > 30 && !previousSentences.has(sentence))
    .slice(0, 3);

  if (added.length === 0) {
    return 'Continutul s-a modificat, dar nu s-au putut extrage diferente scurte.';
  }

  return added.map((sentence) => `- ${sentence.slice(0, 220)}`).join('\n');
}

async function sendRuleUpdateReport(client, reportLines) {
  if (!client || !config.channels.ruleUpdate || reportLines.length === 0) return;

  try {
    const channel = await client.channels.fetch(config.channels.ruleUpdate);
    if (!channel?.isTextBased()) return;

    await channel.send(`Raport update regulamente:\n${reportLines.join('\n\n')}`);
  } catch (error) {
    logger.warn('Could not send rule update report', { message: error.message });
  }
}

async function syncRules(client) {
  const database = await getDatabase();
  const results = [];
  const reportLines = [];

  for (const source of config.rules.sources) {
    const { name, url } = source;

    try {
      logger.info('Starting rules sync', { name, url });
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Pro4KingsIntelligence/1.0'
        }
      });

      const content = extractUsefulText(response.data);

      if (!content || content.length < 100) {
        throw new Error('Rules page did not contain enough useful text');
      }

      const contentHash = sha256(content);
      const latest = await database.get(
        'SELECT id, name, content, content_hash FROM official_rules WHERE url = ? AND active = 1 ORDER BY synced_at DESC LIMIT 1',
        url
      );

      if (latest && latest.content_hash === contentHash) {
        if (latest.name !== name) {
          await database.run('UPDATE official_rules SET name = ? WHERE id = ?', name, latest.id);
        }

        await writeSyncLog({
          sourceUrl: url,
          status: 'unchanged',
          message: `${name}: rules content hash unchanged`
        });
        logger.info('Rules unchanged', { name, url });
        results.push({ name, url, status: 'unchanged', hash: contentHash });
        continue;
      }

      await database.run('UPDATE official_rules SET active = 0 WHERE url = ? AND active = 1', url);
      await database.run(
        'INSERT INTO official_rules (name, url, content, content_hash, synced_at, active) VALUES (?, ?, ?, ?, ?, 1)',
        name,
        url,
        content,
        contentHash,
        new Date().toISOString()
      );

      const summary = summarizeRuleChange(latest?.content, content);

      await writeSyncLog({
        sourceUrl: url,
        status: 'updated',
        message: `${name}: rules synced successfully. Hash: ${contentHash}. Summary: ${summary}`
      });

      logger.info('Rules synced', { name, url, hash: contentHash });
      reportLines.push(`${name}\n${summary}`);
      results.push({ name, url, status: 'updated', hash: contentHash, summary });
    } catch (error) {
      await writeSyncLog({
        sourceUrl: url,
        status: 'failed',
        message: `${name}: ${error.message}`
      });
      logger.error('Rules sync failed; keeping last valid version', {
        name,
        url,
        message: error.message
      });
      results.push({ name, url, status: 'failed', error: error.message });
    }
  }

  const failed = results.filter((result) => result.status === 'failed');
  await sendRuleUpdateReport(client, reportLines);

  await exportRulesToTxt();
  if (failed.length === results.length) {
    return { status: 'failed', sources: results };
  }

  if (failed.length > 0) {
    return { status: 'partial', sources: results };
  }

  const changed = results.some((result) => result.status === 'updated');
  return { status: changed ? 'updated' : 'unchanged', sources: results };
}

async function runFromCli() {
  await initDatabase();
  const result = await syncRules();
  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runFromCli();
}

module.exports = {
  exportRulesToTxt,
  syncRules,
  extractUsefulText
};
