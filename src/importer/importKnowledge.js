const fs = require('fs/promises');
const path = require('path');
const { initDatabase, getDatabase } = require('../database');
const { saveLearnedKnowledge } = require('../knowledgeService');
const { sha256 } = require('../utils/hash');
const { chunkMarkdown, chunkText, cleanWhitespace } = require('../utils/text');

const IMPORT_DIR = path.resolve(process.cwd(), 'imports');
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.json']);

async function readImportFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const raw = await fs.readFile(filePath, 'utf8');

  if (extension !== '.json') return raw;

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n\n');
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return JSON.stringify(parsed, null, 2);
  }

  return String(parsed);
}

function getFallbackTitle(filePath) {
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, ' ').trim();
}

function buildDocumentChunks(filePath, content) {
  const extension = path.extname(filePath).toLowerCase();
  const fallbackTitle = getFallbackTitle(filePath);

  if (extension === '.md') {
    return chunkMarkdown(content, 1400, fallbackTitle);
  }

  return chunkText(content, 1400).map((chunk) => ({
    content: chunk,
    documentTitle: fallbackTitle,
    sectionTitle: fallbackTitle,
    sectionPath: []
  }));
}

function buildTopic(documentChunk) {
  const sectionPath = documentChunk.sectionPath || [];
  const usefulPath = sectionPath.slice(-2);
  const parts = [documentChunk.documentTitle, ...usefulPath].filter(Boolean);
  return [...new Set(parts)].join(' - ');
}

async function importKnowledge() {
  await initDatabase();
  const database = await getDatabase();
  await fs.mkdir(IMPORT_DIR, { recursive: true });

  const files = (await fs.readdir(IMPORT_DIR))
    .filter((file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => path.join(IMPORT_DIR, file));

  let imported = 0;
  let skipped = 0;
  const importedFileNames = new Set(files.map((filePath) => path.basename(filePath)));

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const currentHashes = new Set();
    const content = await readImportFile(filePath);
    if (!cleanWhitespace(content)) continue;

    for (const documentChunk of buildDocumentChunks(filePath, content)) {
      const chunk = cleanWhitespace(documentChunk.content);
      if (!chunk) continue;
      const contentHash = sha256(chunk);
      currentHashes.add(contentHash);
      const duplicate = await database.get(
        `SELECT id, metadata_json
         FROM learned_knowledge
         WHERE content_hash = ? AND active = 1
         LIMIT 1`,
        contentHash
      );

      if (duplicate) {
        if (String(duplicate.metadata_json || '').includes(`\"fileName\":\"${fileName}\"`)) {
          await database.run(
            `UPDATE learned_knowledge
             SET normalized_topic = ?, metadata_json = ?, updated_at = ?
             WHERE id = ?`,
            buildTopic(documentChunk),
            JSON.stringify({
              fileName,
              contentHash,
              documentTitle: documentChunk.documentTitle,
              sectionTitle: documentChunk.sectionTitle,
              sectionPath: documentChunk.sectionPath
            }),
            new Date().toISOString(),
            duplicate.id
          );
        }
        skipped += 1;
        continue;
      }

      const messageId = `file-${contentHash}`;
      await saveLearnedKnowledge({
        content: chunk,
        authorId: 'system',
        authorUsername: 'importer',
        channelId: 'file_import',
        messageId,
        sourceType: 'file_import',
        normalizedTopic: buildTopic(documentChunk),
        metadata: {
          fileName,
          contentHash,
          documentTitle: documentChunk.documentTitle,
          sectionTitle: documentChunk.sectionTitle,
          sectionPath: documentChunk.sectionPath
        }
      });
      imported += 1;
    }

    const placeholders = [...currentHashes].map(() => '?').join(',');
    const params = [`%"fileName":"${fileName}"%`, ...currentHashes];
    const staleWhere = placeholders
      ? `metadata_json LIKE ? AND content_hash NOT IN (${placeholders})`
      : 'metadata_json LIKE ?';

    await database.run(
      `UPDATE learned_knowledge
       SET active = 0, updated_at = ?
       WHERE source_type = 'file_import'
         AND active = 1
         AND ${staleWhere}`,
      new Date().toISOString(),
      ...params
    );
  }

  const activeImportedRows = await database.all(
    `SELECT id, metadata_json
     FROM learned_knowledge
     WHERE source_type = 'file_import' AND active = 1`
  );

  const removedFileRowIds = activeImportedRows
    .filter((row) => {
      try {
        const metadata = JSON.parse(row.metadata_json || '{}');
        return metadata.fileName && !importedFileNames.has(metadata.fileName);
      } catch (error) {
        return false;
      }
    })
    .map((row) => row.id);

  if (removedFileRowIds.length > 0) {
    const placeholders = removedFileRowIds.map(() => '?').join(',');
    await database.run(
      `UPDATE learned_knowledge
       SET active = 0, updated_at = ?
       WHERE id IN (${placeholders})`,
      new Date().toISOString(),
      ...removedFileRowIds
    );
  }

  console.log(`Import finished. Imported: ${imported}. Skipped duplicates: ${skipped}. Files: ${files.length}.`);
  return { imported, skipped, files: files.length };
}

if (require.main === module) {
  importKnowledge().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  buildDocumentChunks,
  importKnowledge
};
