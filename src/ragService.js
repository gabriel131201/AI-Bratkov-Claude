const { getDatabase } = require('./database');
const { KeywordSearchProvider, getQuestionIntents } = require('./search/KeywordSearchProvider');
const { findJobAnswer } = require('./jobAnswers');
const { expandKeywords, extractKeywords, normalizeForSearch } = require('./utils/text');

const MAX_CONTEXT_LENGTH = 9000;

function buildContext(results) {
  let context = '';
  for (const item of results) {
    const detail = item.sourceDetail && item.sourceDetail !== item.sourceLabel ? ` | Sectiune: ${item.sourceDetail}` : '';
    const next = `[Sursa: ${item.sourceLabel}${detail}]\n${item.text}`;
    if ((context + '\n\n' + next).length > MAX_CONTEXT_LENGTH) break;
    context = `${context}\n\n${next}`.trim();
  }
  return context;
}

function buildSources(results, limit = 4) {
  const sources = [];
  const seen = new Set();

  for (const result of results) {
    if (!result.sourceLabel || seen.has(result.sourceLabel)) continue;
    seen.add(result.sourceLabel);
    sources.push(result.sourceLabel);
    if (sources.length >= limit) break;
  }

  return sources;
}

function buildDeterministicContext(question, fixedAnswer) {
  const sourceLabel = fixedAnswer.source || 'Knowledge Base';
  const keywords = extractKeywords(question, 14);
  const result = {
    id: fixedAnswer.id,
    sourceType: 'deterministic_answer',
    source: fixedAnswer.id,
    sourceLabel,
    sourceDetail: 'Cerinte si dezambiguizare validate',
    text: fixedAnswer.answer,
    score: 100_000,
    matchedKeywords: keywords.length,
    matchedConcepts: keywords.length,
    metadata: { deterministic: true }
  };

  return {
    found: true,
    context: `[Sursa: ${sourceLabel}]\n${fixedAnswer.answer}`,
    keywords,
    expandedKeywords: expandKeywords(keywords),
    intents: [...getQuestionIntents(question)],
    results: [result],
    sources: [sourceLabel],
    topScore: result.score
  };
}

function parseLocalizedNumber(value) {
  return Number.parseFloat(String(value || '').replace(',', '.'));
}

function extractRecipes(results) {
  const recipes = [];
  const pattern = /(?:^|\s-\s)([^:;]{2,60}):\s*(?:[\d.]+\$;\s*)?reteta:\s*(.*?)(?=\.\s+-\s|$)/gi;

  for (const result of results) {
    for (const match of String(result.text || '').matchAll(pattern)) {
      const ingredients = match[2]
        .split(',')
        .map((part) => part.trim().match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/))
        .filter(Boolean)
        .map((ingredient) => ({
          quantity: parseLocalizedNumber(ingredient[1]),
          name: ingredient[2].trim()
        }));

      if (ingredients.length > 0) recipes.push({ name: match[1].trim(), ingredients });
    }
  }

  return recipes;
}

function extractItemWeights(results) {
  const weights = new Map();
  const standardPattern = /(?:^|\s-\s)([^:]{2,60}):\s*(\d+(?:[.,]\d+)?)\s*kg\s+pentru\s+(\d+(?:[.,]\d+)?)\s+bucati/gi;
  const waterPattern = /\bApa\s+ocupa\s+(\d+(?:[.,]\d+)?)\s*kg\s+pentru\s+(\d+(?:[.,]\d+)?)\s+bucati/gi;

  for (const result of results) {
    const text = String(result.text || '');
    for (const match of text.matchAll(standardPattern)) {
      const totalKg = parseLocalizedNumber(match[2]);
      const units = parseLocalizedNumber(match[3]);
      if (totalKg > 0 && units > 0) weights.set(normalizeForSearch(match[1]), totalKg / units);
    }
    for (const match of text.matchAll(waterPattern)) {
      const totalKg = parseLocalizedNumber(match[1]);
      const units = parseLocalizedNumber(match[2]);
      if (totalKg > 0 && units > 0) weights.set('apa', totalKg / units);
    }
  }

  return weights;
}

