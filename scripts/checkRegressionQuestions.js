const assert = require('assert/strict');
const { findFixedAnswer } = require('../src/fixedAnswerRouter');
const { buildConversationalSearchQuery } = require('../src/memoryService');

const directCases = [
  { n: 1, q: 'cum speli bani murdari', id: /bani-murdari-metoda/, expected: [/metoda de spalare nu este documentata/i, /nu reprezinta spalare/i] },
  { n: 2, q: 'cate pcp uri poate tine un inventar', id: /inventar-pcp-cere-capacitate/, expected: [/2[,.]10 kg/i, /cate kg libere/i] },
  { n: 3, q: 'cat poate tine un inventar?', id: /inventar-capacitate-maxima/, expected: [/maxima de baza.*nu este documentata/i, /Royale.*75 kg/i] },
  { n: 4, q: 'maximul de kg la inventar?', id: /inventar-capacitate-maxima/, expected: [/0,1 kg pe ora/i] },
  { n: 5, q: 'am facut 7 miliarde într-o zi la barbut', id: /reactie-castig-barbut/, expected: [/7 miliarde/i] },
  { n: 6, q: 'cati bani faci de la jobul de pilot', id: /pilot-castig-nedocumentat/, expected: [/600 de ore/i, /Castigul.*nu este documentat/i] },
  { n: 7, q: '046', id: /cp-046-nedocumentat/, expected: [/CP 046/i] },
  { n: 8, q: 'CP 046 ce sti de el ?', id: /cp-046-nedocumentat/, expected: [/numele locatiei\/NPC-ului/i] },
  { n: 9, q: 'CE AM NEVOIE S AFAC O SITA', id: /reteta-sita/, expected: [/2x Bronz/i, /1x Fier/i, /1x Bustean/i, /1x Trusa de Scule/i, /799.*800/i] },
  { n: 10, q: 'Cu inventar liber de 184 kg,cat pcp fac si ce am nevoie', id: /inventar-pcp/, expected: [/87 retete/i, /348 PCP Neprocesat/i, /261 Acid Lysergic/i, /174 Apa/i, /182[,.]70 kg/i, /1[,.]30 kg/i] },
  { n: 11, q: 'Cu inventar liber de 184 kg, poți face 88 rețete complete de PC', id: /verificare-inventar-pcp/, expected: [/incap \*\*87 retete/i, /nu 88/i, /184[,.]80 kg/i, /0[,.]80 kg/i] },
  { n: 12, q: 'care era reteta pt pcp', id: /reteta-pcp/, expected: [/4 PCP Neprocesat/i, /3 Acid Lysergic/i, /2 Apa/i, /2[,.]10 kg/i] },
  { n: 13, q: 'Cu cat se vinde 1000 tabac', id: /tabac-clarificare/, expected: [/nu este documentat.*pret direct/i, /50 pachete/i, /50\.000\.000\$/i] },
  { n: 14, q: 'Care sunt otravitoare', id: /ciuperci-toxicitate/, expected: [/nu le clasifica drept otravitoare/i, /Amanita Phalloides/i] },
  { n: 15, q: 'bine serif', id: /salut-bine-serif/, expected: [/Bine, serif/i] },
  { n: 16, q: '1000:4 si rezultatul il inmultesti cu 325.000', id: /calcul-aritmetic-inlantuit/, expected: [/250/i, /81\.250\.000/i] },
  { n: 17, q: 'cati bani fac din 1000 de pcp procesat', id: /venit-pcp/, expected: [/81\.250\.000\$/i, /325\.000\.000\$/i, /750 Acid Lysergic/i, /500 Apa/i] },
  { n: 18, q: '1000 de pcp procesat cati bani fac?', id: /venit-pcp/, expected: [/PCP Neprocesat/i, /PCP final/i, /750 Acid Lysergic/i] },
  { n: 19, q: '18x5', id: /calcul-aritmetic-simplu/, expected: [/90/i] },
  { n: 20, q: 'ai idee cat se castiga de la ciuperci?', id: /ciuperci-castiguri/, expected: [/Champignon 115\.000\$/i, /Amanita Muscaria 1\.500\.000\$/i] },
  { n: 21, q: 'poti sa mi spui lucruri legate de ce se intampla in momentul de fata pe server ul de fivem pro4kings?', id: /stare-live-server/, expected: [/nu am telemetrie live/i, /sistem concret/i] },
  { n: 22, q: 'un xenon in general?', id: /xenon-pret-nedocumentat/, expected: [/Xenon Simplu/i, /Xenon Premium/i] },
  { n: 23, q: 'cu cat se vinde un xenon auriu', id: /xenon-auriu/, expected: [/pret.*nu sunt documentate/i] },
  { n: 24, q: 'la 2.592 PCP cati bani fac ?', id: /venit-pcp/, expected: [/842\.400\.000\$/i, /2\.592 x 325\.000/i] },
  { n: 25, q: 'ce fac cu ciupercile pe care le colectez', id: /ciuperci-utilizare/, expected: [/Nicolae, CP 138/i, /Ketamina/i, /Psilocybe/i] },
  { n: 27, q: 'pot sa lucrez ca taxi sau altcv cand sunt in familie?', id: /taxi-in-familie/, expected: [/nu precizeaza/i, /regula actuala/i] },
  { n: 29, q: 'De când sunt în mafie?', id: /vechime-mafie/, expected: [/istoricul rolurilor/i, /nu este acelasi lucru/i] },
  { n: 30, q: 'UNDE GASESC ghita pescaru?', id: /ghita-pescaru/, expected: [/vinzi pestele/i, /codul postal.*nu este documentat/i] },
  { n: 31, q: 'unde vind pesti?', id: /vanzare-pesti/, expected: [/Ghita Pescaru/i] },
  { n: 32, q: 'la ce trebuie vip bronze?', id: /vip-bronze/, expected: [/7 masini/i, /5\.000\.000\$/i, /5 PRO Coins/i, /7,50 EUR/i] },
  { n: 33, q: 'de la cate ore pot spala bani murdari?', id: /bani-murdari-prag/, expected: [/nu este documentat.*prag minim de ore/i] },
  { n: 34, q: 'de la cateore pot spala bani murdari?', id: /bani-murdari-prag/, expected: [/numarul de ore/i] },
  { n: 35, q: 'De la cate ore pot spala bani?', id: /bani-murdari-prag/, expected: [/NPC-ul.*procentul/i] },
  { n: 36, q: 'cum se face kit medical?', id: /trusa-medicala/, expected: [/reteta documentata/i, /5 Bandaje/i, /3 Injectii Adrenalina/i] },
  { n: 37, q: 'cum se face trusa medicala?', id: /trusa-medicala/, expected: [/Trusa de Scule este alt item/i] },
  { n: 38, q: 'oare sa dublez 67 de milioane?', id: /reactie-dublare-barbut/, expected: [/67\.000\.000\$/i, /pregatit sa o pierzi/i] },
  { n: 39, q: 'rosu sau negru?', id: /alegere-rosu-negru/, expected: [/Rosu/i, /nu o garantie/i] },
  { n: 40, q: 'cum se processes drogurile?', id: /procesare-droguri/, expected: [/CP 102/i, /laboratorul de pe Cayo/i, /CP 131/i] },
  { n: 41, q: 'cat costa un stick usb full?', id: /usb-full/, expected: [/800\.000\$.*1\.000\.000\$/i, /doar un reper/i, /25\.000\$/i] },
  { n: 42, q: 'ce pot face de grad ucenic?', id: /grad-ucenic/, expected: [/nu sunt identificate/i, /organizatia/i] },
  { n: 43, q: 'ce pot face de gadu ucenic?', id: /grad-ucenic/, expected: [/lista de permisiuni/i] },
  { n: 44, q: 'job jefuitor de banci', id: /jefuitor-banci/, expected: [/sistem cu progresie/i, /2 Keycard-uri/i, /3 Keycard-uri/i], notExpected: [/Scafandru|Barci/i] },
  { n: 45, q: 'sall cate ore am nevoie pentru jobul tirist?', id: /trucker-ore/, expected: [/25 de ore/i, /Permis Comercial/i, /175\.000\$/i] },
  { n: 46, q: 'ce inseamna no fear?', id: /regula-non-fear/, expected: [/nu simulezi realist frica/i, /120 checkpoint-uri/i] },
  { n: 47, q: 'jefuitori au voie sa jefuiasca membri din mafie?', id: /jaf-membri-mafie/, expected: [/minimum 25 de ore/i, /motiv IC/i, /teritoriul altei familii/i] },
  { n: 49, q: 'Din 2500 câte neprocesate ies?', id: /estimare-pcp-neprocesat/, expected: [/1\.500 PCP Neprocesat/i, /1\.250.*1\.750/is] },
  { n: 50, q: 'Câte rețete complete de amfetamină pot face la 210kg inventar?', id: /inventar-amfetamina/, expected: [/95 retete/i, /209[,.]00 kg/i, /1[,.]00 kg/i, /380 Acid Lysergic/i, /285 Cannabis Sativa/i] },
  { n: 51, q: 'Cate ore trebuie sa am pentru a face scafandru avansat?', id: /scafandru-profesionist/, expected: [/pragul minim de ore nu este documentat/i, /Dorel Adancul/i], notExpected: [/300 de ore|CP 154/i] },
  { n: 52, q: 'cate ore imi trebuie pt scafandru de pe cayo', id: /scafandru-profesionist/, expected: [/Cayo Perico/i, /Ranga/i] },
  { n: 53, q: 'cine este hotomanul ?', id: /hotoman/, expected: [/ID 16436/i] }
];

