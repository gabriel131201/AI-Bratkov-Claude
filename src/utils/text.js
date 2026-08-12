const STOP_WORDS = new Set([
  'care',
  'este',
  'sunt',
  'intr',
  'intre',
  'pentru',
  'despre',
  'daca',
  'cand',
  'unde',
  'obtin',
  'iau',
  'lua',
  'rost',
  'sursa',
  'surse',
  'drop',
  'trebuie',
  'trebui',
  'nevoie',
  'necesar',
  'necesare',
  'necesita',
  'necesită',
  'costa',
  'cost',
  'pret',
  'pretul',
  'valoare',
  'locatie',
  'locatia',
  'gasesc',
  'gaseste',
  'ajung',
  'primesc',
  'primeste',
  'recompensa',
  'recompense',
  'obtine',
  'obtinut',
  'lista',
  'toate',
  'tot',
  'exista',
  'spune',
  'spui',
  'spun',
  'spunemi',
  'chiar',
  'arata',
  'detalii',
  'ordine',
  'informatii',
  'stii',
  'sti',
  'stiu',
  'cunosti',
  'poti',
  'poate',
  'putea',
  'putem',
  'puteti',
  'vreau',
  'vrea',
  'vrei',
  // Verbe si formule de politete fara continut tematic. Fara ele, formulari uzuale
  // precum "ce se intampla daca...", "ce trebuie sa fiu..." sau "as vrea sa aflu..."
  // cereau ca documentul sa contina si aceste cuvinte, iar botul refuza raspunsul.
  'intampla',
  'intample',
  'fiu',
  'fii',
  'fie',
  'devin',
  'devii',
  'devina',
  'deveni',
  'placea',
  'aflu',
  'afli',
  'afle',
  'ajunge',
  'ajungi',
  'ajutor',
  // 'ceva' este intentionat pastrat ca termen de cautare: ancoreaza documentul cu
  // intrebarile comunitatii ("Intreaba-ma ceva") si are valoare reala de regasire.
  'cineva',
  'treaba',
  'zica',
  'zice',
  'avea',
  'avem',
  'fel',
  'recomand',
  'recomanzi',
  'recomanda',
  'recomandare',
  'doar',
  'zici',
  'zimi',
  'explica',
  'explicami',
  'raspunde',
  'raspunzi',
  'te',
  'rog',
  'magazin',
  'magazine',
  'magazinul',
  'magazinele',
  'cum',
  'ce',
  'cat',
  'cate',
  'reteta',
  'retete',
  'craft',
  'crafting',
  'craftez',
  'craftezi',
  'crafteaza',
  'craftam',
  'craftati',
  'crafta',
  'craftat',
  'fabric',
  'fabricare',
  'produc',
  'produci',
  'produce',
  'producem',
  'produceti',
  'produs',
  'procesez',
  'procesezi',
  'proceseaza',
  'procesare',
  'functioneaza',
  'functionare',
  'folosesc',
  'folosesti',
  'folosim',
  'folositi',
  'jobul',
  'jobului',
  'cumpar',
  'cumpara',
  'cumparat',
  'achizitionez',
  'achizitionezi',
  'achizitioneaza',
  'montez',
  'montezi',
  'monteaza',
  'montat',
  'instalez',
  'instalezi',
  'instaleaza',
  'instalat',
  'inventar',
  'inventarul',
  'ghiozdan',
  'rucsac',
  'complete',
  'completa',
  'complet',
  'incap',
  'pot',
  'kg',
  'cine',
  'fac',
  'faci',
  'facem',
  'face',
  'dau',
  'altor',
  'urmez',
  'imi',
  'iti',
  'este',
  'ore',
  'mai',
  'sau',
  'dar',
  'de',
  'din',
  'la',
  'pe',
  'cu',
  'in',
  'un',
  'o',
  'si',
  'sa',
  'se',
  'ai',
  'am',
  'are',
  'server',
  'the',
  'and',
  'for',
  'that',
  'with',
  'idee',
  'era',
  'salut',
  'sall',
  'inseamna',
  'momentul',
  'fata',
  'lucruri',
  'legate'
]);

