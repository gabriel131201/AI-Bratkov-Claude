const { normalizeForSearch } = require('./utils/text');

const UTILITY_SOURCE = 'Calculator determinist si raspuns conversational';
const NUMBER_TOKEN = String.raw`(?:\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+(?:\.\d+)?)`;
const SIMPLE_EXPRESSION_PATTERN = new RegExp(
  String.raw`^([+-]?${NUMBER_TOKEN})\s*([+\-*/x:])\s*([+-]?${NUMBER_TOKEN})$`,
  'i'
);
const CHAINED_EXPRESSION_PATTERN = new RegExp(
  String.raw`^(${NUMBER_TOKEN})\s*:\s*(${NUMBER_TOKEN})\s+(?:si|iar)\s+(?:rezultatul\s+)?(?:il\s+)?inmultesti\s+cu\s+(${NUMBER_TOKEN})$`,
  'i'
);

function normalizeMathText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×·]/g, 'x')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/[?!]+$/g, '')
    .replace(/\.$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRomanianNumber(value) {
  const compact = String(value || '').replace(/\s/g, '');
  if (!compact) return Number.NaN;

  if (compact.includes(',')) {
    return Number.parseFloat(compact.replace(/\./g, '').replace(',', '.'));
  }

  if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(compact)) {
    return Number.parseInt(compact.replace(/\./g, ''), 10);
  }

  return Number.parseFloat(compact);
}

function formatRomanianNumber(value) {
  const normalized = Object.is(value, -0) ? 0 : value;
  return new Intl.NumberFormat('ro-RO', {
    maximumFractionDigits: 6,
    useGrouping: true
  }).format(normalized);
}

function calculate(left, operator, right) {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '*' || operator.toLowerCase() === 'x') return left * right;
  if (operator === '/' || operator === ':') return right === 0 ? null : left / right;
  return null;
}

function formatOperator(operator) {
  if (operator === '*' || operator.toLowerCase() === 'x') return '×';
  if (operator === '/' || operator === ':') return ':';
  return operator;
}

function buildSimpleCalculationAnswer(mathText) {
  const match = mathText.match(SIMPLE_EXPRESSION_PATTERN);
  if (!match) return null;

  const left = parseRomanianNumber(match[1]);
  const right = parseRomanianNumber(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  const result = calculate(left, match[2], right);
  if (result === null) {
    return {
      id: 'calcul-impartire-la-zero',
      source: UTILITY_SOURCE,
      answer: 'Impartirea la zero nu este definita.'
    };
  }
  if (!Number.isFinite(result)) return null;

  return {
    id: 'calcul-aritmetic-simplu',
    source: UTILITY_SOURCE,
    answer: `${formatRomanianNumber(left)} ${formatOperator(match[2])} ${formatRomanianNumber(right)} = **${formatRomanianNumber(result)}**.`
  };
}

function buildChainedCalculationAnswer(mathText) {
  const match = mathText.match(CHAINED_EXPRESSION_PATTERN);
  if (!match) return null;

  const dividend = parseRomanianNumber(match[1]);
  const divisor = parseRomanianNumber(match[2]);
  const multiplier = parseRomanianNumber(match[3]);
  if (![dividend, divisor, multiplier].every(Number.isFinite)) return null;

  if (divisor === 0) {
    return {
      id: 'calcul-impartire-la-zero',
      source: UTILITY_SOURCE,
      answer: 'Impartirea la zero nu este definita.'
    };
  }

  const intermediate = dividend / divisor;
  const result = intermediate * multiplier;
  if (!Number.isFinite(intermediate) || !Number.isFinite(result)) return null;

  return {
    id: 'calcul-aritmetic-inlantuit',
    source: UTILITY_SOURCE,
    answer: `${formatRomanianNumber(dividend)} : ${formatRomanianNumber(divisor)} = ${formatRomanianNumber(intermediate)}; ${formatRomanianNumber(intermediate)} × ${formatRomanianNumber(multiplier)} = **${formatRomanianNumber(result)}**.`
  };
}

function parseDoubleAmount(normalizedQuestion) {
  const match = normalizedQuestion.match(
    /^oare sa dublez ((?:\d+(?: \d{3})*)(?: de)? (?:milioane|miliarde)|\d+(?: \d{3})*)$/
  );
  if (!match) return null;

  const amountMatch = match[1].match(/^(\d+(?: \d{3})*)(?: de)? (milioane|miliarde)$/);
  if (!amountMatch) {
    const amount = Number.parseInt(match[1].replace(/\s/g, ''), 10);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  const base = Number.parseInt(amountMatch[1].replace(/\s/g, ''), 10);
  const scale = amountMatch[2] === 'miliarde' ? 1_000_000_000 : 1_000_000;
  const amount = base * scale;
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function findConversationalAnswer(question) {
  const normalized = normalizeForSearch(question);
  if (!normalized) return null;

  if (/^am facut 7 miliarde(?: de dolari)? intr o zi la barbut$/.test(normalized)) {
    return {
      id: 'reactie-castig-barbut',
      source: UTILITY_SOURCE,
      answer: '7 miliarde intr-o zi la barbut? Ai prins o zi uriasa. Pune castigul deoparte si nu-l risca imediat pe tot.'
    };
  }

  if (/^bine (?:serif|sef)$/.test(normalized)) {
    return {
      id: 'salut-bine-serif',
      source: UTILITY_SOURCE,
      answer: 'Bine, serif!'
    };
  }

  const doubleAmount = parseDoubleAmount(normalized);
  if (doubleAmount !== null) {
    return {
      id: 'reactie-dublare-barbut',
      source: UTILITY_SOURCE,
      answer: `Eu nu as dubla toti cei ${formatRomanianNumber(doubleAmount)}$ dintr-un foc. Pastreaza castigul si joaca doar partea pe care esti pregatit sa o pierzi.`
    };
  }

  if (/^(?:pe )?rosu sau (?:pe )?negru$/.test(normalized)) {
    return {
      id: 'alegere-rosu-negru',
      source: UTILITY_SOURCE,
      answer: 'Rosu. Este doar o alegere la intamplare, nu o garantie.'
    };
  }

  return null;
}

function findUtilityAnswer(question) {
  const mathText = normalizeMathText(question);
  if (!mathText) return null;

  return (
    buildChainedCalculationAnswer(mathText) ||
    buildSimpleCalculationAnswer(mathText) ||
    findConversationalAnswer(question)
  );
}

module.exports = {
  findUtilityAnswer
};
