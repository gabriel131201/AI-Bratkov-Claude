const fs = require('fs');
const path = require('path');

const requiredPaths = [
  'src/index.js',
  'src/config.js',
  'src/database.js',
  'src/discordHandler.js',
  'src/fixedAnswerRouter.js',
  'src/drugAnswers.js',
  'src/jobAnswers.js',
  'src/communityAnswers.js',
  'src/serverAnswers.js',
  'src/utilityAnswers.js',
  'src/ragService.js',
  'imports/server-wiki-actualizat.md',
  'imports/intrebari-regresie-2026-08-09.md',
  'scripts/checkRag.js',
  'scripts/checkRegressionQuestions.js',
  'package.json',
  'package-lock.json'
];

// Fisiere utile, dar din lipsa carora aplicatia tot porneste. Nu opresc deploy-ul:
// baza se recreeaza din `imports/` si din regulamentele sincronizate, iar Railway
// foloseste valori implicite daca fisierele de configurare lipsesc.
const optionalPaths = ['railway.json', 'nixpacks.toml', 'data/pro4kings_ai.sqlite'];

const exists = (relativePath) => fs.existsSync(path.resolve(process.cwd(), relativePath));
const missing = requiredPaths.filter((relativePath) => !exists(relativePath));
const missingOptional = optionalPaths.filter((relativePath) => !exists(relativePath));

if (missing.length > 0) {
  console.error('Deploy-ul nu contine toate fisierele necesare.');
  console.error(`Working directory: ${process.cwd()}`);
  console.error(`Lipsesc: ${missing.join(', ')}`);
  console.error('Verifica pe GitHub ca folderul src/ este urcat si ca Railway foloseste root-ul corect al proiectului.');
  process.exit(1);
}

if (missingOptional.length > 0) {
  console.warn(`Atentie: lipsesc fisiere optionale: ${missingOptional.join(', ')}`);
  if (missingOptional.includes('data/pro4kings_ai.sqlite')) {
    console.warn('Baza livrata lipseste. Botul porneste, dar Knowledge Base-ul se reconstruieste din imports/.');
  }
}

console.log(`Deploy files check OK. Working directory: ${process.cwd()}`);