const SYNONYM_GROUPS = [
  ['trucker', 'tir', 'camion', 'transport', 'tirist'],
  ['jaf', 'robbery', 'heist', 'jefuire', 'jefuiesc', 'jefui', 'jefuitor', 'jefuitori', 'sparg', 'sparge', 'spart'],
  ['mafie', 'mafii', 'familie', 'sindicat'],
  ['turf', 'turfs', 'teritoriu', 'teritorii'],
  ['sanctiune', 'sanctioneaza', 'sanctionat', 'sanctionare', 'pedeapsa', 'pedepse', 'punish', 'warn'],
  ['civil', 'civili', 'cetatean'],
  ['job', 'jobul', 'joburi', 'joburile', 'munca', 'serviciu'],
  ['legal', 'legala', 'legale'],
  ['ilegal', 'ilegala', 'ilegale'],
  ['pescar', 'pescuit', 'peste', 'pesti', 'pestele', 'balta'],
  ['curier', 'courier', 'p4k courier', 'livrari'],
  ['constructor', 'santier', 'santierist', 'constructii'],
  ['autobuz', 'bus', 'sofer autobuz'],
  ['ciupercar', 'ciuperci', 'ciuperca', 'culegator ciuperci', 'culegator de ciuperci'],
  ['cayo', 'cayo perico'],
  ['c4', 'mini c4'],
  ['card', 'card de credit', 'card credit'],
  ['momeala', 'rame', 'rama', 'momeli'],
  ['sfoara', 'sufa', 'chinga tractare'],
  ['masina', 'masini', 'vehicul', 'vehicule', 'auto'],
  ['telefon', 'telefon mobil', 'mobil'],
  ['moneda', 'monede', 'monezi', 'moneda sindicat', 'monede sindicat'],
  ['hot', 'hotu', 'hotul', 'hot de masini', 'hot masini'],
  ['pcp neprocesat', 'neprocesat', 'neprocesate'],
  ['lider', 'leader', 'sef', 'conducator', 'lider principal'],
  ['fondator', 'founder', 'a fondat'],
  ['p4k', 'pro4kings'],
  ['prezervativ', 'prezervative', 'condom'],
  ['poezie', 'vers', 'versuri'],
  ['gluma', 'banc', 'joke'],
  ['bani murdari', 'dirty money'],
  ['pret', 'costa', 'cost', 'valoare'],
  ['locatie', 'locatia', 'unde', 'gps', 'cp', 'cod postal'],
  ['reteta', 'retete', 'craft', 'crafting', 'fabricare'],
  ['cerinta', 'cerinte', 'necesita', 'nevoie'],
  ['recompensa', 'recompense', 'loot', 'drop'],
  ['cumpar', 'cumpara', 'cumparat', 'achizitionez'],
  ['vand', 'vind', 'vinde', 'vinzi', 'vanzare', 'valorific'],
  ['castig', 'castiga', 'castigi', 'castiguri', 'profit', 'venit', 'plata'],
  ['colectez', 'colectezi', 'colectare', 'culeg', 'culegi', 'strang', 'strangi'],
  ['foloseste', 'folosit', 'folosita', 'utilizare', 'utilizat'],
  ['miner', 'minerit', 'mina'],
  ['scafandru', 'scufundare', 'scufundari'],
  ['tigara', 'tigari', 'tigarete'],
  ['permis conducere', 'permis auto', 'dmv'],
  ['permis port arma', 'permis arma', 'gun shop'],
  ['pg', 'powergaming', 'power gaming'],
  ['rk', 'revenge kill', 'revenge killing'],
  ['dm', 'deathmatch', 'death match'],
  ['vdm', 'vehicle deathmatch', 'vehicle death match'],
  ['mg', 'metagaming', 'meta gaming'],
  ['mix', 'mixing'],
  ['cop fear', 'copfear'],
  ['fear rp', 'fearrp'],
  ['fail rp', 'fail roleplay', 'failrp'],
  ['rp', 'roleplay', 'role play'],
  ['ic', 'in character'],
  ['ooc', 'out of character']
];

const SYNONYM_MAP = new Map();
const SHORT_KEYWORDS = new Set();

