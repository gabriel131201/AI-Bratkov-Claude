const { SearchProvider } = require('./SearchProvider');
const {
  chunkText,
  expandKeywords,
  extractKeywords,
  fuzzyTokenMatch,
  normalizeForSearch
} = require('../utils/text');

const corpusCache = new WeakMap();

function getKeywordVariants(keyword) {
  const variants = new Map([[keyword, false]]);
  const suffixes = ['urilor', 'elor', 'ilor', 'ului', 'urile', 'iilor', 'lor', 'uri', 'ele', 'ile', 'ul', 'ii', 'i', 'e'];

  if (keyword.length >= 5) {
    for (const suffix of suffixes) {
      if (!keyword.endsWith(suffix) || keyword.length - suffix.length < 3) continue;
      variants.set(keyword.slice(0, -suffix.length), true);
      break;
    }
  }

  return [...variants.entries()]
    .map(([value, prefix]) => ({ value, prefix }))
    .filter((variant) => variant.value.length >= 2 || /^[a-z]\d{0,2}$/i.test(variant.value));
}

function prepareText(text) {
  const normalized = normalizeForSearch(text);
  const tokens = normalized ? normalized.split(' ') : [];
  const tokenCounts = new Map();
  for (const token of tokens) tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  return { normalized, padded: ` ${normalized} `, tokens, tokenCounts };
}

function countPhraseOccurrences(padded, phrase) {
  const needle = ` ${phrase} `;
  let count = 0;
  let cursor = 0;
  while ((cursor = padded.indexOf(needle, cursor)) >= 0) {
    count += 1;
    cursor += needle.length - 1;
  }
  return count;
}

function countVariantOccurrences(prepared, variant) {
  if (variant.value.includes(' ')) return countPhraseOccurrences(prepared.padded, variant.value);
  if (!variant.prefix) return prepared.tokenCounts.get(variant.value) || 0;

  let count = 0;
  for (const [token, occurrences] of prepared.tokenCounts.entries()) {
    if (token.startsWith(variant.value)) count += occurrences;
  }
  return count;
}

function hasFuzzyMatch(prepared, keyword, fuzzyCache) {
  if (keyword.includes(' ')) return false;

  for (const token of prepared.tokens) {
    const cacheKey = `${keyword}\u0000${token}`;
    let matches = fuzzyCache?.get(cacheKey);
    if (matches === undefined) {
      matches = fuzzyTokenMatch(keyword, token);
      fuzzyCache?.set(cacheKey, matches);
    }
    if (matches) return true;
  }

  return false;
}

function scorePrepared(prepared, keywords, fuzzyCache) {
  if (!prepared.normalized || keywords.length === 0) return { score: 0, matched: 0 };

  let score = 0;
  let matched = 0;

  for (const keyword of keywords) {
    const exactOccurrences = Math.max(
      ...getKeywordVariants(keyword).map((variant) => countVariantOccurrences(prepared, variant))
    );

    if (exactOccurrences > 0) {
      matched += 1;
      const weight = keyword.includes(' ') || keyword.length <= 3 ? 5 : keyword.length >= 6 ? 2 : 1.5;
      score += Math.min(exactOccurrences, 3) * weight;
      continue;
    }

    if (hasFuzzyMatch(prepared, keyword, fuzzyCache)) {
      matched += 1;
      score += 0.7;
    }
  }

  return { score, matched };
}

function scoreText(text, keywords) {
  return scorePrepared(prepareText(text), keywords);
}

function scoreConceptCoverage(prepared, keywordConcepts, fuzzyCache) {
  let matched = 0;

  for (const variants of keywordConcepts) {
    if (scorePrepared(prepared, variants, fuzzyCache).matched > 0) matched += 1;
  }

  return matched;
}

