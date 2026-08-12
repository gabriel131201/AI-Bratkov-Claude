# Pro4Kings Intelligence

Pro4Kings Intelligence este un bot Discord AI pentru serverul FiveM Pro4Kings. Raspunde doar pe baza regulamentelor oficiale sincronizate si a informatiilor salvate in Knowledge Base.

## Setup Local

1. Ruleaza `npm install`.
2. Creeaza `.env` pornind de la `.env.example`.
3. Completeaza `DISCORD_TOKEN`, `OPENAI_API_KEY`, `AI_LEARN_ALLOWED_ROLE_IDS` si `ADMIN_ROLE_IDS`.
4. Ruleaza `npm run register-commands`.
5. Ruleaza `npm run sync-rules`.
6. Porneste botul cu `npm start`.

Pe Windows, daca PowerShell blocheaza `npm.ps1`, foloseste `npm.cmd run ...`.

## Variabile .env

- `DISCORD_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_PUBLIC_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_TIMEOUT_MS`
- `OPENAI_MAX_RETRIES`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `AI_CHAT_CHANNEL_ID`
- `AI_LEARN_CHANNEL_ID`
- `AI_LEARN_ALLOWED_ROLE_IDS`
- `ADMIN_ROLE_IDS`
- `ADMIN_USER_IDS`
- `RESIGNATION_CHANNEL_ID`
- `MEMORY_MESSAGE_LIMIT`
- `MEMORY_CONTEXT_LIMIT`
- `RULE_SOURCES_JSON`
- `RULE_SYNC_CRON`
- `RULE_UPDATE_CHANNEL_ID`
- `DATABASE_PATH`
- `DASHBOARD_ENABLED`
- `DASHBOARD_PORT`
- `DASHBOARD_TOKEN`
- `REGISTER_COMMANDS_ON_START`
- `SYNC_RULES_ON_START`
- `IMPORT_KNOWLEDGE_ON_START`
- `LOG_LEVEL`

Modelul implicit este `gpt-5.5`, cu reasoning `high`. Le poti schimba prin `OPENAI_MODEL` si `OPENAI_REASONING_EFFORT`.

Valorile publice deja pregatite pentru Pro4Kings:

- `DISCORD_APPLICATION_ID=1409753933353713667`
- `DISCORD_GUILD_ID=1107074840378220645`
- `DISCORD_PUBLIC_KEY=7d07aaf48639cbad9165340969dafdc1e3a38080d3684b8dbcffce8e1239a7d6`
- `AI_CHAT_CHANNEL_ID=1525633996766187650`
- `AI_LEARN_CHANNEL_ID=1525634377349071050`
- `RESIGNATION_CHANNEL_ID=1221141777885691924`

Nu pune `DISCORD_TOKEN` sau `OPENAI_API_KEY` direct in cod si nu le comita pe GitHub. Pune-le doar in `.env` local sau in Railway Variables.

## Railway

**Doua variabile se seteaza manual. Restul se configureaza singur.**

1. Creeaza proiectul Railway din repository.
2. In Railway Variables adauga **numai**:
   - `DISCORD_TOKEN`
   - `OPENAI_API_KEY`
3. Attach Volume pe serviciu, cu orice mount path (de exemplu `/data`).
4. Deploy. Pornirea normala este `npm start`.

Toate celelalte variabile au valori implicite in `src/config.js`: ID-urile de aplicatie,
guild si canale, rolurile de admin, cele 9 regulamente oficiale, modelul, cron-ul de
sincronizare si limitele de memorie. Daca lipseste unul dintre cele doua secrete,
pornirea se opreste imediat cu mesajul `Missing required environment variables: ...`.

`DATABASE_PATH` **nu** mai trebuie setat manual: la pornire se citeste
`RAILWAY_VOLUME_MOUNT_PATH`, injectat automat de Railway cand serviciul are un volum,
iar baza este plasata in volum. Prima pornire pe un volum gol copiaza automat
`data/pro4kings_ai.sqlite` din repository, deci botul porneste cu tot Knowledge Base-ul,
nu de la zero. Fara volum, botul functioneaza, dar baza se reseteaza la fiecare redeploy
si se pierde tot ce a fost invatat prin `#ai-learn` (pornirea logheaza un avertisment).

Healthcheck-ul este configurat in `railway.json` pe `/healthz`. Ruta este publica si
returneaza doar starea si uptime-ul; restul dashboard-ului ramane in spatele
`DASHBOARD_TOKEN`. Fara `DASHBOARD_TOKEN` setat, toate paginile dashboard-ului raspund
`403`, deci nu se expune nimic public din greseala.

La redeploy Railway trimite `SIGTERM`; clientul Discord se inchide controlat.

Pentru a suprascrie orice valoare implicita, adauga variabila respectiva in Railway.
Lista completa este mai jos.

Proiectul necesita Node.js `20.18.1` sau mai nou. Configuratia Nixpacks fixeaza aceeasi versiune minima pe Railway.

La primul deploy, botul:

