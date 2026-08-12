const { normalizeForSearch } = require('./utils/text');

const PROFESSIONAL_SOURCE = 'Knowledge Base: Scafandru Profesionist';
const ILLEGAL_SOURCE = 'Knowledge Base: Scafandru ilegal';
const JOB_SOURCE = 'Knowledge Base: Joburi Scafandru';

function asksAboutMinimumHours(question) {
  if (/\b(?:dureaza|durata|valabil|valabila|tura|tură|expira|termina|terminarea)\b/.test(question)) {
    return false;
  }

  return /\b(?:prag(?:ul)?(?: minim)?(?: de ore)?|ore minime|minim(?:um)?\s+\d*\s*ore|de la cate ore|la cate ore|cate ore)\b/.test(
    question
  );
}

function findJobAnswer(question, { contextQuestion = '' } = {}) {
  const normalized = normalizeForSearch(question);
  if (!normalized || !asksAboutMinimumHours(normalized)) return null;
  const normalizedLookup = normalizeForSearch(contextQuestion) || normalized;

  const mentionsScafandru = /\bscafandr\w*\b/.test(normalizedLookup);
  const mentionsDorel = /\bdorel adancul\b/.test(normalizedLookup);
  const mentionsTamponel = /\btamponel pescarul\b/.test(normalizedLookup);
  if (!mentionsScafandru && !mentionsDorel && !mentionsTamponel) return null;

  const mentionsCayo =
    mentionsDorel ||
    (mentionsScafandru && /\b(?:profesionist\w*|avansat\w*|cayo(?: perico)?)\b/.test(normalizedLookup));
  const mentionsIllegal =
    mentionsTamponel ||
    (mentionsScafandru &&
      /\b(?:ilegal\w*|cp\s*154|cod(?:ul)? postal\s*154|postal\s*154)\b/.test(normalizedLookup));

  if (mentionsCayo && !mentionsIllegal) {
    return {
      id: 'scafandru-profesionist-ore',
      source: PROFESSIONAL_SOURCE,
      answer:
        'Pentru Scafandru Profesionist de pe Cayo Perico, numit uneori Scafandru Avansat, pragul minim de ore nu este documentat. Cerinta confirmata este Ranga, iar NPC-ul este Dorel Adancul.'
    };
  }

  if (mentionsIllegal && !mentionsCayo) {
    return {
      id: 'scafandru-ilegal-ore',
      source: ILLEGAL_SOURCE,
      answer:
        'Pentru Scafandrul ilegal de la CP 154 ai nevoie de minimum 300 de ore jucate. NPC-ul este Tamponel Pescarul. Este un job separat de Scafandru Profesionist de pe Cayo.'
    };
  }

  return {
    id: 'scafandru-ore-clarificare',
    source: JOB_SOURCE,
    answer:
      'Exista doua joburi diferite:\n- Scafandru Profesionist / Avansat, pe Cayo Perico: pragul minim de ore nu este documentat; necesita Ranga, iar NPC-ul este Dorel Adancul.\n- Scafandru ilegal, la CP 154: necesita minimum 300 de ore, iar NPC-ul este Tamponel Pescarul.'
  };
}

module.exports = {
  findJobAnswer
};
