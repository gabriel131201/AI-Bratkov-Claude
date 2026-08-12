const { normalizeForSearch } = require('./utils/text');

const DRUG_PRICES = [
  ['PCP', '325.000$'],
  ['Amfetamina', '370.000$'],
  ['Marijuana / Joint', '250.000$'],
  ['Cocaina', '650.000$'],
  ['LSD', '525.000$'],
  ['Ulei THC', '455.500$'],
  ['Ketamina', '2.000.000$'],
  ['DMT', '1.550.000$'],
  ['GHB', '600.000$'],
  ['Heroina', '725.000$'],
  ['Metadona', '550.000$'],
  ['Morfina', '550.000$'],
  ['Subutex', '550.000$']
];

const DRUG_SOURCE = 'Knowledge Base: Droguri - retete, preturi si surse Cayo';
const SEED_YIELDS_PER_THOUSAND = {
  acid: 650,
  pcpRaw: 600,
  cannabis: 680,
  variation: 100
};
const DRUG_SALE_PRICES = {
  pcp: 325000,
  amfetamina: 370000,
  marijuana: 250000
};

// Greutatile sunt pastrate in grame, nu ca numere zecimale in kg. Astfel,
// calcule precum 209 / 2,2 nu pierd o reteta din cauza erorilor floating point.
const INVENTORY_RECIPES = [
  {
    id: 'pcp',
    name: 'PCP',
    aliases: ['pcp'],
    ingredients: [
      { name: 'PCP Neprocesat', quantity: 4, gramsPerUnit: 200 },
      { name: 'Acid Lysergic', quantity: 3, gramsPerUnit: 100 },
      { name: 'Apa', quantity: 2, gramsPerUnit: 500 }
    ]
  },
  {
    id: 'amfetamina',
    name: 'Amfetamina',
    aliases: ['amfetamina', 'amfetamine'],
    ingredients: [
      { name: 'Acid Lysergic', quantity: 4, gramsPerUnit: 100 },
      { name: 'Cannabis Sativa', quantity: 3, gramsPerUnit: 100 },
      { name: 'Apa', quantity: 3, gramsPerUnit: 500 }
    ]
  },
  {
    id: 'marijuana',
    name: 'Marijuana',
    aliases: ['marijuana', 'joint', 'iarba'],
    ingredients: [{ name: 'Cannabis Sativa', quantity: 8, gramsPerUnit: 100 }]
  }
];

function hasAny(question, pattern) {
  return pattern.test(question);
}

function extractSeedCount(normalizedQuestion) {
  const matches = [
    ...normalizedQuestion.matchAll(/\b(\d+(?:\s+\d{3})*)\s*(?:de\s+)?seminte\b/g)
  ];
  const match = matches[matches.length - 1];
  if (!match) return null;

  const value = Number.parseInt(match[1].replace(/\s/g, ''), 10);
  return value > 0 ? value : null;
}

function formatAmount(value) {
  return Math.round(value).toLocaleString('ro-RO');
}

function formatMoney(value) {
  return `${Math.round(value).toLocaleString('ro-RO')}$`;
}

function parseLocalizedNumber(value) {
  const compact = String(value || '').replace(/\s/g, '');
  if (!compact) return Number.NaN;

  if (compact.includes(',')) {
    return Number.parseFloat(compact.replace(/\./g, '').replace(',', '.'));
  }

  if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) {
    return Number.parseInt(compact.replace(/\./g, ''), 10);
  }

  return Number.parseFloat(compact);
}

function extractInventoryCapacityKg(question) {
  const matches = [
    ...String(question || '').matchAll(
      /\b(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:de\s+)?kg\b/gi
    )
  ];
  const match = matches[matches.length - 1];
  if (!match) return null;

  const capacityKg = parseLocalizedNumber(match[1]);
  return capacityKg > 0 ? capacityKg : null;
}