for (const testCase of directCases) {
  const result = findFixedAnswer(testCase.q);
  assert.ok(result, `Q${testCase.n} nu are raspuns determinist: ${testCase.q}`);
  assert.match(result.id, testCase.id, `Q${testCase.n} a intrat pe ruta ${result.id}`);
  for (const pattern of testCase.expected) {
    assert.match(result.answer, pattern, `Q${testCase.n} nu contine ${pattern}`);
  }
  for (const pattern of testCase.notExpected || []) {
    assert.doesNotMatch(result.answer, pattern, `Q${testCase.n} este contaminata de ${pattern}`);
  }
}

const followUpCases = [
  {
    n: 26,
    question: 'altceva mai ai??',
    rows: [
      { role: 'user', content: 'Ce fac cu ciupercile pe care le colectez?' },
      { role: 'assistant', content: 'Le vinzi pe cele vandabile la Nicolae, CP 138.' }
    ],
    expectedQuery: /ciupercile/i
  },
  {
    n: 28,
    question: 'unde',
    rows: [
      { role: 'user', content: 'Cum fac Mini C4?' },
      { role: 'assistant', content: 'Mini C4 se crafteaza din materialele documentate.' }
    ],
    expectedQuery: /Mini C4/i
  }
];

for (const testCase of followUpCases) {
  const query = buildConversationalSearchQuery(testCase.question, testCase.rows);
  assert.match(query, testCase.expectedQuery, `Q${testCase.n} nu pastreaza subiectul conversatiei.`);
}