function getQuestionIntents(question) {
  const normalized = normalizeForSearch(question);
  const intents = new Set();

  if (/\b(unde|locatie|locatii|gps|cp|cod postal|postal)\b/.test(normalized)) intents.add('location');
  if (/\b(cat costa|costa|cost|pret|pretul|valoare)\b/.test(normalized)) intents.add('price');
  if (/\b(cerinte|necesita|nevoie|trebuie|ore minime|acces|ingrediente|materiale)\b/.test(normalized)) intents.add('requirements');
  if (/\b(primesc|primeste|recompensa|recompense|loot|drop|obtine|obtin)\b/.test(normalized)) intents.add('rewards');
  if (/\b(cum|pasi|incep|incepe|functioneaza|flux|produc\w*|proces\w*|fabric\w*|craft\w*|mont\w*|instal\w*)\b/.test(normalized)) {
    intents.add('process');
  }
  if (/\b(reteta|retete|craft\w*|fabric\w*|produc\w*|proces\w*|materiale necesare|ingrediente)\b/.test(normalized)) {
    intents.add('recipe');
  }
  if (/\b(sanctiune|sanctiuni|sanctioneaza|pedeapsa|pedepse|warn|ban)\b/.test(normalized)) intents.add('sanction');
  const isRobberyQuestion = /\b(?:jaf\w*|jefui\w*|robbery|heist|sparg\w*)\b/.test(normalized);
  if (isRobberyQuestion) intents.add('robbery');
  if (/\b(vand|vind|vinde|vinzi|vanzare|valorific|cumpara|cumpar|achizition\w*)\b/.test(normalized)) intents.add('trade');
  if (!isRobberyQuestion && /\b(magazin|shop)\b/.test(normalized)) intents.add('trade');
  if (
    /\b(?:inventar\w*|ghiozdan|rucsac|kg)\b/.test(normalized) &&
    /\b(?:cat|cate|incap|fac|face|produc\w*|craft\w*)\b/.test(normalized)
  ) {
    intents.add('calculation');
    intents.add('requirements');
    intents.add('recipe');
  }

  return intents;
}

const INTENT_KEYWORDS = new Set([
  'reteta',
  'retete',
  'craft',
  'crafting',
  'fabricare',
  'materiale',
  'ingrediente',
  'unde',
  'locatie',
  'locatii',
  'gps',
  'cp',
  'cod',
  'postal',
  'cat',
  'costa',
  'cost',
  'pret',
  'pretul',
  'care',
  'este',
  'sunt',
  'necesita',
  'trebuie',
  'nevoie',
  'inventar',
  'inventarul',
  'ghiozdan',
  'rucsac',
  'kg',
  'complet',
  'completa',
  'complete',
  'incap'
]);

function getSubjectKeywords(baseKeywords, intents) {
  if (!intents.has('recipe') && !intents.has('location')) return [];
  return baseKeywords.filter((keyword) => !INTENT_KEYWORDS.has(keyword));
}

const INTENT_SECTION_PATTERNS = {
  location: /\b(locatie|locatii|gps|cod postal|postal)\b/,
  price: /\b(pret|preturi|cost|vanzare)\b/,
  requirements: /\b(cerinte|acces|echipament necesar|conditii)\b/,
  rewards: /\b(recompense|loot|capturi|iteme care pot fi obtinute)\b/,
  process: /\b(cum functioneaza|cum incepi|pornirea|flux|pasi)\b/,
  robbery: /\b(jaf|jafuri|robbery|seif|casa de marcat)\b/,
  calculation: /\b(greutate|greutati|calcul|calcule|inventar|kg)\b/,
  recipe: /\b(reteta|retete|craft|crafting|materiale|ingrediente)\b/,
  sanction: /\b(sanctiuni|pedepse|sanctionare)\b/,
  trade: /\b(vanzare|magazin|shop|preturi)\b/
};

function scoreIntentMatch(intents, sectionPrepared, contentPrepared) {
  let score = 0;

  for (const intent of intents) {
    const pattern = INTENT_SECTION_PATTERNS[intent];
    if (!pattern) continue;
    if (pattern.test(sectionPrepared.normalized)) {
      score += 5;
    } else if (pattern.test(contentPrepared.normalized)) {
      score += 1;
    }
  }

  return score;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (error) {
    return {};
  }
}

function buildLearnedSource(row) {
  const metadata = safeJsonParse(row.metadata_json);
  const documentTitle = metadata.documentTitle || row.normalized_topic || `ID ${row.id}`;
  const sectionPath = Array.isArray(metadata.sectionPath) ? metadata.sectionPath.filter(Boolean) : [];
  const sectionTitle = metadata.sectionTitle || sectionPath[sectionPath.length - 1] || '';
  const isWiki = normalizeForSearch(documentTitle).startsWith('wiki pro4kings');
  const wikiLabel = sectionPath.slice(-2).join(' - ');
  const label = isWiki && wikiLabel ? wikiLabel : documentTitle;

  return {
    metadata,
    documentTitle,
    sectionTitle,
    sectionPath,
    sourceLabel: `Knowledge Base: ${label}`,
    sourceDetail: sectionPath.join(' > ') || sectionTitle || documentTitle
  };
}