- initializeaza baza de date SQLite;
- importa fisierele din `imports/`;
- sincronizeaza toate regulamentele oficiale;
- exporta regulamentele in `data/official_rules_txt/`;
- inregistreaza slash commands pe serverul configurat prin `DISCORD_GUILD_ID`.

Dupa ce comenzile slash apar in Discord, poti seta `REGISTER_COMMANDS_ON_START=false` pentru porniri mai rapide. `SYNC_RULES_ON_START=true` poate ramane activ ca sa verifice regulamentele la fiecare deploy/restart.

### Railway Variables minime

```env
DISCORD_TOKEN=...
OPENAI_API_KEY=...
```

### Valori implicite (nu trebuie setate; listate doar pentru suprascriere)

```env
DISCORD_APPLICATION_ID=1409753933353713667
DISCORD_GUILD_ID=1107074840378220645
DISCORD_PUBLIC_KEY=7d07aaf48639cbad9165340969dafdc1e3a38080d3684b8dbcffce8e1239a7d6
AI_CHAT_CHANNEL_ID=1525633996766187650
AI_LEARN_CHANNEL_ID=1525634377349071050
ADMIN_ROLE_IDS=1107100643291828224,1515017621127299303,1107099637644529684
AI_LEARN_ALLOWED_ROLE_IDS=1107100643291828224,1515017621127299303,1107099637644529684
ADMIN_USER_IDS=937132477791752222
RESIGNATION_CHANNEL_ID=1221141777885691924
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=high
OPENAI_TIMEOUT_MS=45000
OPENAI_MAX_RETRIES=2
OPENAI_MAX_OUTPUT_TOKENS=3000
MEMORY_MESSAGE_LIMIT=20
MEMORY_CONTEXT_LIMIT=12
REGISTER_COMMANDS_ON_START=true
SYNC_RULES_ON_START=true
IMPORT_KNOWLEDGE_ON_START=true
RULE_SYNC_CRON=0 4 * * 0
```

Optional:

```env
RULE_UPDATE_CHANNEL_ID=
DASHBOARD_TOKEN=
DATABASE_PATH=          # doar daca vrei alt path decat volumul detectat automat
```

## GitHub

Inainte de push:

```bash
npm install
npm run import-knowledge
npm run sync-rules
npm test
node --check src/index.js
```

Nu urca pe GitHub:

- `.env`
- `.env.production`
- `node_modules/`
- `data/`

Acestea sunt deja ignorate prin `.gitignore`.

## Regulamente

`RULE_SOURCES_JSON` este un JSON array pe o singura linie, cu obiecte `{ "name": "...", "url": "..." }`.

Sursele implicite sunt:

- Regulament Server: `https://panel.pro4kings.ro/rules/4`
- Regulament Civil: `https://panel.pro4kings.ro/rules/5`
- Regulament Mafii: `https://panel.pro4kings.ro/rules/6`
- Regulament Sindicat: `https://panel.pro4kings.ro/rules/7`
- Regulament Jafuri: `https://panel.pro4kings.ro/rules/8`
- Regulament Cayo: `https://panel.pro4kings.ro/rules/9`
- Regulament Turfs: `https://panel.pro4kings.ro/rules/10`
- Regulament PC Check: `https://panel.pro4kings.ro/rules/11`
- Sanctiuni si pedepse: `https://panel.pro4kings.ro/rules/18`

Ruleaza manual:

```bash
npm run sync-rules
```

Botul sincronizeaza automat dupa `RULE_SYNC_CRON`. Daca un regulament se modifica, se salveaza o versiune noua, se logheaza schimbarea si, daca `RULE_UPDATE_CHANNEL_ID` este setat, se trimite raport in canal.

## Slash Commands Admin

Comenzile sunt permise rolurilor din `ADMIN_ROLE_IDS` si userilor din `ADMIN_USER_IDS`.

- `/health` verifica botul, DB, OpenAI config si regulamentele active.
- `/stats` arata numar informatii, regulamente active, conversatii, conflicte si modelul curent.
- `/rulesync` sincronizeaza regulamentele.
- `/search` cauta in regulamente si Knowledge Base.
- `/intrebari` creeaza pentru administratori un raport cu toate intrebarile care au primit raspunsul de fallback, pentru debug. Optiunea `limit` este optionala si accepta cel mult 1000 de rezultate.
- `/knowledge-add` adauga manual informatie.
- `/knowledge-disable` dezactiveaza o informatie dupa ID.
- `/knowledge-list` listeaza ultimele informatii active.
- `/reload-config` arata configuratia curenta incarcata.

Inregistreaza comenzile cu:

```bash
npm run register-commands
```

## AI Learn

Mesajele din `AI_LEARN_CHANNEL_ID` sunt salvate doar daca autorul are un rol din `AI_LEARN_ALLOWED_ROLE_IDS`.

La salvare, botul:

- salveaza mesajul brut;
- extrage topicul;
- detecteaza tipul informatiei: job, regulament, locatie, pret, item, RP, factiune, economie, sistem server sau necunoscut;
- extrage metadate simple: ore, cod postal, bani, NPC, iteme, vehicule, job;
- marcheaza posibile conflicte cu informatii vechi pe acelasi topic.