const seedRows = [
  { role: 'user', content: 'Din 2500 cate neprocesate ies?' },
  { role: 'assistant', content: 'Din 2.500 seminte ies aproximativ 1.500 PCP Neprocesat.' }
];
const seedFollowUp = 'Și cam cat ar ieși profit min și Max';
const seedQuery = buildConversationalSearchQuery(seedFollowUp, seedRows);
const seedAnswer = findFixedAnswer(seedFollowUp, {
  contextQuestion: seedQuery,
  allowImplicitInventory: true
});
assert.ok(seedAnswer, 'Q48 nu a folosit contextul despre cele 2.500 seminte.');
assert.equal(seedAnswer.id, 'estimare-interval-venit-seminte');
assert.match(seedAnswer.answer, /176\.730\.000\$.*241\.695\.000\$/is);
assert.match(seedAnswer.answer, /158\.730\.000\$.*223\.695\.000\$/is);
assert.match(seedAnswer.answer, /75\.000\.000\$.*100\.000\.000\$/is);

const routingProtections = [
  'Coral Rosu sau Negru?',
  'Ceai negru sau ceai rosu?',
  'cati bani fac din 18x5?',
  'Unde craftez trusa de scule?',
  'Cate ore imi trebuie pentru Miner Avansat?',
  'Cat costa amfetamina daca am inventar de 210 kg?',
  'cum schimb bani in euro?',
  'cum convertesc banii in procoins?',
  'spal masina cu bani',
  'cum resetez xenon?',
  'cum instalez xenon?',
  'Cum fac USB Full?',
  'La ce folosesc USB Full?',
  'Cat dureaza procesarea drogurilor?',
  'Ce recompense are jaful de banci?',
  'Cate ore pentru tirist ilegal?',
  'Unde se pot jefui membrii din mafie?',
  'De unde cumpar kit medical?',
  'Care fructe sunt otravitoare?',
  '46 ore pentru Pilot',
  '046 masini',
  '1000 Tabac uscat cu cat se vinde?',
  'reteta pentru PC'
];
for (const question of routingProtections) {
  assert.equal(findFixedAnswer(question), null, `Ruta determinista a capturat gresit: ${question}`);
}

const rawPcpConversionCases = [
  'Din 1000 PCP Neprocesat cate PCP finale fac?',
  'Din 1000 neprocesate cate PCP fac?'
];
for (const question of rawPcpConversionCases) {
  const answer = findFixedAnswer(question);
  assert.equal(answer?.id, 'cantitate-pcp-din-neprocesat', `Conversia PCP a intrat pe ruta gresita: ${question}`);
  assert.match(answer.answer, /250 PCP final/i);
  assert.match(answer.answer, /750 Acid Lysergic/i);
  assert.match(answer.answer, /500 Apa/i);
  assert.doesNotMatch(answer.answer, /seminte|1\.000 retete/i);
}