function normalizeJobName(value) {
  let cleaned = String(value || '')
    .replace(/^side\s+job\s+secret\s*[-:]?\s*/i, '')
    .replace(/^job\s+(?:legal|ilegal)\s*[-:]?\s*/i, '')
    .replace(/^job\s*[-:]?\s*/i, '')
    .replace(/\s+si\s+vanzare\s+petrol$/i, '')
    .trim();

  if (cleaned.includes('/')) cleaned = cleaned.split('/')[0].trim();
  if (/^scafandru ilegal$/i.test(cleaned)) return 'Scafandru';
  if (/^ciupercar$/i.test(cleaned)) return 'Culegator de Ciuperci';
  if (/^droguri$/i.test(cleaned)) return 'Livrator Droguri';
  return cleaned;
}

function extractJobHours(content) {
  const normalized = normalizeForSearch(content);
  const patterns = [
    /\bdisponibil(?:a)? de la (\d+) ore\b/,
    /\bore minime necesare\s*(\d+) ore\b/,
    /\bnecesita (?:aproximativ |minimum |minim )?(\d+)(?: de)? ore\b/,
    /\b(?:are|aiba) minimum (\d+)(?: de)? ore\b/,
    /\bminimum (\d+)(?: de)? ore\b/
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number.parseInt(match[1], 10);
  }

  return null;
}

function getJobIdentity(row) {
  const path = row.sectionPath || [];
  const root = normalizeForSearch(path[0] || '');
  const documentTitle = row.documentTitle || '';
  const documentNormalized = normalizeForSearch(documentTitle);

  if ((root === 'joburi legale' || root === 'joburi ilegale') && path[1]) {
    return {
      name: normalizeJobName(path[1]),
      priority: documentNormalized.startsWith('wiki pro4kings') ? 4 : 3
    };
  }

  const titleMatch = documentTitle.match(/^Job\s+(?:Legal|Ilegal)\s*[-:]\s*(.+)$/i);
  if (titleMatch) return { name: normalizeJobName(titleMatch[1]), priority: 2 };

  if (/^JOBURI LEGALE \(PRO4KINGS\)$/i.test(documentTitle) && path[0]) {
    return { name: normalizeJobName(path[0]), priority: 1 };
  }

  return null;
}