function findInventoryRecipe(normalizedQuestion) {
  let latestMatch = null;

  for (const recipe of INVENTORY_RECIPES) {
    for (const alias of recipe.aliases) {
      const matches = [...normalizedQuestion.matchAll(new RegExp(`\\b${alias}\\b`, 'gi'))];
      const position = matches[matches.length - 1]?.index ?? -1;
      if (position >= 0 && (!latestMatch || position > latestMatch.position)) {
        latestMatch = { recipe, position };
      }
    }
  }

  return latestMatch?.recipe || null;
}

function normalizeDrugQuestion(question) {
  let normalized = normalizeForSearch(question).replace(/\bpcp\s+uri\b/g, 'pcp');
  if (
    /\bpc\b/.test(normalized) &&
    /\b(?:inventar\w*|kg)\b/.test(normalized) &&
    /\bretete?\s+complete?\s+(?:de\s+)?pc\b/.test(normalized)
  ) {
    normalized = normalized.replace(/\bpc\b/g, 'pcp');
  }
  return normalized;
}

function formatKg(grams) {
  return (grams / 1000).toFixed(2);
}

function buildInventoryRecipeAnswer(recipe, capacityKg) {
  const capacityGrams = Math.round(capacityKg * 1000);
  const gramsPerRecipe = recipe.ingredients.reduce(
    (total, ingredient) => total + ingredient.quantity * ingredient.gramsPerUnit,
    0
  );
  const completeRecipes = Math.floor(capacityGrams / gramsPerRecipe);
  const usedGrams = completeRecipes * gramsPerRecipe;
  const remainingGrams = capacityGrams - usedGrams;
  const ingredientsPerRecipe = recipe.ingredients
    .map((ingredient) => `${ingredient.quantity} ${ingredient.name}`)
    .join(' + ');
  const materials = recipe.ingredients
    .map((ingredient) => `- ${formatAmount(completeRecipes * ingredient.quantity)} ${ingredient.name}`)
    .join('\n');

  return [
    `La ${capacityKg.toLocaleString('ro-RO')} kg inventar poti face **${formatAmount(completeRecipes)} retete complete de ${recipe.name}**.`,
    '',
    `O reteta: ${ingredientsPerRecipe} = **${formatKg(gramsPerRecipe)} kg**.`,
    `Pentru ${formatAmount(completeRecipes)} retete:`,
    materials,
    '',
    `${formatKg(usedGrams)} kg folosite; ${formatKg(remainingGrams)} kg libere.`
  ].join('\n');
}

function buildInventoryClaimAnswer(recipe, capacityKg, claimedRecipes) {
  const capacityGrams = Math.round(capacityKg * 1000);
  const gramsPerRecipe = recipe.ingredients.reduce(
    (total, ingredient) => total + ingredient.quantity * ingredient.gramsPerUnit,
    0
  );
  const actualRecipes = Math.floor(capacityGrams / gramsPerRecipe);
  const claimedGrams = claimedRecipes * gramsPerRecipe;

  if (claimedRecipes === actualRecipes) {
    return `Calculul este corect: la ${capacityKg.toLocaleString('ro-RO')} kg incap **${formatAmount(actualRecipes)} retete complete de ${recipe.name}**.`;
  }

  const materials = recipe.ingredients
    .map((ingredient) => `${formatAmount(actualRecipes * ingredient.quantity)} ${ingredient.name}`)
    .join(', ');
  const difference = claimedGrams - capacityGrams;
  const correction =
    difference > 0
      ? `${formatAmount(claimedRecipes)} retete ar ocupa ${formatKg(claimedGrams)} kg, deci ar depasi inventarul cu ${formatKg(difference)} kg.`
      : `${formatAmount(claimedRecipes)} retete folosesc doar ${formatKg(claimedGrams)} kg.`;

  return `Corectie: la ${capacityKg.toLocaleString('ro-RO')} kg incap **${formatAmount(actualRecipes)} retete complete de ${recipe.name}**, nu ${formatAmount(claimedRecipes)}. ${correction}\nPentru maximul corect ai nevoie de: ${materials}.`;
}