const localizedRecipeCases = [
  { question: 'Ce materiale pentru 2.592 PCP?', expectedId: 'cantitate-pcp', expected: /10\.368 PCP Neprocesat/i },
  { question: 'Ce materiale pentru 2 592 PCP?', expectedId: 'cantitate-pcp', expected: /2\.592 retete de PCP/i },
  { question: 'Ce materiale pentru 1.000 amfetamina?', expectedId: 'cantitate-amfetamina', expected: /4\.000 Acid Lysergic/i }
];
for (const testCase of localizedRecipeCases) {
  const answer = findFixedAnswer(testCase.question);
  assert.equal(answer?.id, testCase.expectedId, `Cantitatea localizata a intrat pe ruta gresita: ${testCase.question}`);
  assert.match(answer.answer, testCase.expected);
}

const fractionalPcp = findFixedAnswer('2,5 PCP cati bani fac?');
assert.notEqual(fractionalPcp?.id, 'venit-pcp', 'O cantitate fractionara de iteme PCP a fost rotunjita.');

const pcpCost = findFixedAnswer('Pentru 1000 PCP de cati bani si materiale am nevoie?');
assert.notEqual(pcpCost?.id, 'venit-pcp', 'Costul materialelor PCP a fost confundat cu venitul.');
assert.match(pcpCost?.answer || '', /4\.000 PCP Neprocesat/i);

const inventoryClaim = findFixedAnswer('La 184 kg incap 88 retete PCP.');
assert.equal(inventoryClaim?.id, 'verificare-inventar-pcp');
assert.match(inventoryClaim.answer, /87 retete/i);

const rawPcpRemainder = findFixedAnswer('Din 1001 PCP Neprocesat cati bani fac?');
assert.equal(rawPcpRemainder?.id, 'venit-pcp');
assert.match(rawPcpRemainder.answer, /raman 1 PCP Neprocesat/i);
assert.match(rawPcpRemainder.answer, /750 Acid Lysergic/i);

const tabac500 = findFixedAnswer('Cu cat se vinde 500 Tabac?');
assert.match(tabac500?.answer || '', /25 pachete/i);
assert.match(tabac500?.answer || '', /25\.000\.000\$/i);
const tabac2000 = findFixedAnswer('Cu cat se vinde 2000 Tabac?');
assert.match(tabac2000?.answer || '', /100 pachete/i);
assert.match(tabac2000?.answer || '', /100\.000\.000\$/i);

const latestSeedContext = [
  'Cate PCP fac din 1000 de seminte?',
  'Acum calculeaza pentru 2500 de seminte.',
  'Si cam cat ar iesi profit min si max?'
].join('\n');
const latestSeedAnswer = findFixedAnswer('Si cam cat ar iesi profit min si max?', {
  contextQuestion: latestSeedContext
});
assert.equal(latestSeedAnswer?.id, 'estimare-interval-venit-seminte');
assert.match(latestSeedAnswer.answer, /2\.500 seminte/i);
assert.match(latestSeedAnswer.answer, /176\.730\.000\$/i);

const standaloneCompleteQuestion = 'mai ai voie sa jefuiesti membri din mafie?';
const uncontaminatedQuery = buildConversationalSearchQuery(standaloneCompleteQuestion, [
  { role: 'user', content: 'Cum fac Mini C4?' },
  { role: 'assistant', content: 'Mini C4 se face din materialele documentate.' }
]);
assert.equal(uncontaminatedQuery, standaloneCompleteQuestion, 'O intrebare completa cu „mai ai” a fost tratata ca follow-up.');

assert.equal(findFixedAnswer('am facut 7 miliarde datorie la barbut'), null, 'Replica Barbut a inventat intervalul de o zi.');

// Cererea de gluma trebuie sa fie explicita. Tiparul vechi prindea orice mesaj care
// continea "spune" si "ceva", deci intrebari reale primeau replica cu vulpea.
const jokeRequests = ['Intreaba-ma ceva', 'Pune-mi o intrebare', 'da-mi o intrebare'];
for (const question of jokeRequests) {
  assert.equal(findFixedAnswer(question)?.id, 'pune-intrebare', `Cererea de intrebare nu a fost recunoscuta: ${question}`);
}

const genuineQuestions = [
  'imi poti spune ceva despre vanator',
  'spune-mi ceva despre jaful de la banca',
  'poti sa imi zici ceva despre mafii?'
];
for (const question of genuineQuestions) {
  assert.notEqual(
    findFixedAnswer(question)?.id,
    'pune-intrebare',
    `O intrebare reala a primit replica de gluma: ${question}`
  );
}

console.log(
  `Regression questions OK: ${directCases.length} directe, ${followUpCases.length + 1} continuari, ${routingProtections.length + rawPcpConversionCases.length + localizedRecipeCases.length + jokeRequests.length + genuineQuestions.length + 9} protectii.`
);