function buildJobHoursCatalog(learnedRows, question) {
  const normalizedQuestion = normalizeForSearch(question);
  const thresholdMatch = normalizedQuestion.match(/\bsub\s+(\d+)\s+(?:de\s+)?ore\b/);
  const beginnerQuestion =
    /\b(incepator|incepatori|jucator nou|jucatori noi|la inceput|sunt nou|nou pe server)\b/.test(normalizedQuestion);

  if (!thresholdMatch && !beginnerQuestion) return null;

  const jobs = new Map();
  for (const row of learnedRows) {
    const identity = getJobIdentity(row);
    const hours = extractJobHours(row.content);
    if (!identity || !Number.isFinite(hours)) continue;

    const key = normalizeForSearch(identity.name);
    const explicitlyForBeginners = /\b(destinat jucatorilor noi|pentru jucatori noi)\b/.test(
      normalizeForSearch(row.content)
    );
    const existing = jobs.get(key);
    if (!existing || identity.priority > existing.priority) {
      jobs.set(key, {
        name: identity.name,
        hours,
        explicitlyForBeginners,
        priority: identity.priority
      });
    }
  }

  let lines;
  let sourceLabel;

  if (thresholdMatch) {
    const threshold = Number.parseInt(thresholdMatch[1], 10);
    const matches = [...jobs.values()]
      .filter((job) => job.hours < threshold)
      .sort((a, b) => a.hours - b.hours || a.name.localeCompare(b.name, 'ro'));
    if (matches.length === 0) return null;

    lines = [
      `# Joburi cu cerinta documentata sub ${threshold} ore`,
      ...matches.map((job) => `- ${job.name}: disponibil de la ${job.hours} ore.`),
      'Sunt incluse doar joburile pentru care pragul de ore este documentat explicit.'
    ];
    sourceLabel = `Knowledge Base: Joburi sub ${threshold} ore`;
  } else {
    const matches = [...jobs.values()]
      .filter((job) => job.explicitlyForBeginners)
      .sort((a, b) => a.hours - b.hours || a.name.localeCompare(b.name, 'ro'));
    const progressionJobs = [...jobs.values()]
      .filter((job) => job.hours > 0 && job.hours <= 150)
      .sort((a, b) => a.hours - b.hours || a.name.localeCompare(b.name, 'ro'));
    if (matches.length === 0) return null;

    lines = [
      '# Joburi documentate pentru incepatori',
      ...matches.map(
        (job) => `- ${job.name}: disponibil de la ${job.hours} ore si descris explicit ca fiind destinat jucatorilor noi.`
      ),
      ...(progressionJobs.length
        ? [
            `Dupa ce acumulezi ore, pragurile documentate urmatoare sunt: ${progressionJobs
              .map((job) => `${job.name} (${job.hours} ore)`)
              .join(', ')}.`
          ]
        : []),
      'Nu exista suficiente date comparative despre castiguri pentru a declara obiectiv un job drept cel mai profitabil.'
    ];
    sourceLabel = 'Knowledge Base: Joburi pentru incepatori';
  }

  return {
    id: `job-hours-${thresholdMatch?.[1] || 'beginner'}`,
    sourceType: 'learned_knowledge',
    source: `learned_knowledge:${thresholdMatch ? 'job-hours' : 'beginner-jobs'}`,
    sourceLabel,
    sourceDetail: 'Catalog generat din cerintele de ore documentate',
    text: lines.join('\n'),
    score: 10_001,
    matchedKeywords: 1,
    matchedConcepts: 1,
    metadata: { generatedFromActiveKnowledge: true }
  };
}

function buildJobCatalog(learnedRows, question) {
  const normalizedQuestion = normalizeForSearch(question);
  const isCatalogQuestion =
    /\b(joburi|joburile)\b/.test(normalizedQuestion) &&
    /\b(care|lista|toate|cunosti|stii|exista|sunt|enumera)\b/.test(normalizedQuestion) &&
    !/\b(ordine|recomand\w*|incepator\w*|nou pe server)\b/.test(normalizedQuestion);
  if (!isCatalogQuestion) return null;

  const jobs = new Map();

  function addJob(name, category, priority) {
    const cleanedName = normalizeJobName(name);
    const key = normalizeForSearch(cleanedName);
    const excluded = new Set(['legale', 'ilegale', 'general', 'hotkeys', 'permis comercial', 'alte joburi observate pe harta']);
    if (!key || excluded.has(key)) return;
    const existing = jobs.get(key);
    if (!existing || priority >= existing.priority) jobs.set(key, { name: cleanedName, category, priority });
  }

  for (const row of learnedRows) {
    const documentTitle = row.documentTitle || '';
    const documentNormalized = normalizeForSearch(documentTitle);
    const path = row.sectionPath || [];
    const root = normalizeForSearch(path[0] || '');

    if ((root === 'joburi legale' || root === 'joburi ilegale') && path.length === 2) {
      const nameSuggestsIllegal = /\bilegal\b/.test(normalizeForSearch(path[1]));
      addJob(path[1], nameSuggestsIllegal || root === 'joburi ilegale' ? 'ilegal' : 'legal', 1);
    }

    if (documentNormalized.includes('joburi legale') && path.length === 1) {
      addJob(path[0], 'legal', 2);
    }

    const legalMatch = documentTitle.match(/^Job\s+Legal\s*[-:]\s*(.+)$/i);
    const illegalMatch = documentTitle.match(/^Job\s+Ilegal\s*[-:]?\s*(.+)$/i);
    const secretMatch = documentTitle.match(/^Side\s+Job\s+Secret\s*[-:]\s*(.+)$/i);
    if (legalMatch) addJob(legalMatch[1], 'legal', 3);
    if (illegalMatch) addJob(illegalMatch[1], 'ilegal', 3);
    if (secretMatch) addJob(secretMatch[1], 'ilegal', 3);
    if (/^Job\s+Scafandru\s+Profesionist$/i.test(documentTitle)) addJob('Scafandru Profesionist', 'special', 3);
  }

  const requestedCategory = /\bilegale\b/.test(normalizedQuestion)
    ? 'ilegal'
    : /\blegale\b/.test(normalizedQuestion)
      ? 'legal'
      : null;
  const groups = {
    legal: [],
    ilegal: [],
    special: []
  };

  for (const job of jobs.values()) {
    if (requestedCategory && job.category !== requestedCategory) continue;
    groups[job.category]?.push(job.name);
  }

  for (const values of Object.values(groups)) values.sort((a, b) => a.localeCompare(b, 'ro'));

  const lines = ['# Catalog joburi cunoscute Pro4Kings'];
  if (groups.legal.length) lines.push(`Joburi legale: ${groups.legal.join(', ')}.`);
  if (groups.ilegal.length) lines.push(`Joburi ilegale: ${groups.ilegal.join(', ')}.`);
  if (groups.special.length) lines.push(`Joburi speciale: ${groups.special.join(', ')}.`);
  if (lines.length === 1) return null;

  return {
    id: 'job-catalog',
    sourceType: 'learned_knowledge',
    source: 'learned_knowledge:job-catalog',
    sourceLabel: 'Knowledge Base: Catalog joburi cunoscute',
    sourceDetail: 'Catalog generat din documentele active',
    text: lines.join('\n'),
    score: 10_000,
    matchedKeywords: 1,
    matchedConcepts: 1,
    metadata: { generatedFromActiveKnowledge: true }
  };
}