function buildInventoryCalculation(question, results) {
  const capacityMatch = String(question || '').match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!capacityMatch) return '';

  const capacityKg = parseLocalizedNumber(capacityMatch[1]);
  if (!(capacityKg > 0)) return '';

  const normalizedQuestion = normalizeForSearch(question);
  const recipe = extractRecipes(results).find((candidate) => {
    const normalizedName = normalizeForSearch(candidate.name);
    return normalizedName && normalizedQuestion.includes(normalizedName);
  });
  if (!recipe) return '';

  const weights = extractItemWeights(results);
  const weightedIngredients = recipe.ingredients.map((ingredient) => ({
    ...ingredient,
    kgPerUnit: weights.get(normalizeForSearch(ingredient.name))
  }));
  if (weightedIngredients.some((ingredient) => !(ingredient.kgPerUnit > 0))) return '';

  const kgPerRecipe = weightedIngredients.reduce(
    (total, ingredient) => total + ingredient.quantity * ingredient.kgPerUnit,
    0
  );
  if (!(kgPerRecipe > 0)) return '';

  const precisionScale = 1_000_000;
  const capacityUnits = Math.round(capacityKg * precisionScale);
  const recipeUnits = Math.round(kgPerRecipe * precisionScale);
  const completeRecipes = Math.floor(capacityUnits / recipeUnits);
  const usedKg = (completeRecipes * recipeUnits) / precisionScale;
  const remainingKg = Math.max(0, (capacityUnits - completeRecipes * recipeUnits) / precisionScale);
  const materials = weightedIngredients
    .map((ingredient) => `${completeRecipes * ingredient.quantity} ${ingredient.name}`)
    .join(', ');

  return [
    '[Calcul determinist derivat exclusiv din reteta si greutatile recuperate]',
    'Calculul presupune ca intreaga capacitate este libera si este umpluta exact in proportiile retetei.',
    `${recipe.name}: o reteta ocupa ${kgPerRecipe.toFixed(2)} kg.`,
    `La o capacitate de ${capacityKg.toFixed(2)} kg incap ${completeRecipes} retete complete (${usedKg.toFixed(2)} kg folosite, ${remainingKg.toFixed(2)} kg libere).`,
    `Materiale pentru ${completeRecipes} retete: ${materials}.`
  ].join('\n');
}

function isInventoryCalculationQuestion(question) {
  const normalizedQuestion = normalizeForSearch(question);
  return /\b\d+(?:[.,]\d+)?\s*kg\b/i.test(question) && /\b(?:cat|cate|incap|fac|face|produc)\b/.test(normalizedQuestion);
}

function mergeUniqueResults(...resultGroups) {
  const seen = new Set();
  const merged = [];

  for (const group of resultGroups) {
    for (const result of group || []) {
      const key = `${result.source || ''}:${result.id || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
    }
  }

  return merged;
}

async function findRelevantContext(question, options = {}) {
  const fixedJobAnswer = findJobAnswer(question);
  if (fixedJobAnswer) return buildDeterministicContext(question, fixedJobAnswer);

  const database = await getDatabase();
  const provider = new KeywordSearchProvider({ database });
  const search = await provider.search(question, { limit: options.limit || 10 });

  const calculationSearch = isInventoryCalculationQuestion(question)
    ? await provider.search('greutati materiale apa cannabis sativa pcp neprocesat acid lysergic', { limit: 10 })
    : null;
  const calculationResults = mergeUniqueResults(search.results, calculationSearch?.results);

  if (search.keywords.length === 0 || calculationResults.length === 0) {
    return {
      found: false,
      context: '',
      keywords: search.keywords,
      expandedKeywords: search.expandedKeywords,
      intents: search.intents,
      results: []
    };
  }

  const retrievedResults = search.results.length > 0 ? search.results : calculationResults;
  const retrievedContext = buildContext(retrievedResults);
  const inventoryCalculation = buildInventoryCalculation(question, calculationResults);
  const context = inventoryCalculation
    ? `${inventoryCalculation}\n\n${retrievedContext}`.slice(0, MAX_CONTEXT_LENGTH)
    : retrievedContext;

  return {
    found: context.length > 0,
    context,
    keywords: search.keywords,
    expandedKeywords: search.expandedKeywords,
    intents: search.intents,
    results: retrievedResults,
    sources: buildSources(retrievedResults),
    topScore: retrievedResults[0]?.score || 0
  };
}

module.exports = {
  buildInventoryCalculation,
  isInventoryCalculationQuestion,
  findRelevantContext
};