function normalizeForLocalizedParsing(question) {
  return String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRequestedRecipeCount(question, recipe) {
  const parserText = normalizeForLocalizedParsing(question);
  let latestMatch = null;
  const aliases = [...recipe.aliases];
  if (
    recipe.id === 'pcp' &&
    /\bretete?\s+complete?\s+(?:de\s+)?pc\b/.test(parserText)
  ) {
    aliases.push('pc');
  }

  for (const alias of aliases) {
    const pattern = new RegExp(
      `\\b(\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d+)?|\\d+(?:[.,]\\d+)?)\\s*(?:de\\s+)?(?:retete?\\s*(?:complete?\\s*)?(?:de\\s+)?)?${alias}\\b`,
      'gi'
    );
    const matches = [...parserText.matchAll(pattern)];
    const match = matches[matches.length - 1];
    if (match && (!latestMatch || match.index > latestMatch.index)) latestMatch = match;
  }

  const count = parseLocalizedNumber(latestMatch?.[1]);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

function buildRequestedRecipeAnswer(recipe, recipeCount, capacityKg = null) {
  const gramsPerRecipe = recipe.ingredients.reduce(
    (total, ingredient) => total + ingredient.quantity * ingredient.gramsPerUnit,
    0
  );
  const totalGrams = recipeCount * gramsPerRecipe;
  const materials = recipe.ingredients
    .map((ingredient) => `- ${formatAmount(recipeCount * ingredient.quantity)} ${ingredient.name}`)
    .join('\n');
  const lines = [
    `Pentru **${formatAmount(recipeCount)} retete de ${recipe.name}** ai nevoie de:`,
    materials,
    '',
    `Ingredientele ocupa in total ${formatKg(totalGrams)} kg.`
  ];

  if (capacityKg !== null) {
    const capacityGrams = Math.round(capacityKg * 1000);
    const differenceGrams = capacityGrams - totalGrams;
    lines.push(
      differenceGrams >= 0
        ? `Incap in inventarul de ${capacityKg.toLocaleString('ro-RO')} kg si raman ${formatKg(differenceGrams)} kg libere.`
        : `Nu incap in inventarul de ${capacityKg.toLocaleString('ro-RO')} kg: depasesc limita cu ${formatKg(-differenceGrams)} kg.`
    );
  }

  return lines.join('\n');
}

function asksForDifferentDrugDetail(normalizedQuestion) {
  return /\b(?:cat costa|pret(?:ul|uri)?|valoare|unde|locatie|de unde|cat timp|dureaza|durata|vanzare|vand|bani|castig\w*|profit|venit|incas\w*)\b/.test(
    normalizedQuestion
  );
}

function isInventoryRecipeQuestion(question, normalizedQuestion) {
  if (extractInventoryCapacityKg(question) === null) return false;
  const inventoryPattern = /\b(?:inventar|inventarul|ghiozdan|rucsac)\b/;
  const recipePattern = /\b(?:reteta|retete)\b/;
  const asksForMaximum =
    /\b(?:cat|cate|cati|numar(?:ul)?|maxim)\b/.test(normalizedQuestion) ||
    /\b(?:incap|pot\s+(?:sa\s+)?(?:fac|produce|crafta))\b/.test(normalizedQuestion);
  const recipeForInventory =
    (recipePattern.test(normalizedQuestion) && inventoryPattern.test(normalizedQuestion));
  const terseInventoryRequest =
    inventoryPattern.test(normalizedQuestion) && normalizedQuestion.split(' ').length <= 8;

  return asksForMaximum || recipeForInventory || terseInventoryRequest;
}

function extractPcpAmount(question) {
  const matches = [
    ...String(question || '').matchAll(
      /\b(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:de\s+)?pcp\b/gi
    )
  ];
  const match = matches[matches.length - 1];
  if (!match) return null;
  const amount = parseLocalizedNumber(match[1]);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function extractRawPcpAmount(question) {
  const matches = [
    ...String(question || '').matchAll(
      /\b(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:de\s+)?(?:pcp\s+)?neprocesat\w*\b/gi
    )
  ];
  const match = matches[matches.length - 1];
  if (!match) return null;
  const amount = parseLocalizedNumber(match[1]);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function buildRawPcpConversionAnswer(rawPcpCount) {
  const finalPcp = Math.floor(rawPcpCount / 4);
  const remainingRaw = rawPcpCount - finalPcp * 4;
  return `Din ${formatAmount(rawPcpCount)} PCP Neprocesat poti face **${formatAmount(finalPcp)} PCP final**. Calcul: ${formatAmount(rawPcpCount)} : 4 = ${formatAmount(finalPcp)}${remainingRaw ? `, cu ${formatAmount(remainingRaw)} PCP Neprocesat ramas` : ''}. Pentru reteta completa mai ai nevoie de ${formatAmount(finalPcp * 3)} Acid Lysergic si ${formatAmount(finalPcp * 2)} Apa.`;
}

function buildPcpSaleAnswer(pcpCount, normalizedQuestion) {
  const finalValue = pcpCount * DRUG_SALE_PRICES.pcp;
  const rawCount = Math.floor(pcpCount / 4);
  const rawValue = rawCount * DRUG_SALE_PRICES.pcp;
  const isRaw = /\bneprocesat\w*\b/.test(normalizedQuestion);
  const saysProcessed = /\bprocesat\w*\b/.test(normalizedQuestion) && !isRaw;

  if (isRaw) {
    const remainingRaw = pcpCount - rawCount * 4;
    return `Din ${formatAmount(pcpCount)} PCP Neprocesat poti face **${formatAmount(rawCount)} PCP final** daca ai si ${formatAmount(rawCount * 3)} Acid Lysergic + ${formatAmount(rawCount * 2)} Apa${remainingRaw ? `; raman ${formatAmount(remainingRaw)} PCP Neprocesat` : ''}. La 325.000$ bucata incasezi **${formatMoney(rawValue)} brut**. Calcul: ${formatAmount(rawCount)} x 325.000$ = ${formatMoney(rawValue)}.`;
  }

  if (saysProcessed) {
    return `Formularea „PCP procesat” poate fi inteleasa in doua feluri:\n- daca ai ${formatAmount(pcpCount)} PCP Neprocesat: cu inca ${formatAmount(rawCount * 3)} Acid Lysergic si ${formatAmount(rawCount * 2)} Apa faci ${formatAmount(rawCount)} PCP final si incasezi **${formatMoney(rawValue)} brut**;\n- daca ai deja ${formatAmount(pcpCount)} PCP final: incasezi **${formatMoney(finalValue)} brut**.\nPretul documentat este 325.000$ pentru un PCP final.`;
  }

  return `Pentru ${formatAmount(pcpCount)} PCP final incasezi **${formatMoney(finalValue)} brut**. Calcul: ${formatAmount(pcpCount)} x 325.000$ = ${formatMoney(finalValue)}.`;
}

function buildSingleRecipeAnswer(recipe) {
  const gramsPerRecipe = recipe.ingredients.reduce(
    (total, ingredient) => total + ingredient.quantity * ingredient.gramsPerUnit,
    0
  );
  const ingredients = recipe.ingredients
    .map((ingredient) => `${ingredient.quantity} ${ingredient.name}`)
    .join(' + ');
  const price = DRUG_SALE_PRICES[recipe.id];
  return `Reteta pentru **1 ${recipe.name}** este: ${ingredients}. Ingredientele ocupa ${formatKg(gramsPerRecipe)} kg${price ? `, iar pretul de livrare este ${formatMoney(price)}` : ''}.`;
}

function extractImplicitSeedCount(normalizedQuestion) {
  const direct = extractSeedCount(normalizedQuestion);
  if (direct) return direct;
  const match = normalizedQuestion.match(
    /\bdin\s+(\d+(?:\s+\d{3})?)\s+cate\s+(?:pcp\s+)?neprocesat\w*\s+ies\b/
  );
  if (!match) return null;
  const value = Number.parseInt(match[1].replace(/\s/g, ''), 10);
  return value > 0 ? value : null;
}

function buildRawPcpYieldAnswer(seedCount) {
  const factor = seedCount / 1000;
  const average = SEED_YIELDS_PER_THOUSAND.pcpRaw * factor;
  const variation = SEED_YIELDS_PER_THOUSAND.variation * factor;
  return `Presupunand ca ${formatAmount(seedCount)} reprezinta seminte plantate, ies in medie aproximativ **${formatAmount(average)} PCP Neprocesat**, cu o variatie estimata de circa ${formatAmount(variation)}. Interval orientativ: **${formatAmount(average - variation)}–${formatAmount(average + variation)} PCP Neprocesat**.`;
}

function calculateSeedMix(seedCount, direction) {
  const factor = seedCount / 1000;
  const delta = SEED_YIELDS_PER_THOUSAND.variation * factor * direction;
  let acid = SEED_YIELDS_PER_THOUSAND.acid * factor + delta;
  let pcpRaw = SEED_YIELDS_PER_THOUSAND.pcpRaw * factor + delta;
  let cannabis = SEED_YIELDS_PER_THOUSAND.cannabis * factor + delta;

  const pcp = Math.floor(Math.min(pcpRaw / 4, acid / 3));
  pcpRaw -= pcp * 4;
  acid -= pcp * 3;
  const amfetamina = Math.floor(Math.min(acid / 4, cannabis / 3));
  acid -= amfetamina * 4;
  cannabis -= amfetamina * 3;
  const marijuana = Math.floor(cannabis / 8);

  return {
    pcp,
    amfetamina,
    marijuana,
    gross:
      pcp * DRUG_SALE_PRICES.pcp +
      amfetamina * DRUG_SALE_PRICES.amfetamina +
      marijuana * DRUG_SALE_PRICES.marijuana
  };
}

function buildSeedProfitRangeAnswer(seedCount) {
  const minimum = calculateSeedMix(seedCount, -1);
  const maximum = calculateSeedMix(seedCount, 1);
  const accessCosts = 18000000;
  const seedMarketMinimum = (seedCount / 1000) * 30000000;
  const seedMarketMaximum = (seedCount / 1000) * 40000000;

  return `Presupunand ca vorbim despre ${formatAmount(seedCount)} seminte plantate si ca procesezi materialele in ordinea PCP -> Amfetamina -> Marijuana, venitul brut orientativ este **${formatMoney(minimum.gross)}–${formatMoney(maximum.gross)}**. Dupa taxele documentate de acces (18.000.000$), raman **${formatMoney(minimum.gross - accessCosts)}–${formatMoney(maximum.gross - accessCosts)}**, inainte de costul Apei. Daca intrebarea era despre vanzarea directa a semintelor, reperul de Player Market este **${formatMoney(seedMarketMinimum)}–${formatMoney(seedMarketMaximum)}**.`;
}

function buildSeedYieldAnswer(seedCount) {
  const count = seedCount || 1000;
  const factor = count / 1000;
  const acid = SEED_YIELDS_PER_THOUSAND.acid * factor;
  const pcpRaw = SEED_YIELDS_PER_THOUSAND.pcpRaw * factor;
  const cannabis = SEED_YIELDS_PER_THOUSAND.cannabis * factor;
  const variation = SEED_YIELDS_PER_THOUSAND.variation * factor;
  const pcpRecipes = Math.floor(Math.min(pcpRaw / 4, acid / 3));
  const water = pcpRecipes * 2;

  return `Pentru ${formatAmount(count)} seminte plantate, estimarea este de aproximativ ${formatAmount(acid)} Acid Lysergic, ${formatAmount(pcpRaw)} PCP Neprocesat si ${formatAmount(cannabis)} Cannabis Sativa. Recolta este aleatorie, cu o variatie de circa ±${formatAmount(variation)} pentru fiecare material. Din valorile medii poti face aproximativ ${formatAmount(pcpRecipes)} retete de PCP, daca ai si ${formatAmount(water)} Apa; rezultatul real poate varia.`;
}

function buildSeedProfitAnswer(seedCount) {
  const count = seedCount || 1000;
  const factor = count / 1000;
  let acid = SEED_YIELDS_PER_THOUSAND.acid * factor;
  let pcpRaw = SEED_YIELDS_PER_THOUSAND.pcpRaw * factor;
  let cannabis = SEED_YIELDS_PER_THOUSAND.cannabis * factor;

  const pcp = Math.floor(Math.min(pcpRaw / 4, acid / 3));
  pcpRaw -= pcp * 4;
  acid -= pcp * 3;

  const amfetamina = Math.floor(Math.min(acid / 4, cannabis / 3));
  acid -= amfetamina * 4;
  cannabis -= amfetamina * 3;

  const marijuana = Math.floor(cannabis / 8);
  cannabis -= marijuana * 8;

  const gross =
    pcp * DRUG_SALE_PRICES.pcp +
    amfetamina * DRUG_SALE_PRICES.amfetamina +
    marijuana * DRUG_SALE_PRICES.marijuana;
  const water = pcp * 2 + amfetamina * 3;
  const knownAccessCosts = 18000000;
  const afterKnownAccess = gross - knownAccessCosts;
  const variation = SEED_YIELDS_PER_THOUSAND.variation * factor;

  return `Din ${formatAmount(count)} seminte plantate poti face, pe valorile medii si in ordinea PCP → Amfetamina → Marijuana:\n- ${formatAmount(pcp)} PCP = ${formatAmount(pcp * DRUG_SALE_PRICES.pcp)}$\n- ${formatAmount(amfetamina)} Amfetamina = ${formatAmount(amfetamina * DRUG_SALE_PRICES.amfetamina)}$\n- ${formatAmount(marijuana)} Marijuana = ${formatAmount(marijuana * DRUG_SALE_PRICES.marijuana)}$\n\nVenitul brut estimat este ${formatAmount(gross)}$. Iti trebuie ${formatAmount(water)} Apa. Daca platesti o data taxele documentate pentru Vama, Seminte si Plantatie (18.000.000$ in total), ramai cu aproximativ ${formatAmount(afterKnownAccess)}$ inainte de costul apei. Recolta este aleatorie (circa ±${formatAmount(variation)} la fiecare material), deci suma reala variaza.`;
}

function findDrugAnswer(question, { contextQuestion = '', allowImplicitInventory = false } = {}) {
  const normalized = normalizeDrugQuestion(question);
  if (!normalized) return null;
  const normalizedLookup = normalizeDrugQuestion(contextQuestion) || normalized;

  const inventoryRecipe = findInventoryRecipe(normalizedLookup);
  const asksForDifferentDetail = asksForDifferentDrugDetail(normalized);
  const pcpSaleAmount = /\bpcp\b/.test(normalized) ? extractPcpAmount(question) : null;
  const asksPcpRevenue =
    !/\b(?:costa|costul|ma costa|am nevoie|materiale|ingrediente)\b/.test(normalized) &&
    (/\b(?:castig\w*|incas\w*|profit|venit|valoreaza|vand|vinde)\b/.test(normalized) ||
      /\b(?:cat|cati)\s+bani\b/.test(normalized));
  if (
    pcpSaleAmount &&
    asksPcpRevenue
  ) {
    return {
      id: 'venit-pcp',
      source: DRUG_SOURCE,
      answer: buildPcpSaleAnswer(pcpSaleAmount, normalized)
    };
  }

  const rawPcpAmount = extractRawPcpAmount(question);
  if (
    rawPcpAmount &&
    /\b(?:cate|cat)\b/.test(normalized) &&
    /\bpcp\b/.test(normalized) &&
    /\b(?:fac|face|ies|rezulta|final\w*)\b/.test(normalized)
  ) {
    return {
      id: 'cantitate-pcp-din-neprocesat',
      source: DRUG_SOURCE,
      answer: buildRawPcpConversionAnswer(rawPcpAmount)
    };
  }

  const asksForRecipeQuantity =
    /\bretete?\b/.test(normalized) ||
    /\b(?:ingrediente|materiale)\b/.test(normalized) ||
    /\b(?:ce|cat|cate)\s+(?:imi\s+)?(?:trebuie|nevoie)\b/.test(normalized);
  const requestedRecipeCount = inventoryRecipe && asksForRecipeQuantity
    ? extractRequestedRecipeCount(question, inventoryRecipe)
    : null;
  const capacityKg = extractInventoryCapacityKg(question);
  const isInventoryClaim =
    inventoryRecipe &&
    capacityKg !== null &&
    requestedRecipeCount &&
    /\b(?:(?:poti|pot)\s+(?:sa\s+)?face|incap|ar\s+incapea|ies)\s+\d+\s+(?:de\s+)?retete\b/.test(normalized);
  if (isInventoryClaim) {
    return {
      id: `verificare-inventar-${inventoryRecipe.id}`,
      source: DRUG_SOURCE,
      answer: buildInventoryClaimAnswer(inventoryRecipe, capacityKg, requestedRecipeCount)
    };
  }

  if (
    inventoryRecipe &&
    requestedRecipeCount &&
    (!asksForDifferentDetail || /\b(?:ingrediente|materiale)\b/.test(normalized))
  ) {
    return {
      id: `cantitate-${inventoryRecipe.id}`,
      source: DRUG_SOURCE,
      answer: buildRequestedRecipeAnswer(inventoryRecipe, requestedRecipeCount, capacityKg)
    };
  }

  if (
    inventoryRecipe &&
    !asksForDifferentDetail &&
    (isInventoryRecipeQuestion(question, normalized) ||
      (allowImplicitInventory && extractInventoryCapacityKg(question) !== null))
  ) {
    return {
      id: `inventar-${inventoryRecipe.id}`,
      source: DRUG_SOURCE,
      answer: buildInventoryRecipeAnswer(inventoryRecipe, capacityKg)
    };
  }

  if (
    inventoryRecipe &&
    capacityKg === null &&
    /\b(?:inventar\w*|ghiozdan|rucsac)\b/.test(normalized) &&
    /\b(?:cat|cate|cati|maxim|tine|incap)\b/.test(normalized)
  ) {
    const gramsPerRecipe = inventoryRecipe.ingredients.reduce(
      (total, ingredient) => total + ingredient.quantity * ingredient.gramsPerUnit,
      0
    );
    return {
      id: `inventar-${inventoryRecipe.id}-cere-capacitate`,
      source: DRUG_SOURCE,
      answer: `O reteta completa de ${inventoryRecipe.name} ocupa **${formatKg(gramsPerRecipe)} kg**. Spune-mi cate kg libere are inventarul si calculez imediat numarul de retete si toate materialele. Greutatea unui ${inventoryRecipe.name} final, luat separat, nu este documentata.`
    };
  }

  if (
    inventoryRecipe &&
    /\b(?:reteta|retete|ingrediente|materiale)\b/.test(normalized) &&
    requestedRecipeCount === null
  ) {
    return {
      id: `reteta-${inventoryRecipe.id}`,
      source: DRUG_SOURCE,
      answer: buildSingleRecipeAnswer(inventoryRecipe)
    };
  }

  const asksCocaSource =
    /\b(?:frunze?\s+(?:de\s+)?coca|cocaina\s+alcaloid|alcaloid\s+(?:de\s+)?cocaina)\b/.test(normalized) &&
    hasAny(normalized, /\b(?:unde|de unde|iau|obtin|gasesc|culeg|rost)\b/);
  if (asksCocaSource) {
    return {
      id: 'coca-surse-cayo',
      source: DRUG_SOURCE,
      answer:
        'Frunzele de Coca si Cocaina Alcaloid se obtin strict de pe Insula Cayo, din spawn-uri. Nu se obtin din seminte si nu se planteaza la Plantatie.'
    };
  }

  if (/\b(?:coca|cocaina)\b/.test(normalized) && hasAny(normalized, /\b(?:cat timp|cat dureaza|durata|timp)\b/)) {
    return {
      id: 'coca-timp-materiale',
      source: DRUG_SOURCE,
      answer:
        'Nu exista un timp total fix documentat pentru strans materialele de cocaina: Frunzele de Coca si Cocaina Alcaloid apar ca spawn-uri pe Cayo. Procesarea unei retete de cocaina dureaza 30 de secunde.'
    };
  }

  if (/\bdmt\b/.test(normalized) && hasAny(normalized, /\b(?:merita|profit|profitabil|livrez|livrare)\b/)) {
    return {
      id: 'dmt-profitabilitate',
      source: DRUG_SOURCE,
      answer:
        'DMT se livreaza pentru 1.550.000$. Reteta foloseste 1 Heroina si 2 Amfetamina, care vand separat cu 725.000$ + 740.000$ = 1.465.000$, plus 3 Apa. Diferenta este de 85.000$ inainte de costul apei. Deci nu pot spune ca DMT este mai profitabil net fara pretul apei si timpii de obtinere; ca valoare a produselor procesate, marja este mica.'
    };
  }

  if (
    hasAny(normalized, /\b(?:drog|droguri)\b/) &&
    hasAny(normalized, /\b(?:pret|preturi|costa|cost)\b/) &&
    hasAny(normalized, /\b(?:procesat|procesate|fiecare|toate)\b/)
  ) {
    return {
      id: 'preturi-droguri-procesate',
      source: DRUG_SOURCE,
      answer: `Preturile de livrare pentru drogurile procesate sunt:\n${DRUG_PRICES.map(([name, price]) => `- ${name}: ${price}`).join('\n')}`
    };
  }

  const seedCount = extractImplicitSeedCount(normalizedLookup);
  const asksProfitRange =
    /\b(?:profit|bani|castig\w*|venit)\b/.test(normalized) &&
    /\b(?:min|max|minim|maxim)\b/.test(normalized);
  if (seedCount && asksProfitRange) {
    return {
      id: 'estimare-interval-venit-seminte',
      source: DRUG_SOURCE,
      answer: buildSeedProfitRangeAnswer(seedCount)
    };
  }

  if (
    seedCount &&
    /\bneprocesat\w*\b/.test(normalizedLookup) &&
    /\b(?:cate|cat|ies|rezulta|primesc|obtin)\b/.test(normalized)
  ) {
    return {
      id: 'estimare-pcp-neprocesat-seminte',
      source: DRUG_SOURCE,
      answer: buildRawPcpYieldAnswer(seedCount)
    };
  }

  if (
    /\bseminte\b/.test(normalizedLookup) &&
    hasAny(normalized, /\b(?:bani|profit|profitabil|castig|venit|valoare)\b/)
  ) {
    return {
      id: 'estimare-venit-seminte',
      source: DRUG_SOURCE,
      answer: buildSeedProfitAnswer(seedCount)
    };
  }

  if (
    /\bseminte\b/.test(normalizedLookup) &&
    hasAny(normalizedLookup, /\b(?:pcp|acid|iarba|cannabis|material|cate|cat|calcul|fac|produce|rezulta)\b/)
  ) {
    return {
      id: 'estimare-recolta-seminte',
      source: DRUG_SOURCE,
      answer: buildSeedYieldAnswer(seedCount)
    };
  }

  if (/\b(?:iarba|marijuana|joint)\b/.test(normalized)) {
    return {
      id: 'marijuana',
      source: DRUG_SOURCE,
      answer:
        'Marijuana (Joint) se proceseaza la laboratorul de pe Cayo din 8x Cannabis Sativa si se livreaza pentru 250.000$. Cannabis Sativa se obtine prin ruta de seminte, plantatie si recoltare de pe Cayo.'
    };
  }

  return null;
}

module.exports = {
  DRUG_PRICES,
  DRUG_SOURCE,
  INVENTORY_RECIPES,
  buildInventoryRecipeAnswer,
  buildInventoryClaimAnswer,
  buildRawPcpConversionAnswer,
  buildRequestedRecipeAnswer,
  buildSeedProfitRangeAnswer,
  buildSeedProfitAnswer,
  buildRawPcpYieldAnswer,
  buildSeedYieldAnswer,
  extractInventoryCapacityKg,
  extractRequestedRecipeCount,
  extractSeedCount,
  findDrugAnswer
};