for (const group of SYNONYM_GROUPS) {
  const normalizedGroup = group.map((item) => normalizeForSearch(item)).filter(Boolean);
  for (const item of normalizedGroup) {
    SYNONYM_MAP.set(item, normalizedGroup);
    for (const token of item.split(' ')) {
      if (token.length >= 2 && token.length <= 3) SHORT_KEYWORDS.add(token);
    }
  }
}

function cleanWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripDiscordMentions(text) {
  return String(text || '')
    .replace(/<@!?\d+>/g, '')
    .replace(/<#\d+>/g, '')
    .replace(/<@&\d+>/g, '')
    .trim();
}

function normalizeForSearch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(cate|cati)ore\b/g, '$1 ore')
    .replace(/\bafac\b/g, 'fac')
    .replace(/\bprocesses\b/g, 'procesezi')
    .replace(/\bgadu\b/g, 'gradul')
    .replace(/\baltcv\b/g, 'altceva')
    .replace(/\bsall\b/g, 'salut')
    .replace(/\bpcp\s+uri\b/g, 'pcp')
    // Utilizatorii scriu frecvent 210kg, 300ore sau cp154. Separarea unitatii
    // pastreaza intentia, dar impiedica numarul sa devina un subiect de cautare.
    .replace(/\b(cp|postal)(\d+)\b/g, '$1 $2')
    .replace(/(\d)(kg|ore|ora|minute|minut|secunde|secunda|bucati|buc)\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const normalized = normalizeForSearch(text);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function expandKeywords(keywords) {
  const expanded = new Set();
  const normalizedKeywords = keywords.map((keyword) => normalizeForSearch(keyword)).filter(Boolean);
  const joinedKeywords = normalizedKeywords.join(' ');

  for (const normalized of normalizedKeywords) {
    if (!normalized) continue;

    expanded.add(normalized);

    const direct = SYNONYM_MAP.get(normalized);
    if (direct) {
      for (const synonym of direct) expanded.add(synonym);
    }

  }

  for (const [phrase, synonyms] of SYNONYM_MAP.entries()) {
    if (phrase.includes(' ') && joinedKeywords.includes(phrase)) {
      for (const synonym of synonyms) expanded.add(synonym);
    }
  }

  return [...expanded];
}

function levenshteinDistance(a, b) {
  const left = normalizeForSearch(a);
  const right = normalizeForSearch(b);

  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function fuzzyTokenMatch(keyword, token) {
  const normalizedKeyword = normalizeForSearch(keyword);
  const normalizedToken = normalizeForSearch(token);

  if (normalizedKeyword.length < 5 || normalizedToken.length < 5) return false;
  if (
    (normalizedKeyword === 'banci' && normalizedToken === 'barci') ||
    (normalizedKeyword === 'barci' && normalizedToken === 'banci')
  ) {
    return false;
  }
  if (normalizedKeyword[0] !== normalizedToken[0]) return false;
  const allowed = Math.max(1, Math.floor(Math.max(normalizedKeyword.length, normalizedToken.length) * 0.22));
  if (Math.abs(normalizedKeyword.length - normalizedToken.length) > allowed) return false;
  const distance = levenshteinDistance(normalizedKeyword, normalizedToken);
  return distance <= allowed;
}

function extractKeywords(text, limit = 12) {
  const normalized = normalizeForSearch(text);
  const allowShortHotkeys = normalized.includes('tasta') || normalized.includes('taste') || normalized.includes('hotkey');
  const allowNumbers = /\b(?:cp|postal|cod postal)\s+\d+\b/.test(normalized);
  const isRobberyQuestion = /\b(?:jaf\w*|jefui\w*|robbery|heist|sparg\w*)\b/.test(normalized);
  const counts = new Map();

  for (const word of normalized.split(' ').filter(Boolean)) {
    const isShortHotkey = allowShortHotkeys && /^[a-z0-9]{1,3}$/.test(word);
    const isKnownShortKeyword = SHORT_KEYWORDS.has(word);
    if (/^\d+$/.test(word) && !allowNumbers) continue;
    const keepRobberyShop = isRobberyQuestion && /^magazin/.test(word);
    if ((word.length < 3 && !isShortHotkey && !isKnownShortKeyword) || (STOP_WORDS.has(word) && !keepRobberyShop)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([word]) => word);
}

function guessTopic(text) {
  const keywords = extractKeywords(text, 5);
  if (keywords.length === 0) return 'general';
  return keywords.join(' ');
}

function chunkText(text, maxLength = 1200) {
  const clean = cleanWhitespace(text);
  if (clean.length <= maxLength) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }

      const words = sentence.split(' ');
      let wordChunk = '';
      for (const word of words) {
        if ((wordChunk + ' ' + word).trim().length > maxLength && wordChunk) {
          chunks.push(wordChunk.trim());
          wordChunk = word;
          continue;
        }
        wordChunk = `${wordChunk} ${word}`.trim();
      }

      if (wordChunk) chunks.push(wordChunk.trim());
      continue;
    }

    if ((current + ' ' + sentence).trim().length > maxLength && current) {
      chunks.push(current.trim());
      current = sentence;
      continue;
    }
    current = `${current} ${sentence}`.trim();
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

function normalizeDocumentText(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim();
}

function chunkMarkdown(text, maxLength = 1400, fallbackTitle = 'Knowledge Base') {
  const markdown = normalizeDocumentText(text);
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const firstHeadingIndex = lines.findIndex((line) => /^#{1,6}\s+\S/.test(line.trim()));
  const firstHeading = firstHeadingIndex >= 0 ? lines[firstHeadingIndex].trim().match(/^#{1,6}\s+(.+)$/)?.[1] : '';
  const documentTitle = cleanWhitespace(firstHeading || fallbackTitle);
  const sections = [];
  const headingStack = [];
  let currentPath = [];
  let currentLines = [];

  function flushSection() {
    const body = cleanWhitespace(currentLines.join('\n'));
    currentLines = [];
    if (!body) return;

    const path = currentPath.filter(Boolean);
    const sectionTitle = path[path.length - 1] || documentTitle;
    const prefixParts = [`# ${documentTitle}`];
    if (path.length > 0 && !(path.length === 1 && path[0] === documentTitle)) {
      prefixParts.push(`## ${path.join(' > ')}`);
    }

    const prefix = prefixParts.join('\n');
    const bodyLimit = Math.max(300, maxLength - cleanWhitespace(prefix).length - 1);
    for (const bodyChunk of chunkText(body, bodyLimit)) {
      sections.push({
        content: `${prefix}\n${bodyChunk}`,
        documentTitle,
        sectionTitle,
        sectionPath: path
      });
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.trim().match(/^(#{1,6})\s+(.+)$/);

    if (!headingMatch) {
      currentLines.push(line);
      continue;
    }

    const level = headingMatch[1].length;
    const title = cleanWhitespace(headingMatch[2]);

    if (index === firstHeadingIndex) {
      flushSection();
      currentPath = [];
      continue;
    }

    flushSection();
    headingStack.length = Math.max(0, level - 1);
    headingStack[level - 1] = title;
    currentPath = headingStack.filter(Boolean);
  }

  flushSection();

  if (sections.length > 0) return sections;

  return chunkText(markdown, maxLength).map((content) => ({
    content: `# ${documentTitle}\n${content}`,
    documentTitle,
    sectionTitle: documentTitle,
    sectionPath: []
  }));
}

function splitForDiscord(text, maxLength = 1900) {
  const clean = String(text || '').trim();
  if (clean.length <= maxLength) return [clean];

  const parts = [];
  let remaining = clean;

  while (remaining.length > maxLength) {
    let index = remaining.lastIndexOf('\n', maxLength);
    if (index < maxLength * 0.5) index = remaining.lastIndexOf(' ', maxLength);
    if (index < maxLength * 0.5) index = maxLength;

    parts.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

module.exports = {
  cleanWhitespace,
  stripDiscordMentions,
  normalizeForSearch,
  tokenize,
  extractKeywords,
  expandKeywords,
  fuzzyTokenMatch,
  levenshteinDistance,
  guessTopic,
  chunkMarkdown,
  chunkText,
  splitForDiscord
};
