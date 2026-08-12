const { normalizeForSearch } = require('./utils/text');

const COMMUNITY_SOURCE = 'Knowledge Base: Intrebari comunitate Bratkov';

// Replicile comunitatii sunt intentionat fixe. Nu sunt trimise la model, pentru
// ca modelul poate reformula chiar si atunci cand contextul gasit este corect.
const COMMUNITY_ANSWERS = [
  {
    id: 'lider-bratkov',
    matches: (question) => hasBoth(question, /\b(?:lider\w*|leader\w*|sef\w*|conduc\w*)\b/, /\bbratkov\b/),
    answer:
      'Hmm, eu il stiu drept Denis Pericol Public, dar intre noi fie vorba, mai periculoase sunt "perlele" ce-i pot scapa pe gura decat el in sine 😉'
  },
  {
    id: 'prezervativ',
    matches: (question) => /\b(?:prezervativ|prezervative|condom|condomul)\b/.test(question),
    answer: 'Prezervativul este caciulita de nelipsit a oricarui baiat.'
  },
  {
    id: 'fondator-p4k',
    matches: (question) =>
      hasBoth(question, /\b(?:fondator|founder|fondat)\b/, /\b(?:p4k|pro4kings)\b/),
    answer: 'I se spune M1nja, mai multe fapte decat vorbe.'
  },
  {
    id: 'poezie',
    matches: (question) => /\b(?:poezie|vers|versuri)\b/.test(question),
    answer: 'Poezie poezie / Putza mea e de hartie. Sper ca esti multumit, sunt un bot, nu Eminescu. 💪🏻'
  },
  {
    id: 'vulpea-la-arici',
    matches: (question) => /\bvulp\w*\b.*\barici\w*\b/.test(question),
    answer: 'Pleaca-n pula mea de aici.'
  },
  {
    id: 'ariciul-la-vulpe',
    matches: (question) => /\barici\w*\b.*\bvulp\w*\b/.test(question),
    answer: "Mama, mama, ce te-as fute 😈"
  },
  {
    id: 'pune-intrebare',
    // Trebuie sa fie o cerere reala de intrebare. Tiparul anterior prindea si
    // "imi poti spune ceva despre vanator", care primea o gluma in loc de raspuns.
    matches: (question) =>
      /\b(?:pune|spune|zi|da|intreaba)\b[^.?!]*\bintrebare\b/.test(question) ||
      /\bintreaba\s+(?:ma|mi)\b/.test(question),
    answer: "Stii ce-a zis vulpea la arici?"
  },
  {
    id: 'gluma',
    matches: (question) => /\b(?:gluma|banc|joke)\b/.test(question),
    answer: 'Daca vine muntele la tine si tu nu esti Mohamed... FUGI! E alunecare de pamant!'
  },
  {
    id: 'melek',
    matches: (question) => /\bmelek\b/.test(question),
    answer: 'Minionul feroce al familiei Bratkov. Cand se enerveaza, sperie si ciorile, chiar daca nu ajunge la inaltimea lor.'
  },
  {
    id: 'nentu',
    matches: (question) => /\bnentu\b/.test(question),
    answer:
      'Baiatul bun la toate, vrei resurse? El gaseste. Vrei sa stii cum se face un job? Te duce acolo. Vrei sa te ajute intr-o bataie? El fuge primul.'
  },
  {
    id: 'bili',
    matches: (question) => /\bbili\b/.test(question),
    answer: 'Creatorul meu, dar nu Dumnezeu, sa ne intelegem. N-am ce sa spun rau de el... CA MA INCHIDE. 🥺'
  },
  {
    id: 'hotoman',
    matches: (question) => /\b(?:hotoman|hotomanul)\b/.test(question),
    answer: 'Hotomanul este jucătorul cu ID 16436.'
  }
];

function hasBoth(question, firstPattern, secondPattern) {
  return firstPattern.test(question) && secondPattern.test(question);
}

function findCommunityAnswer(question) {
  const normalizedQuestion = normalizeForSearch(question);
  if (!normalizedQuestion) return null;

  const match = COMMUNITY_ANSWERS.find((entry) => entry.matches(normalizedQuestion));
  if (!match) return null;

  return {
    id: match.id,
    answer: match.answer,
    source: COMMUNITY_SOURCE
  };
}

module.exports = {
  COMMUNITY_ANSWERS,
  COMMUNITY_SOURCE,
  findCommunityAnswer
};