async function getCorpus(database) {
  const [learnedRevision, rulesRevision] = await Promise.all([
    database.get(
      `SELECT COUNT(*) AS count, COALESCE(MAX(updated_at), '') AS updated_at
       FROM learned_knowledge WHERE active = 1`
    ),
    database.get(
      `SELECT COUNT(*) AS count, COALESCE(MAX(synced_at), '') AS synced_at
       FROM official_rules WHERE active = 1`
    )
  ]);

  const revision = `${learnedRevision.count}:${learnedRevision.updated_at}|${rulesRevision.count}:${rulesRevision.synced_at}`;
  const cached = corpusCache.get(database);
  if (cached?.revision === revision) return cached.corpus;

  const [learnedRows, ruleRows] = await Promise.all([
    database.all(
      `SELECT id, content, normalized_topic, source_type, knowledge_type, metadata_json
       FROM learned_knowledge
       WHERE active = 1
       ORDER BY updated_at DESC`
    ),
    database.all('SELECT id, name, url, content FROM official_rules WHERE active = 1 ORDER BY synced_at DESC')
  ]);

  const learned = learnedRows.map((row) => {
    const source = buildLearnedSource(row);
    const titleText = `${row.normalized_topic || ''} ${source.documentTitle || ''}`;
    const sectionText = `${source.sectionPath.join(' ')} ${source.sectionTitle || ''}`;
    return {
      ...row,
      ...source,
      contentPrepared: prepareText(row.content),
      titlePrepared: prepareText(`${titleText} ${sectionText}`),
      sectionPrepared: prepareText(sectionText),
      searchablePrepared: prepareText(`${titleText} ${sectionText} ${row.content}`)
    };
  });
  const rules = ruleRows.flatMap((row) =>
    chunkText(row.content, 1200).map((content, chunkIndex) => ({
      ...row,
      content,
      chunkIndex,
      contentPrepared: prepareText(content),
      titlePrepared: prepareText(row.name),
      sectionPrepared: prepareText(row.name),
      searchablePrepared: prepareText(`${row.name} ${content}`)
    }))
  );
  const vocabulary = new Set();
  for (const row of learned) {
    for (const token of row.searchablePrepared.tokens) vocabulary.add(token);
  }
  for (const row of rules) {
    for (const token of row.searchablePrepared.tokens) vocabulary.add(token);
  }

  const corpus = { learned, rules, vocabulary, vocabularyTokens: [...vocabulary] };
  corpusCache.set(database, { revision, corpus });
  return corpus;
}

