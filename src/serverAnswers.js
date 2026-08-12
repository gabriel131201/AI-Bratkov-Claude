const { normalizeForSearch } = require('./utils/text');

const SOURCES = {
  audit: 'Knowledge Base: Audit intrebari 09.08.2026',
  crafting: 'Knowledge Base: Crafting si locatii',
  drugs: 'Knowledge Base: Droguri - flux complet',
  economy: 'Knowledge Base: Economie si Player Market',
  fishing: 'Knowledge Base: Job Pescar',
  mushrooms: 'Knowledge Base: Culegator de Ciuperci',
  robberies: 'Knowledge Base: Jafuri si regulamente oficiale',
  rules: 'Regulament oficial Pro4Kings',
  store: 'Magazinul oficial Pro4Kings - verificat 09.08.2026'
};

function fixed(id, source, answer) {
  return { id, source, answer };
}

function parseLocalizedInteger(value) {
  const compact = String(value || '').replace(/\s/g, '');
  if (!compact) return null;
  const parsed = /^\d{1,3}(?:\.\d{3})+$/.test(compact)
    ? Number.parseInt(compact.replace(/\./g, ''), 10)
    : Number.parseInt(compact, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function extractQuantityBefore(question, subject) {
  const pattern = new RegExp(
    `\\b(\\d{1,3}(?:[.\\s]\\d{3})*|\\d+)\\s*(?:de\\s+)?${subject}\\b`,
    'gi'
  );
  const matches = [...String(question || '').matchAll(pattern)];
  return parseLocalizedInteger(matches[matches.length - 1]?.[1]);
}

function findServerAnswer(question) {
  const normalized = normalizeForSearch(question);
  if (!normalized) return null;

  const explicitDirtyMoney = /\bbani(?:i)?\s+murdari\b/.test(normalized);
  const directMoneyWash =
    /\b(?:spal\w*|speli)\s+bani(?:i)?\b/.test(normalized) ||
    /\bbani(?:i)?(?:\s+\w+){0,5}\s+(?:spal\w*|speli)\b/.test(normalized);
  const asksAboutDirtyMoney =
    directMoneyWash ||
    (explicitDirtyMoney && /\b(?:spal\w*|speli|curat\w*|convert\w*|schimb\w*)\b/.test(normalized));
  if (asksAboutDirtyMoney) {
    const asksHours = /\b(?:ore|prag|minimum|minim|cateore)\b/.test(normalized);
    return fixed(
      asksHours ? 'bani-murdari-prag-nedocumentat' : 'bani-murdari-metoda-nedocumentata',
      SOURCES.audit,
      asksHours
        ? 'Pentru spalarea Banilor Murdari nu este documentat momentan un prag minim de ore. Sursele confirma doar ca itemul se schimba ulterior in bani normali; nu precizeaza NPC-ul, codul postal, procentul sau numarul de ore.'
        : 'Sursele actuale confirma ca Banii Murdari se schimba ulterior in bani normali, dar metoda de spalare nu este documentata: lipsesc NPC-ul, codul postal, procentul si pasii. Craftarea Banilor Murdari de pe Cayo este un sistem diferit si nu reprezinta spalare.'
    );
  }

  if (/^0?46$/.test(normalized) || /^(?:cp|postal|cod postal)\s*0?46\b/.test(normalized)) {
    return fixed(
      'cp-046-nedocumentat',
      SOURCES.audit,
      'Pentru CP 046 nu exista momentan o intrare documentata in sursele serverului. Ca sa raspund exact, trebuie salvate numele locatiei/NPC-ului si ce activitate se face acolo.'
    );
  }

  if (/\bpilot\b/.test(normalized) && /\b(?:bani|castig\w*|profit|plata|venit)\b/.test(normalized)) {
    return fixed(
      'pilot-castig-nedocumentat',
      SOURCES.audit,
      'Castigul jobului de Pilot nu este documentat momentan. Sunt confirmate doar pragul de 600 de ore si faptul ca licenta conteaza pentru jucatorul care piloteaza si trece prin checkpoint-uri.'
    );
  }

  if (/\bsita\b/.test(normalized) && /\b(?:fac|craft\w*|reteta|nevoie|material\w*)\b/.test(normalized)) {
    return fixed(
      'reteta-sita',
      SOURCES.crafting,
      'Pentru o **Sita** ai nevoie de:\n- 2x Bronz\n- 1x Fier\n- 1x Bustean\n- 1x Trusa de Scule\n\nSe crafteaza in zona de crafting dintre CP 799 si CP 800.'
    );
  }

  if (
    /\btabac\b/.test(normalized) &&
    !/\btabac\s+uscat\b/.test(normalized) &&
    /\b(?:vand|vind|vinde|vinzi|pret|bani|costa|valoare)\b/.test(normalized)
  ) {
    const tabacCount = extractQuantityBefore(question, 'tabac');
    const cigarettes = tabacCount || 0;
    const fullPackages = Math.floor(cigarettes / 20);
    const looseCigarettes = cigarettes - fullPackages * 20;
    const productionDetail = tabacCount
      ? ` Cu ${tabacCount.toLocaleString('ro-RO')} Tabac + aceeasi cantitate de Filtre si Foite poti face ${cigarettes.toLocaleString('ro-RO')} Tigari BT, adica ${fullPackages.toLocaleString('ro-RO')} pachete complete${looseCigarettes ? ` si ${looseCigarettes} tigari ramase` : ''}. La 1.000.000$ pe pachet, valoarea bruta a pachetelor complete este **${(fullPackages * 1000000).toLocaleString('ro-RO')}$**.`
      : ' Pentru un calcul de productie, spune cantitatea de Tabac; fiecare Tigara BT cere 1 Tabac, 1 Filtru si 1 Foita, iar 20 Tigari BT formeaza un pachet.';
    return fixed(
      'tabac-clarificare-pret',
      SOURCES.economy,
      `Nu este documentat un pret direct pentru Tabac.${productionDetail} Calculul nu include costul Filtrelor si Foitelor.`
    );
  }

  if (
    (/\bciuperc\w*\b/.test(normalized) && /\botravitoare\b/.test(normalized)) ||
    /^care sunt otravitoare$/.test(normalized)
  ) {
    return fixed(
      'ciuperci-toxicitate-nedocumentata',
      SOURCES.mushrooms,
      'Daca te referi la ciuperci, documentatia nu le clasifica drept otravitoare sau comestibile. Ea spune doar ca Galerina Marginata si Amanita Phalloides nu se vand; asta nu dovedeste automat toxicitatea lor in mecanica jocului.'
    );
  }

  if (/\bciuperc\w*\b/.test(normalized) && /\b(?:castig\w*|profit|bani|plata|pret\w*)\b/.test(normalized)) {
    return fixed(
      'ciuperci-castiguri',
      SOURCES.mushrooms,
      'Preturile cunoscute sunt pe bucata: Champignon 115.000$, Gymnopus Dryophilus 350.000$, Laccaria Amethystina 800.000$ si Amanita Muscaria 1.500.000$. Celelalte tipuri listate nu se vand. Fara numarul si mixul ciupercilor nu se poate calcula castigul unei ture.'
    );
  }

  if (
    /\bciuperc\w*\b/.test(normalized) &&
    /\b(?:ce fac|folos\w*|colect\w*|culeg\w*|strang\w*|vand|vinde)\b/.test(normalized)
  ) {
    return fixed(
      'ciuperci-utilizare',
      SOURCES.mushrooms,
      'Ciupercile vandabile se duc la Nicolae, CP 138. Conocybe Filiaris/Filiiaris se pastreaza pentru Ketamina. Galerina Marginata si Amanita Phalloides nu se vand, iar Psilocybe nu se vinde si nu mai este ingredient pentru droguri.'
    );
  }

  if (
    /\b(?:momentul de fata|acum|live|in timp real)\b/.test(normalized) &&
    /\b(?:server|pro4kings|fivem|intampla|jucatori|eveniment\w*)\b/.test(normalized)
  ) {
    return fixed(
      'stare-live-server',
      SOURCES.audit,
      'Pot explica regulile, joburile si sistemele salvate, dar nu am telemetrie live despre jucatorii conectati, evenimentele pornite sau ce se intampla chiar acum pe server. Pentru un raspuns util, intreaba-ma despre un sistem concret.'
    );
  }

  const asksXenonPrice =
    /\bxenon\w*\b/.test(normalized) &&
    (/\b(?:pret|costa|vand|vind|vinde|vinzi|valoare|cat face|se vinde|general)\b/.test(normalized) ||
      /^un xenon\w* in general$/.test(normalized));
  if (asksXenonPrice) {
    const isGold = /\b(?:auriu|gold)\b/.test(normalized);
    return fixed(
      isGold ? 'xenon-auriu-pret-nedocumentat' : 'xenon-pret-nedocumentat',
      SOURCES.audit,
      isGold
        ? 'Varianta „Xenon Auriu” si pretul ei de Player Market nu sunt documentate momentan. Sunt confirmate doar Xenon Simplu si Xenon Premium, ambele tranzactionabile.'
        : 'Nu este documentat un pret general pentru Xenon. Sunt confirmate doua tipuri: Xenon Simplu, cu culori prestabilite, si Xenon Premium, cu opacitate si culoare custom; xenonul se poate tranzactiona.'
    );
  }

  if (/\b(?:taxi|uber|taximetrist)\w*\b/.test(normalized) && /\b(?:familie|mafie)\b/.test(normalized)) {
    return fixed(
      'taxi-in-familie-nedocumentat',
      SOURCES.audit,
      'Regulile salvate nu precizeaza daca apartenenta la o familie/mafie blocheaza jobul de Taxi sau alte joburi legale. Nu trebuie dedus un „da” ori „nu” din regulile generale; este necesara regula actuala a serverului pentru compatibilitatea dintre roluri.'
    );
  }

  if (/\b(?:de cand sunt|cand am intrat)\b.*\b(?:mafie|familie)\b/.test(normalized)) {
    return fixed(
      'vechime-mafie-date-personale',
      SOURCES.audit,
      'Data intrarii tale in mafie nu este disponibila in chat. Data intrarii pe serverul Discord nu este acelasi lucru. Pentru un raspuns exact este necesar istoricul rolurilor sau registrul de recrutare al mafiei.'
    );
  }

  if (/\bghita pescaru\b/.test(normalized) && /\b(?:unde|gasesc|locatie|cp|postal)\b/.test(normalized)) {
    return fixed(
      'ghita-pescaru-locatie-nedocumentata',
      SOURCES.fishing,
      'Ghita Pescaru este NPC-ul la care vinzi pestele, dar codul postal al lui nu este documentat momentan. CP-urile joburilor Pescar Nou/Vechi nu trebuie atribuite automat lui Ghita.'
    );
  }

  if (/\b(?:pesti|pestele)\b/.test(normalized) && /\b(?:vand|vind|vinde|vinzi|vanzare)\b/.test(normalized)) {
    return fixed(
      'vanzare-pesti',
      SOURCES.fishing,
      'Pestele se vinde la **Ghita Pescaru**. Codul postal al NPC-ului nu este documentat momentan in sursele actuale.'
    );
  }

  if (/\bvip\b.*\b(?:bronze|bronz)\b|\b(?:bronze|bronz)\b.*\bvip\b/.test(normalized)) {
    return fixed(
      'vip-bronze-beneficii',
      SOURCES.store,
      'VIP Bronze este un pachet de 1 luna. Pagina magazinului oficial verificata la 09.08.2026 listeaza: 7 masini, Boost PayDay, 5.000.000$ cash si 5 PRO Coins; pretul afisat este 7,50 EUR. Nu este documentat ca o cerinta obligatorie pentru un job.'
    );
  }

  if (
    /\b(?:kit(?:ul)?|trusa)\s+medical\w*\b/.test(normalized) &&
    /\b(?:fac|face|craft\w*|reteta|ingrediente|materiale|nevoie)\b/.test(normalized)
  ) {
    return fixed(
      'trusa-medicala-reteta-nedocumentata',
      SOURCES.audit,
      'Nu exista o reteta documentata pentru un item numit Kit Medical sau Trusa Medicala. Sunt documentate separat:\n- 5 Bandaje: 1 Solutie Medicala + 1 Material Textil + 1 Ustensile Medicale;\n- 3 Injectii Adrenalina: 2 Solutii Medicale + 1 Cocaina + 3 Seringi Medicale.\nTrusa de Scule este alt item.'
    );
  }

  if (
    /\bdrog\w*\b/.test(normalized) &&
    /\bproces\w*\b/.test(normalized) &&
    /\b(?:cum|pasi|flux|procedura)\b/.test(normalized) &&
    !/\b(?:dureaza|durata|timp)\b/.test(normalized)
  ) {
    return fixed(
      'procesare-droguri-flux',
      SOURCES.drugs,
      'Fluxul documentat este:\n1. Intri pe Cayo prin Vama.\n2. Pentru Cannabis, PCP Neprocesat si Acid: iei seminte, plantezi la CP 102 si recoltezi. Coca se ia separat din spawn-uri pe Cayo.\n3. Procesezi reteta la laboratorul de pe Cayo.\n4. Iei jobul Livrator Droguri la Paleto Bay, CP 131, si livrezi produsul la traficantul lui.'
    );
  }

  if (
    (/\busb\b.*\bfull\b|\bfull\b.*\busb\b/.test(normalized)) &&
    /\b(?:pret|costa|vand|vind|vinde|vinzi|valoare|cat face)\b/.test(normalized)
  ) {
    return fixed(
      'usb-full-pret-reper',
      SOURCES.economy,
      'Player Market listeaza generic „Stickuri” la 800.000$–1.000.000$, iar jobul Hacker produce USB Full. Sursa nu leaga explicit denumirea „Stickuri” de USB Full, asa ca intervalul este doar un reper, nu un pret confirmat. USB Gol costa 25.000$.'
    );
  }

  if (/\bucenic\w*\b/.test(normalized) && /\b(?:grad\w*|pot face|permisi\w*)\b/.test(normalized)) {
    return fixed(
      'grad-ucenic-nedocumentat',
      SOURCES.audit,
      'Gradul Ucenic, organizatia lui si permisiunile aferente nu sunt identificate in sursele actuale. Salveaza numele organizatiei si lista de permisiuni oficiala a gradelor pentru un raspuns exact.'
    );
  }

  if (
    /\b(?:jefuitor\w*|jaf\w*)\b/.test(normalized) &&
    /\bbanc\w*\b/.test(normalized) &&
    /\b(?:job|incep|incepe|acces|progres\w*|fac|face|devin)\b/.test(normalized) &&
    !/\b(?:regula|reguli|recompensa|recompense|loot|sanctiune)\b/.test(normalized)
  ) {
    return fixed(
      'jefuitor-banci-progresie',
      SOURCES.robberies,
      'Nu este documentat un job separat „Jefuitor de Banci” luat de la un NPC. Jafurile sunt un sistem cu progresie: familia neoficiala are acces la Banci Mici, iar familia oficiala la toate jafurile. Fleeca necesita 2 Keycard-uri si un laptop deblocat; Blaine necesita 3 Keycard-uri si un laptop deblocat.'
    );
  }

  if (
    /\b(?:tirist|trucker)\b/.test(normalized) &&
    /\b(?:ore|prag|trebuie|nevoie)\b/.test(normalized) &&
    !/\bilegal\w*\b/.test(normalized)
  ) {
    return fixed(
      'trucker-ore',
      SOURCES.economy,
      'Pentru Trucker/Tirist ai nevoie de **25 de ore** si de Permis Comercial. Permisul se cumpara de la Primarie si costa 175.000$.'
    );
  }

  if (/\b(?:no fear|non fear|nofear|nonfear|nf)\b/.test(normalized)) {
    return fixed(
      'regula-non-fear',
      SOURCES.rules,
      'Non-Fear (NF) inseamna ca nu simulezi realist frica si nu iti protejezi viata intr-o situatie periculoasa, de exemplu cand esti amenintat cu arma sau depasit numeric. Sanctiunea documentata este Admin Jail 120 checkpoint-uri.'
    );
  }

  if (
    /\bjefui\w*\b/.test(normalized) &&
    /\b(?:membr\w*\s+(?:din\s+)?mafie|mafiot\w*|mafie)\b/.test(normalized) &&
    /\b(?:voie|pot|permisi\w*)\b/.test(normalized) &&
    !/\b(?:unde|locatie|cp|postal)\b/.test(normalized)
  ) {
    return fixed(
      'jaf-membri-mafie',
      SOURCES.rules,
      'Da, dar numai daca sunt respectate toate conditiile de jaf. Un mafiot aflat in afara propriului Turf este tratat ca o persoana obisnuita; ambii jucatori trebuie sa aiba minimum 25 de ore, trebuie motiv IC si trebuie respectate restrictiile de zona si job. Intre mafii se aplica suplimentar regulamentul mafiilor: nu faci ilegalitati pe teritoriul altei familii, iar activitatile ilegale intre mafii sunt limitate la Cerc Grove/Motel Sandy.'
    );
  }

  if (
    /\binventar\w*\b/.test(normalized) &&
    /\b(?:cat|cate|maxim|maximul|capacitate|tine)\b/.test(normalized) &&
    !/\b(?:pret|costa|unde|locatie)\b/.test(normalized) &&
    !/\b(?:pcp|amfetamina|marijuana|joint|iarba|cocaina|lsd|ketamina|dmt|ghb|heroina|metadona|morfina|subutex)\b/.test(normalized)
  ) {
    return fixed(
      'inventar-capacitate-maxima-nedocumentata',
      SOURCES.audit,
      'Capacitatea maxima de baza a inventarului nu este documentata momentan. Este confirmat ca lipsa antrenamentului la sala scade capacitatea cu 0,1 kg pe ora online si ca Pachetul Royale adauga +75 kg, dar aceste date nu permit calcularea maximului universal.'
    );
  }

  return null;
}

module.exports = {
  SOURCES,
  findServerAnswer
};
