const assert = require('assert/strict');
const { initDatabase } = require('../src/database');
const { buildConversationalSearchQuery } = require('../src/memoryService');
const { findRelevantContext } = require('../src/ragService');
const { listUnansweredQuestions } = require('../src/questionDebugService');
const { commands } = require('../src/commands/registerCommands');
const { findCommunityAnswer } = require('../src/communityAnswers');
const { findDrugAnswer } = require('../src/drugAnswers');
const { findJobAnswer } = require('../src/jobAnswers');

const positiveCases = [
  {
    question: 'Ce este PG si cu ce se sanctioneaza?',
    expected: [/POWER.?GAMING/i, /ADMIN JAIL \(120 CHECKPOINTS\)/i]
  },
  {
    question: 'Unde fac jobul de miner si ce primesc?',
    expected: [/cod postal 331/i, /10\.000\$ si 20\.000\$/i],
    topSource: /Miner/i
  },
  {
    question: 'Cat costa undita la Pescar Nou?',
    expected: [/700\.000\$/i]
  },
  {
    question: 'Care este reteta pentru Mini C4 pe Cayo?',
    expected: [/3x Sulf/i, /5x Fier/i]
  },
  {
    question: 'Cat costa permisul de conducere?',
    expected: [/2\.000\.000\$/i]
  },
  {
    question: 'Unde este Scafandru Profesionist si cine este NPC-ul?',
    expected: [/Dorel Adancul/i, /Cayo Perico/i]
  },
  {
    question: 'La ce foloseste ranga?',
    expected: [/Special Cargo/i, /spargerea lazilor cargo/i],
    topSource: /Scafandru Profesionist/i
  },
  {
    question: 'Ce joburi cunosti?',
    expected: [/Joburi legale:.*Miner/i, /Joburi ilegale:.*Hot de Masini/i],
    topSource: /Catalog joburi/i
  },
  {
    question: 'Cum craftez amfetamina?',
    expected: [/Amfetamina: 370\.000\$/i, /4 Acid Lysergic, 3 Cannabis Sativa, 3 Apa/i],
    topSource: /Retete si preturi/i
  },
  {
    question: 'Ce imi trebuie ca sa craftez morfina?',
    expected: [/Morfina: 550\.000\$/i, /3 Amfetamina, 3 Cannabis Sativa, 2 Apa/i]
  },
  {
    question: 'Unde se crafteaza amfetamina?',
    expected: [/laboratorul de craft de pe Cayo/i, /4 Acid Lysergic, 3 Cannabis Sativa, 3 Apa/i]
  },
  {
    question: 'Cum craftez carligele?',
    expected: [/2x Otel/i, /3x Fier/i, /1x Aur/i]
  },
  {
    question: 'Pentru un ghiozdan de 240 kg, cate retete de PCP pot crafta?',
    expected: [
      /4 PCP Neprocesat, 3 Acid Lysergic, 2 Apa/i,
      /20 kg pentru 100 bucati/i,
      /Apa ocupa 50 kg/i,
      /incap 114 retete complete/i,
      /456 PCP Neprocesat, 342 Acid Lysergic, 228 Apa/i
    ]
  },
  {
    question: 'Am inventar de 119 kg cate retete complete de PCP pot face si ce am nevoie?',
    expected: [
      /4 PCP Neprocesat, 3 Acid Lysergic, 2 Apa/i,
      /Acid Lysergic: 10 kg pentru 100 bucati/i,
      /incap 56 retete complete/i,
      /224 PCP Neprocesat, 168 Acid Lysergic, 112 Apa/i
    ]
  },
  {
    question: 'Am 240 kg. Cate retete complete de amfetamina pot face?',
    expected: [
      /4 Acid Lysergic, 3 Cannabis Sativa, 3 Apa/i,
      /incap 109 retete complete/i,
      /436 Acid Lysergic, 327 Cannabis Sativa, 327 Apa/i
    ]
  },
  {
    question: 'Cum fac rost de momeala?',
    expected: [/Ramele se obtin la cod postal 216/i, /Ramele sunt momeala/i],
    topSource: /Obtinerea momelii/i
  },
  {
    question: 'De unde imi cumpar telefon?',
    expected: [/Magazin Electronice/i, /Telefon Mobil \| 100\.000\$/i]
  },
  {
    question: 'De unde fac rost de sfoara pentru tractarea altor masini?',
    expected: [/Pentru tractare este necesar carlig/i, /sufa, cumparata din magazine/i],
    topSource: /Tractare auto/i
  },
  {
    question: 'Cum se monteaza carligul pe masina?',
    expected: [/carlig instalat\/dezinstalat la mecanici/i],
    topSource: /Tractare auto/i
  },
  {
    question: 'Cum se sparg magazinele?',
    expected: [/La magazine se poate sparge seiful/i, /fura iteme de pe rafturi/i],
    topSource: /Jaf Magazine/i
  },
  {
    question: 'Ce stii despre otel?',
    expected: [/Carlig: 2x Otel/i, /Panza Bomfaier: 1x Fier, 2x Cupru, 1x Otel/i]
  },
  {
    question: 'Ce fac la cod postal 102?',
    expected: [/Plantatie, cod postal 102/i, /unde le planteaza/i],
    topSource: /Culegerea semintelor si plantarea/i
  },
  {
    question: 'Ce am nevoie pentru monezi?',
    expected: [/Moneda Sindicat/i, /6x Fier/i, /5x Platina/i, /7x Aur/i],
    topSource: /Moneda Sindicat/i
  },
  {
    question: 'Unde este hotu de masini?',
    expected: [/Gogu Portiera/i, /codul postal 699/i]
  },
  {
    question: 'Cel mai bun job ca incepator',
    expected: [/Macelar: disponibil de la 0 ore/i, /destinat jucatorilor noi/i],
    topSource: /Joburi pentru incepatori/i
  },
  {
    question: 'Joburi care pot fi facute sub 300 de ore',
    expected: [
      /Macelar: disponibil de la 0 ore/i,
      /Trucker: disponibil de la 25 ore/i,
      /Curatator de strazi: disponibil de la 150 ore/i,
      /Stivuitorist: disponibil de la 150 ore/i,
      /Vatman: disponibil de la 150 ore/i
    ],
    topSource: /Joburi sub 300 ore/i
  },
  {
    question: 'De unde iau rotopercutoare?',
    expected: [/Magazin Ustensile de pe Cayo Perico/i, /pretul nu este documentat momentan/i],
    topSource: /Rotopercutor/i
  },
  {
    question: 'Cum craftez rotopercutor?',
    expected: [/1x Rotopercutor/i, /1x Burghiu/i, /1x Rotopercutor cu Burghiu/i],
    topSource: /Crafting si Shop/i
  },
  {
    question: 'Cine conduce Bratkov?',
    expected: [/Denis Pericol Public/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Ce e condomul?',
    expected: [/caciulita de nelipsit/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Cine a fondat Pro4Kings?',
    expected: [/M1nja/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Da-mi un vers',
    expected: [/Poezie poezie/i, /nu Eminescu/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Intreaba-ma ceva',
    expected: [/Stii ce-a zis vulpea la arici/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Ce i-a zis vulpea ariciului?',
    expected: [/Pleaca-n pula mea de aici/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Ce a spus ariciul vulpii?',
    expected: [/Mama, mama, ce te-as fute/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Da-mi un banc',
    expected: [/FUGI! E alunecare de pamant/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Cine-i Melek?',
    expected: [/Minionul feroce/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Cine este Nentu?',
    expected: [/Baiatul bun la toate/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Cine e Bili?',
    expected: [/Creatorul meu, dar nu Dumnezeu/i],
    topSource: /Intrebari comunitate Bratkov/i
  },
  {
    question: 'Cum functioneaza jobul de catalizatoare?',
    expected: [
      /Ion Golf al IV-lea la codul postal 826/i,
      /Folosesti Panza de Bomfaier pentru a fura catalizatoarele/i,
      /daca reusesti minigame-ul din prima, pastrezi Panza de Bomfaier/i,
      /dezmembra catalizatoarele pentru a obtine diferite minereuri/i
    ],
    topSource: /Hot de Catalizatoare/i
  },
  {
    question: 'Ce imi trebuie pentru jobul de catalizatoare?',
    expected: [/ai nevoie de o Panza de Bomfaier/i, /mai multe Panze de Bomfaier/i],
    topSource: /Hot de Catalizatoare/i
  },
  {
    question: 'Cum craftez panza de bomfaier?',
    expected: [/Panza Bomfaier: 1x Fier, 2x Cupru, 1x Otel/i]
  }
];

const scenarioCases = [
  { question: 'Unde incepe jobul de Miner?', expected: [/cod postal 331/i, /NPC.*rulota/i] },
  { question: 'Ce imi trebuie ca sa lucrez la Miner Avansat?', expected: [/Mini C4/i] },
  { question: 'De unde iau Mini C4?', expected: [/Mini C4 se craft/i, /Cayo Perico/i] },
  { question: 'Unde se craftuieste Moneda Sindicat?', expected: [/Mina, cod postal 331/i] },
  { question: 'Ce materiale imi trebuie pentru o Moneda Sindicat?', expected: [/6x Fier/i, /5x Platina/i, /7x Aur/i] },
  { question: 'Unde gasesc NPC-ul pentru Scafandru Profesionist?', expected: [/Dorel Adancul/i, /primul garaj de barci/i] },
  { question: 'Ce loot poate pica la Scafandru Profesionist?', expected: [/Sulf/i, /Fier Ruginit/i, /Chei Ruginite/i] },
  { question: 'Cat este cooldown-ul la Hot de Masini?', expected: [/300 secunde/i] },
  { question: 'Ce pot primi din Hot de Masini?', expected: [/Bani Murdari/i, /Laptop/i, /Carduri Blank/i] },
  { question: 'Cum resetez butelia de oxigen la Scafandru?', expected: [/Iesi din tura/i, /Intra din nou in tura/i] },
  { question: 'Cum fac o Moneda Sindicat de la zero?', expected: [/Miner normal/i, /6x Fier/i, /5x Platina/i, /7x Aur/i] },
  { question: 'Daca vreau Aur, ce job trebuie sa fac?', expected: [/Miner normal/i, /Aur/i] },
  { question: 'Ce diferenta este intre Miner si Miner Avansat?', expected: [/Miner normal.*Aur/i, /Miner Avansat.*Mini C4/i] },
  { question: 'Pot obtine Platina din Miner Avansat?', expected: [/nu ofera.*Platina/i] },
  { question: 'De unde fac rost de Fier pentru Moneda Sindicat?', expected: [/Miner normal/i, /Fier/i] },
  { question: 'Daca raman fara oxigen in timpul jobului de Scafandru, ce trebuie sa fac?', expected: [/Iesi din tura/i, /Dorel Adancul/i] },
  { question: 'Ce imi trebuie inainte sa ma apuc de Scafandru Profesionist?', expected: [/Ranga/i] },
  { question: 'Care este cel mai bun job pentru bijuterii cu diamante?', expected: [/Hot de Masini/i, /Traficant de Organe/i, /Aurolac/i] },
  { question: 'Ce job imi poate da Monede Sindicat?', expected: [/Hot de Masini/i, /Scafandru Profesionist/i] },
  { question: 'Unde se face Lingoul Cayo?', expected: [/Mina.*CP 331/i] },
  { question: 'Salut, vreau sa ma apuc de minerit. De unde incep?', expected: [/Miner normal/i, /primul NPC.*rulota/i] },
  { question: 'Am Aur, Fier si Platina. Ce pot crafta cu ele?', expected: [/Moneda Sindicat/i, /6x Fier/i, /5x Platina/i, /7x Aur/i] },
  { question: 'Mi s-a terminat oxigenul sub apa. Ce fac acum?', expected: [/Iesi din tura/i, /Intra din nou in tura/i] },
  { question: 'Exista vreun job unde pot gasi laptopuri?', expected: [/Hot de Masini/i, /Laptop/i] },
  { question: 'Cum fac bani daca sunt incepator?', expected: [/Macelar.*0 ore/i] },
  { question: 'Ce job imi recomanzi daca vreau materiale rare?', expected: [/Miner Avansat/i, /Scafandru Profesionist/i] },
  { question: 'Vreau doar minereuri avansate, unde ma duc?', expected: [/Miner Avansat/i, /Carbuni/i] },
  { question: 'Unde gasesc un NPC pentru un job ilegal?', expected: [/Gogu Portiera/i, /Ion Golf al IV-lea/i] },
  { question: 'Ce trebuie sa am in inventar inainte sa merg la Miner Avansat?', expected: [/Mini C4/i] },
  { question: 'Daca vreau sa fac Lingou Cayo, de unde iau toate materialele?', expected: [/Aurul si Bronzul se obtin la Miner normal/i, /apar prin spawn.*Cayo Perico/i] },
  { question: 'Pot face Moneda Sindicat fara sa merg la mina?', expected: [/statia de crafting din Mina/i] },
  { question: 'Daca nu am Ranga, pot face Scafandru Profesionist?', expected: [/Necesita obligatoriu Ranga/i] },
  { question: 'Care job imi ofera cele mai multe tipuri de recompense?', expected: [/Hot de Masini are cea mai larga varietate confirmata/i] },
  { question: 'Daca am nevoie de Aur si Bronz pentru Lingou Cayo, ce job imi recomanzi?', expected: [/Miner normal/i, /Aur.*Bronz/i] },
  { question: 'Daca sunt nou pe server si am doar 50.000$, ce ordine de joburi ar trebui sa urmez?', expected: [/Macelar.*0 ore/i, /Trucker.*25 ore/i] },
  { question: 'Ce trebuie sa craftuiesc inainte sa merg la Miner Avansat?', expected: [/Mini C4/i, /3x Sulf/i, /5x Fier/i] },
  { question: 'Vreau sa fac cat mai multe Monede Sindicat. Care este cea mai eficienta metoda?', expected: [/Miner normal/i, /6x Fier/i, /5x Platina/i, /7x Aur/i] },
  { question: 'Ce materiale sunt folosite atat la Lingou Cayo, cat si la Moneda Sindicat?', expected: [/Materialul comun documentat este Aurul/i] },
  { question: 'Care este diferenta dintre loot-ul de la Hot de Masini si cel de la Scafandru Profesionist?', expected: [/Hot de Masini poate oferi/i, /Scafandru Profesionist poate oferi/i] },
  { question: 'Daca iti spun doar ca vreau diamante, ce activitati imi recomanzi si de ce?', expected: [/Hot de Masini/i, /Traficant de Organe/i, /Aurolac/i] },
  { question: 'De unde iau Placa Antiglonț?', expected: [/apar prin spawn.*Cayo Perico/i, /nu au re.{0,2}ete de crafting/i] },
  { question: 'Cum craftez Schematica Crafting?', expected: [/Schematica Crafting.*nu se craftuie/i] }
];

// Formulari romanesti uzuale in care verbul de legatura ("sa fiu", "se intampla",
// "sa devin", "as vrea sa aflu") nu exista ca subiect in documentatie. Inainte de
// filtrarea cuvintelor fara acoperire in corpus, toate primeau raspunsul de refuz.
const naturalPhrasingCases = [
  { question: 'ce imi trebuie ca sa fiu hacker', expected: /Hacker/i },
  { question: 'ce se intampla daca fac dm', expected: /deathmatch|\bDM\b/i },
  { question: 'ce trebuie sa fac ca sa devin miner', expected: /Miner/i },
  { question: 'mi ar placea sa aflu unde e mina', expected: /331/ },
  { question: 'cum se ajunge la cayo', expected: /Cayo/i },
  { question: 'ce am nevoie sa fiu petrolist', expected: /Petrolist/i },
  { question: 'am nevoie de ajutor cu pescuitul', expected: /pesc/i },
  { question: 'ce se intampla daca fac rk', expected: /revenge|\bRK\b/i },
  { question: 'as vrea sa stiu cum se face mini c4', expected: /Mini C4/i }
];

const negativeCases = [
  'Care e parola sefului?',
  'Cum ajung pe Luna?',
  'Cat costa un elicopter Apache?',
  'Care este capitala Frantei?',
  'Cine a castigat Cupa Mondiala la fotbal?',
  'Ce reteta de ciorba de burta imi recomanzi?'
];

const fixedCommunityCases = [
  {
    question: 'Cine este liderul principal Bratkov?',
    expected: 'Hmm, eu il stiu drept Denis Pericol Public, dar intre noi fie vorba, mai periculoase sunt "perlele" ce-i pot scapa pe gura decat el in sine 😉'
  },
  { question: 'Ce e condomul?', expected: 'Prezervativul este caciulita de nelipsit a oricarui baiat.' },
  { question: 'Cine a fondat Pro4Kings?', expected: 'I se spune M1nja, mai multe fapte decat vorbe.' },
  { question: 'Da-mi un vers', expected: 'Poezie poezie / Putza mea e de hartie. Sper ca esti multumit, sunt un bot, nu Eminescu. 💪🏻' },
  { question: 'Intreaba-ma ceva', expected: "Stii ce-a zis vulpea la arici?" },
  { question: "Ce i-a zis vulpea ariciului?", expected: 'Pleaca-n pula mea de aici.' },
  { question: 'Ce a spus ariciul vulpii?', expected: "Mama, mama, ce te-as fute 😈" },
  { question: 'Da-mi un banc', expected: 'Daca vine muntele la tine si tu nu esti Mohamed... FUGI! E alunecare de pamant!' },
  { question: 'Cine-i Melek?', expected: 'Minionul feroce al familiei Bratkov. Cand se enerveaza, sperie si ciorile, chiar daca nu ajunge la inaltimea lor.' },
  { question: 'Cine este Nentu?', expected: 'Baiatul bun la toate, vrei resurse? El gaseste. Vrei sa stii cum se face un job? Te duce acolo. Vrei sa te ajute intr-o bataie? El fuge primul.' },
  { question: 'Cine este Bili?', expected: 'Creatorul meu, dar nu Dumnezeu, sa ne intelegem. N-am ce sa spun rau de el... CA MA INCHIDE. 🥺' },
  { question: 'cine este hotomanul ?', expected: /Hotomanul.*ID 16436/i }
];

const fixedDrugCases = [
  {
    question: 'De unde culeg frunze de coca?',
    expected: /strict de pe Insula Cayo.*Nu se obtin din seminte/i
  },
  {
    question: 'Cat timp dureaza sa strang materialele pentru coca?',
    expected: /Nu exista un timp total fix documentat.*30 de secunde/i
  },
  {
    question: 'E mai profitabil DMT avand in vedere costul materialelor?',
    expected: /1\.550\.000\$.*85\.000\$.*marja este mica/i
  },
  {
    question: 'Cat costa fiecare drog procesat in parte?',
    expected: /PCP: 325\.000\$.*DMT: 1\.550\.000\$.*Subutex: 550\.000\$/is
  },
  {
    question: 'Ce stii despre iarba?',
    expected: /8x Cannabis Sativa.*250\.000\$/i
  },
  {
    question: 'Cate PCP fac din 10.000 de seminte?',
    expected: /6\.500 Acid Lysergic.*6\.000 PCP Neprocesat.*1\.500 retete de PCP/i
  },
  {
    question: 'Cati bani poti face din 18.000 seminte?',
    expected: /2\.700 PCP.*900 Amfetamina.*1\.192 Marijuana.*1\.508\.500\.000\$.*1\.490\.500\.000\$/is
  }
];

const inventoryCalculationCases = [
  {
    question: 'Câte rețete complete de amfetamină pot face la 210kg inventar?',
    expected: [
      /95 (?:de )?re(?:t|\u021b)ete complete/i,
      /2[,.]20 kg/i,
      /209[,.]00 kg (?:folosite|ocupa(?:te)?)/i,
      /1[,.]00 kg (?:liber|ramas)/i,
      /380 Acid Lysergic/i,
      /285 Cannabis Sativa/i,
      /285 Ap(?:a|\u0103)/i
    ]
  },
  {
    question: 'Cate retete complete de amfetamina pot face la 210 kg inventar?',
    expected: [
      /95 (?:de )?retete complete/i,
      /209[,.]00 kg (?:folosite|ocupa(?:te)?)/i,
      /1[,.]00 kg (?:liber|ramas)/i
    ]
  },
  {
    question: 'Cate retete complete de amfetamina pot face la 48,4 kg inventar?',
    expected: [
      /22 (?:de )?retete complete/i,
      /48[,.]40 kg (?:folosite|ocupa(?:te)?)/i,
      /0[,.]00 kg (?:liber|ramas)/i,
      /88 Acid Lysergic/i,
      /66 Cannabis Sativa/i,
      /66 Apa/i
    ]
  },
  {
    question: 'Cate retete complete de amfetamina pot face la 209 kg inventar?',
    expected: [
      /95 (?:de )?retete complete/i,
      /209[,.]00 kg (?:folosite|ocupa(?:te)?)/i,
      /0[,.]00 kg (?:liber|ramas)/i,
      /380 Acid Lysergic/i,
      /285 Cannabis Sativa/i,
      /285 Apa/i
    ]
  }
];

const diverHoursCases = [
  {
    question: 'Cate ore trebuie sa am pentru a face scafandru avansat?',
    expected: [/Scafandru Profesionist/i, /Cayo(?: Perico)?/i, /Dorel Ad[aâ]ncul/i, /Ranga/i, /pragul minim de ore nu este documentat/i],
    notExpected: [/300\s*(?:de\s+)?ore/i, /Tamponel Pescarul/i, /(?:CP|cod(?:ul)? postal)\s*154/i, /Aparat de Sudura/i, /ticket Mafie/i]
  },
  {
    question: 'cate ore imi trebuie pt scafandru de pe cayo',
    expected: [/Scafandru Profesionist/i, /Cayo(?: Perico)?/i, /Dorel Ad[aâ]ncul/i, /Ranga/i, /pragul minim de ore nu este documentat/i],
    notExpected: [/300\s*(?:de\s+)?ore/i, /Tamponel Pescarul/i, /(?:CP|cod(?:ul)? postal)\s*154/i, /Aparat de Sudura/i, /ticket Mafie/i]
  }
];

const unrelatedJobHoursCases = [
  'Cate ore imi trebuie pentru Miner Avansat?',
  'Cate ore pentru un constructor profesionist?',
  'Cate ore trebuie pentru Cayo?',
  'Cate ore pentru Vanator ilegal?',
  'Cate ore este valabil ticketul la scafandru ilegal?',
  'Cate ore dureaza o tura de Scafandru Profesionist?'
];

const nonInventoryDrugCases = [
  'Cat costa amfetamina daca am inventar de 210 kg?',
  'Unde craftez amfetamina cu inventar de 210 kg?'
];

async function run() {
  await initDatabase();
  const startedAt = Date.now();
  assert.ok(commands.some((command) => command.name === 'intrebari'), 'Comanda /intrebari nu este inregistrata.');
  assert.ok(Array.isArray(await listUnansweredQuestions(1)), 'Debug-ul intrebarilor nu returneaza o lista.');

  for (const testCase of fixedCommunityCases) {
    const answer = findCommunityAnswer(testCase.question);
    assert.ok(answer, `Replica fixa nu a fost recunoscuta: ${testCase.question}`);
    if (testCase.expected instanceof RegExp) {
      assert.match(answer.answer, testCase.expected, `Replica fixa este gresita: ${testCase.question}`);
    } else {
      assert.equal(answer.answer, testCase.expected, `Replica fixa a fost modificata: ${testCase.question}`);
    }
  }

  for (const testCase of fixedDrugCases) {
    const answer = findDrugAnswer(testCase.question);
    assert.ok(answer, `Raspunsul fix despre droguri nu a fost recunoscut: ${testCase.question}`);
    assert.match(answer.answer, testCase.expected, `Raspunsul despre droguri este gresit: ${testCase.question}`);
  }

  for (const testCase of inventoryCalculationCases) {
    const answer = findDrugAnswer(testCase.question);
    assert.ok(answer, `Calculul determinist de inventar nu a recunoscut: ${testCase.question}`);
    for (const pattern of testCase.expected) {
      assert.match(answer.answer, pattern, `Calculul de inventar nu contine ${pattern} pentru: ${testCase.question}`);
    }
  }

  const allPositiveCases = [...positiveCases, ...scenarioCases];
  for (const testCase of allPositiveCases) {
    const result = await findRelevantContext(testCase.question);
    assert.equal(result.found, true, `Nu s-a gasit context pentru: ${testCase.question}`);
    for (const pattern of testCase.expected) {
      assert.match(result.context, pattern, `Lipseste ${pattern} pentru: ${testCase.question}`);
    }
    if (testCase.topSource) {
      assert.match(result.results[0]?.sourceLabel || '', testCase.topSource, `Sursa principala gresita pentru: ${testCase.question}`);
    }
  }

  for (const testCase of diverHoursCases) {
    const answer = findJobAnswer(testCase.question);
    assert.ok(answer, `Raspunsul determinist despre job nu a recunoscut: ${testCase.question}`);
    for (const pattern of testCase.expected) {
      assert.match(answer.answer, pattern, `Lipseste ${pattern} pentru: ${testCase.question}`);
    }
    for (const pattern of testCase.notExpected) {
      assert.doesNotMatch(answer.answer, pattern, `Raspuns contaminat de ${pattern} pentru: ${testCase.question}`);
    }
  }

  for (const question of unrelatedJobHoursCases) {
    assert.equal(findJobAnswer(question), null, `Routerul Scafandru a capturat gresit: ${question}`);
  }

  for (const question of nonInventoryDrugCases) {
    const answer = findDrugAnswer(question);
    assert.notEqual(answer?.id, 'inventar-amfetamina', `Calculatorul a capturat gresit: ${question}`);
  }

  const requestedPcp = findDrugAnswer('Ce ingrediente iau pentru 8 PCP cu un inventar de 160 kg?');
  assert.ok(requestedPcp, 'Cantitatea explicita de PCP nu a fost recunoscuta.');
  assert.match(requestedPcp.answer, /32 PCP Neprocesat/i);
  assert.match(requestedPcp.answer, /24 Acid Lysergic/i);
  assert.match(requestedPcp.answer, /16 Apa/i);
  assert.match(requestedPcp.answer, /16[,.]80 kg/i);

  for (const testCase of naturalPhrasingCases) {
    const result = await findRelevantContext(testCase.question);
    assert.equal(result.found, true, `Formularea uzuala nu a gasit context: ${testCase.question}`);
    assert.match(
      result.context,
      testCase.expected,
      `Formularea uzuala a gasit alt subiect decat ${testCase.expected}: ${testCase.question}`
    );
  }

  for (const question of negativeCases) {
    const result = await findRelevantContext(question);
    assert.equal(result.found, false, `Rezultat fals pozitiv pentru: ${question}`);
  }

  const memoryRows = [
    { role: 'user', display_name: 'Gabriel', content: 'Cat costa undita la Pescar Nou?' },
    { role: 'assistant', display_name: 'Pro4Kings Intelligence', content: 'Undita costa 700.000$.' }
  ];
  const followUp = 'Si plasa cat costa?';
  const followUpQuery = buildConversationalSearchQuery(followUp, memoryRows);
  const followUpResult = await findRelevantContext(followUpQuery);
  assert.equal(followUpResult.found, true, 'Follow-up-ul conversational nu a gasit context.');
  assert.match(followUpResult.context, /1\.500\.000\$/i, 'Follow-up-ul nu a gasit pretul plasei.');

  const incompleteFollowUp = buildConversationalSearchQuery('Unde il folosesc?', [
    { role: 'user', display_name: 'Gabriel', content: 'Cum fac Mini C4?' },
    { role: 'assistant', display_name: 'Pro4Kings Intelligence', content: 'Mini C4 se craft-eaza din materialele documentate.' }
  ]);
  assert.match(incompleteFollowUp, /Mini C4/i, 'Follow-up-ul incomplet nu a pastrat subiectul conversatiei.');

  const contextualInventory = buildConversationalSearchQuery('reteta inventar de 129 kg', [
    { role: 'user', display_name: 'Hotomanul', content: 'Cate retete de PCP incap?' },
    { role: 'assistant', display_name: 'Pro4Kings Intelligence', content: 'Spune-mi capacitatea inventarului.' }
  ]);
  const contextualInventoryAnswer = findDrugAnswer('reteta inventar de 129 kg', {
    contextQuestion: contextualInventory,
    allowImplicitInventory: true
  });
  assert.ok(contextualInventoryAnswer, 'Calculatorul nu a recuperat drogul din continuarea conversatiei.');
  assert.match(contextualInventoryAnswer.answer, /61 retete complete de PCP/i);
  assert.match(contextualInventoryAnswer.answer, /128[,.]10 kg folosite/i);
  assert.match(contextualInventoryAnswer.answer, /0[,.]90 kg libere/i);

  const mdsMemoryRows = [
    { role: 'user', display_name: 'Trandas', content: 'Ce stii despre anunturile MDS?' },
    {
      role: 'assistant',
      display_name: 'Pro4Kings Intelligence',
      content: 'Daca vrei, iti pot spune cum functioneaza pas cu pas apelul si plata in MDS.'
    }
  ];
  const politeMdsFollowUp = buildConversationalSearchQuery('Chiar te rog sa imi spui', mdsMemoryRows);
  assert.match(politeMdsFollowUp, /anunturile MDS/i, 'Follow-up-ul politicos nu a pastrat subiectul MDS.');

  const contextualMdsFollowUp = buildConversationalSearchQuery(
    'Spune-mi cum functioneaza apelul si plata',
    [
      ...mdsMemoryRows,
      { role: 'user', display_name: 'Trandas', content: 'Chiar te rog sa imi spui' },
      {
        role: 'assistant',
        display_name: 'Pro4Kings Intelligence',
        content: 'Nu am aceasta informatie salvata momentan.'
      }
    ]
  );
  assert.match(contextualMdsFollowUp, /anunturile MDS/i, 'Follow-up-ul contextual nu a pastrat subiectul MDS.');

  const exactAltcevaQuery = buildConversationalSearchQuery('altceva mai ai??', [
    { role: 'user', display_name: 'Griffin', content: 'Ce fac cu ciupercile pe care le colectez?' },
    { role: 'assistant', display_name: 'Pro4Kings Intelligence', content: 'Ciupercile vandabile se duc la Nicolae, CP 138.' }
  ]);
  const exactAltcevaResult = await findRelevantContext(exactAltcevaQuery);
  assert.equal(exactAltcevaResult.found, true, 'Follow-up-ul exact „altceva mai ai?” nu a gasit context.');
  assert.match(exactAltcevaResult.context, /ciuperc/i, 'Follow-up-ul „altceva” a pierdut subiectul ciupercilor.');

  const exactWhereQuery = buildConversationalSearchQuery('unde', [
    { role: 'user', display_name: 'Denis', content: 'Unde este Hotul de Masini?' },
    { role: 'assistant', display_name: 'Pro4Kings Intelligence', content: 'NPC-ul este Gogu Portiera.' }
  ]);
  const exactWhereResult = await findRelevantContext(exactWhereQuery);
  assert.equal(exactWhereResult.found, true, 'Follow-up-ul exact „unde” nu a gasit context.');
  assert.match(exactWhereResult.context, /codul postal 699/i, 'Follow-up-ul „unde” nu a pastrat locatia Hotului de Masini.');

  console.log(
    `RAG checks OK: ${allPositiveCases.length} pozitive, ${naturalPhrasingCases.length} formulari uzuale, ${negativeCases.length} negative, ${fixedCommunityCases.length + fixedDrugCases.length} replici fixe, ${inventoryCalculationCases.length + 1} calcule de inventar, ${diverHoursCases.length} raspunsuri job, ${unrelatedJobHoursCases.length + nonInventoryDrugCases.length} protectii de routing, 7 follow-up-uri (${Date.now() - startedAt}ms).`
  );
}

run().catch((error) => {
  console.error(`RAG checks failed: ${error.message}`);
  process.exit(1);
});