Daca detecteaza conflict, informatia este salvata, dar botul raspunde cu avertizare.

## Canal Demisii

Cand cineva scrie in `RESIGNATION_CHANNEL_ID`, botul trimite automat un mesaj in acelasi canal, da tag rolurilor din `ADMIN_ROLE_IDS`, calculeaza cate zile are autorul pe server pe baza datei Discord `joinedAt` si recomanda zilele de transfer.

Regula folosita pentru transfer considera serverul ca mafia:

- 1-14 zile pe server: CK si TRANSFER 20 zile.
- 15-21 zile pe server: CK si TRANSFER 10 zile.
- peste 21 zile pe server: fara TRANSFER.

Acordarea unui transfer mai mare de 20 zile este interzisa.

## RAG Si Surse

Cautarea foloseste `KeywordSearchProvider`, cu normalizare fara diacritice, sinonime, fuzzy controlat, intentia intrebarii, ranking pe titlu/sectiune si filtrare pentru context slab. Fisierele Markdown sunt importate pe sectiuni, pastrand documentul si heading-ul parinte.

Intrebarile care au un raspuns exact nu sunt lasate la interpretarea modelului. `fixedAnswerRouter` rezolva direct profilurile comunitatii, calculele aritmetice, calculele de inventar si venit, pragurile de ore dezambiguizate si raspunsurile serverului care necesita formulare controlata. Sunt acceptate inclusiv formulari compacte sau gresite precum `210kg`, `300ore`, `cateore`, `cp154`, `PCP-uri`, `AFAC` si `processes`. Pentru continuari precum `reteta inventar de 129 kg`, `altceva mai ai?` sau un calcul de profit, botul recupereaza subiectul din conversatia aceluiasi utilizator.

Ruleaza suita de regresie cu:

```bash
npm test
```

`npm test` ruleaza atat verificarea RAG istorica, cat si `scripts/checkRegressionQuestions.js`, care acopera cele 53 de mesaje auditate la 09.08.2026. Pentru doar aceste regresii:

```bash
npm run check-regressions
```

Daca nu exista context relevant, botul raspunde direct:

```text
Nu am această informație salvată momentan.
```

In acest caz nu trimite intrebarea catre OpenAI. Cand exista context real, raspunsul poate include:

```text
Surse:
- Regulament Jafuri
- Knowledge Base: job trucker
```

Memoria conversationala pastreaza implicit ultimele 20 de mesaje per user/canal. Este folosita pentru follow-up-uri precum „si cat costa?”, dar nu este acceptata drept sursa factuala.

In canalul AI, fiecare raspuns incepe cu mentionarea autorului. Discord afiseaza automat nickname-ul sau display name-ul persoanei mentionate.

## Dashboard

Dashboard-ul este Express minimal si poate fi dezactivat:

```env
DASHBOARD_ENABLED=false
```

Rute:

- `GET /health`
- `GET /stats`
- `GET /knowledge`
- `GET /rules`
- `GET /conversations`
- `GET /logs`

Acces:

```text
http://localhost:3000/health?token=TOKEN
```

sau header:

```text
x-dashboard-token: TOKEN
```

Pornire separata:

```bash
npm run dashboard
```

## Import Knowledge

Pune fisiere `.txt`, `.md` sau `.json` in folderul `imports/`, apoi ruleaza:

```bash
npm run import-knowledge
```

Importerul imparte continutul in sectiuni, pastreaza ierarhia headingurilor Markdown, seteaza `source_type=file_import`, deduplicateaza prin `content_hash` si dezactiveaza automat fragmentele vechi cand un fisier este actualizat sau eliminat.

PDF, DOCX, imagini si voice nu sunt implementate in aceasta versiune.

## Structura

- `src/index.js` porneste botul, cron-ul si dashboard-ul optional.
- `src/config.js` citeste `.env`.
- `src/database.js` initializeaza SQLite si migrarile sigure.
- `src/discordHandler.js` gestioneaza mesaje si slash commands.
- `src/fixedAnswerRouter.js` stabileste ordinea rutelor deterministe.
- `src/drugAnswers.js`, `src/jobAnswers.js`, `src/serverAnswers.js` si `src/utilityAnswers.js` contin calculatoarele si raspunsurile controlate.
- `src/commands/` contine comenzile admin si inregistrarea lor.
- `src/search/` contine interfata SearchProvider si KeywordSearchProvider.
- `src/ragService.js` construieste contextul RAG.
- `src/knowledgeService.js` salveaza Knowledge Base, metadata si conflicte.
- `src/memoryService.js` gestioneaza memoria scurta.
- `src/ruleSyncService.js` sincronizeaza regulamentele.
- `src/dashboard/server.js` expune dashboard-ul minimal.
- `src/importer/importKnowledge.js` importa fisiere text.

## Note V4

Nu exista inca vector DB real, dashboard frontend complex, PDF/DOCX, recunoastere imagini sau voice. Arhitectura este pregatita pentru un viitor `VectorSearchProvider`.