// Un cuvant care nu apare nicaieri in corpus nu poate discrimina intre documente.
// Formulari romanesti uzuale ("ce se intampla daca...", "ce trebuie sa fiu...")
// aduc astfel de cuvinte, iar daca sunt cerute obligatoriu cautarea returneaza zero
// rezultate si botul refuza o intrebare la care are raspunsul.
function isConceptInCorpus(corpus, concepts) {
  let checkedSingleWord = false;

  for (const keyword of concepts) {
    for (const variant of getKeywordVariants(keyword)) {
      if (variant.value.includes(' ')) continue;
      checkedSingleWord = true;

      if (variant.prefix) {
        if (corpus.vocabularyTokens.some((token) => token.startsWith(variant.value))) return true;
        continue;
      }

      if (corpus.vocabulary.has(variant.value)) return true;
    }
  }

  return !checkedSingleWord;
}

function getRequiredConceptMatches(baseKeywordCount) {
  if (baseKeywordCount <= 1) return 1;
  if (baseKeywordCount === 2) return 2;
  return Math.min(3, Math.ceil(baseKeywordCount * 0.5));
}

function getMinimumCandidateScore(baseKeywordCount) {
  return baseKeywordCount <= 1 ? 1.4 : 2.5;
}

function buildCandidateScore({
  contentPrepared,
  titlePrepared,
  sectionPrepared,
  searchablePrepared,
  baseKeywords,
  baseKeywordCount,
  conceptKeywordCount,
  keywordConcepts,
  subjectKeywordConcepts,
  expandedKeywords,
  intents,
  cayoQuestion,
  fuzzyCache
}) {
  const contentScore = scorePrepared(contentPrepared, expandedKeywords, fuzzyCache);
  const titleScore = scorePrepared(titlePrepared, expandedKeywords, fuzzyCache);
  const matchedConcepts = scoreConceptCoverage(searchablePrepared, keywordConcepts, fuzzyCache);
  const matchedSubjectConcepts = scoreConceptCoverage(searchablePrepared, subjectKeywordConcepts, fuzzyCache);
  const requiredMatches = getRequiredConceptMatches(conceptKeywordCount);
  const requiredSubjectMatches = subjectKeywordConcepts.length > 0 ? 1 : 0;
  const intentScore = scoreIntentMatch(intents, sectionPrepared, contentPrepared);
  const cayoScore = cayoQuestion && /\bcayo(?: perico)?\b/.test(searchablePrepared.normalized) ? 4 : 0;
  const exactSubjectScore =
    baseKeywords.length === 1 &&
    (sectionPrepared.normalized === baseKeywords[0] || sectionPrepared.normalized.endsWith(` ${baseKeywords[0]}`))
      ? 8
      : 0;
  const score = contentScore.score + titleScore.score * 2.5 + intentScore + cayoScore + exactSubjectScore;

  const minimumScore = getMinimumCandidateScore(baseKeywordCount);
  if (matchedConcepts < requiredMatches || matchedSubjectConcepts < requiredSubjectMatches || score < minimumScore) return null;

  return {
    score,
    matchedKeywords: contentScore.matched + titleScore.matched,
    matchedConcepts,
    matchedSubjectConcepts
  };
}

class KeywordSearchProvider extends SearchProvider {
  constructor({ database }) {
    super();
    this.database = database;
  }

  async search(question, options = {}) {
    const limit = options.limit || 10;
    const baseKeywords = extractKeywords(question, 14);
    const expandedKeywords = expandKeywords(baseKeywords);
    const keywordConcepts = baseKeywords.map((keyword) => expandKeywords([keyword]));
    const intents = getQuestionIntents(question);
    const subjectKeywords = getSubjectKeywords(baseKeywords, intents);
    const subjectKeywordConcepts = subjectKeywords.map((keyword) => expandKeywords([keyword]));
    const normalizedQuestion = normalizeForSearch(question);
    const cayoQuestion = /\bcayo(?: perico)?\b/.test(normalizedQuestion);

    if (baseKeywords.length === 0) {
      return { keywords: baseKeywords, expandedKeywords, intents: [...intents], results: [] };
    }

    const corpus = await getCorpus(this.database);

    // Pragul de concepte obligatorii se calculeaza doar pe cuvintele care exista in
    // corpus. Pragul minim de scor ramane legat de numarul initial de cuvinte, ca sa
    // nu devina mai permisiv pentru intrebari fara legatura cu serverul.
    const presentKeywordConcepts = keywordConcepts.filter((concepts) => isConceptInCorpus(corpus, concepts));
    const presentSubjectConcepts = subjectKeywordConcepts.filter((concepts) => isConceptInCorpus(corpus, concepts));
    // Daca niciun cuvant nu exista in corpus nu avem ce relaxa: pastram comportamentul
    // initial, altfel cerinta de concepte ar deveni imposibil de indeplinit.
    const liveKeywordConcepts = presentKeywordConcepts.length > 0 ? presentKeywordConcepts : keywordConcepts;
    const liveSubjectKeywordConcepts =
      presentKeywordConcepts.length > 0 ? presentSubjectConcepts : subjectKeywordConcepts;
    const liveKeywordCount = liveKeywordConcepts.length || baseKeywords.length;

    const candidates = [];
    const fuzzyCache = new Map();
    const jobHoursCatalog = buildJobHoursCatalog(corpus.learned, question);
    if (jobHoursCatalog) candidates.push(jobHoursCatalog);
    const jobCatalog = jobHoursCatalog ? null : buildJobCatalog(corpus.learned, question);
    if (jobCatalog) candidates.push(jobCatalog);

    for (const row of corpus.learned) {
      const scored = buildCandidateScore({
        contentPrepared: row.contentPrepared,
        titlePrepared: row.titlePrepared,
        sectionPrepared: row.sectionPrepared,
        searchablePrepared: row.searchablePrepared,
        baseKeywords,
        baseKeywordCount: baseKeywords.length,
        conceptKeywordCount: liveKeywordCount,
        keywordConcepts: liveKeywordConcepts,
        subjectKeywordConcepts: liveSubjectKeywordConcepts,
        expandedKeywords,
        intents,
        cayoQuestion,
        fuzzyCache
      });
      if (!scored) continue;

      candidates.push({
        id: row.id,
        sourceType: 'learned_knowledge',
        source: `learned_knowledge#${row.id}`,
        sourceLabel: row.sourceLabel,
        sourceDetail: row.sourceDetail,
        text: row.content,
        ...scored,
        metadata: {
          topic: row.normalized_topic,
          knowledgeType: row.knowledge_type,
          sourceType: row.source_type,
          ...row.metadata
        }
      });
    }

    for (const row of corpus.rules) {
      const scored = buildCandidateScore({
        contentPrepared: row.contentPrepared,
        titlePrepared: row.titlePrepared,
        sectionPrepared: row.sectionPrepared,
        searchablePrepared: row.searchablePrepared,
        baseKeywords,
        baseKeywordCount: baseKeywords.length,
        conceptKeywordCount: liveKeywordCount,
        keywordConcepts: liveKeywordConcepts,
        subjectKeywordConcepts: liveSubjectKeywordConcepts,
        expandedKeywords,
        intents,
        cayoQuestion,
        fuzzyCache
      });
      if (!scored) continue;

      candidates.push({
        id: row.id,
        sourceType: 'official_rules',
        source: `official_rules#${row.id} | ${row.name} | ${row.url}`,
        sourceLabel: row.name,
        sourceDetail: row.name,
        text: row.content,
        ...scored,
        metadata: {
          name: row.name,
          url: row.url,
          chunkIndex: row.chunkIndex
        }
      });
    }

    const sorted = candidates.sort(
      (a, b) => b.score - a.score || b.matchedConcepts - a.matchedConcepts || b.matchedKeywords - a.matchedKeywords
    );
    const topScore = sorted[0]?.score || 0;
    const minimumScore = getMinimumCandidateScore(baseKeywords.length);
    const relativeThreshold = baseKeywords.length <= 1
      ? minimumScore
      : topScore >= 10
        ? Math.min(topScore * 0.2, 5)
        : minimumScore;
    const seenText = new Set();
    const results = [];

    for (const candidate of sorted) {
      if (candidate.score < Math.max(minimumScore, relativeThreshold)) continue;
      const dedupeKey = normalizeForSearch(candidate.text);
      if (!dedupeKey || seenText.has(dedupeKey)) continue;
      seenText.add(dedupeKey);
      results.push(candidate);
      if (results.length >= limit) break;
    }

    return {
      keywords: baseKeywords,
      expandedKeywords,
      intents: [...intents],
      results
    };
  }
}

module.exports = {
  KeywordSearchProvider,
  getQuestionIntents,
  scoreText
};
