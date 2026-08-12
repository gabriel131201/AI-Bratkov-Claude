const cron = require('node-cron');
const { Events } = require('discord.js');
const { config, validateRuntimeConfig } = require('./config');
const logger = require('./logger');
const { initDatabase } = require('./database');
const { createDiscordClient } = require('./discordClient');
const { registerDiscordHandlers } = require('./discordHandler');
const { syncRules } = require('./ruleSyncService');
const { startDashboard } = require('./dashboard/server');
const { registerCommands } = require('./commands/registerCommands');
const { importKnowledge } = require('./importer/importKnowledge');

// Rezumat de pornire fara valori sensibile: pe Railway este singurul mod de a
// confirma ce s-a configurat automat si ce lipseste, fara a citi vreun secret.
function logEffectiveConfig() {
  logger.info('Configuration loaded', {
    model: config.openai.model,
    databasePath: config.database.path,
    persistentVolume: Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH),
    aiChatChannel: config.channels.aiChat,
    ruleSources: config.rules.sources.length,
    dashboardEnabled: config.dashboard.enabled,
    dashboardProtected: Boolean(config.dashboard.token),
    startup: config.startup
  });

  if (!process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATABASE_PATH) {
    logger.warn('No persistent volume detected; the database resets on every redeploy');
  }
}

// Importul si sincronizarea regulamentelor sunt lente: sincronizarea parcurge 9 surse
// secvential, cu timeout de 15s fiecare, deci poate depasi 2 minute daca panelul
// raspunde greu. Ruleaza dupa ce botul este online, pentru ca baza livrata contine deja
// Knowledge Base-ul si regulamentele.
async function runStartupMaintenance() {
  if (config.startup.importKnowledge) {
    try {
      const result = await importKnowledge();
      logger.info('Startup knowledge import finished', result);
    } catch (error) {
      logger.warn('Startup knowledge import failed', { message: error.message });
    }
  }

  if (config.startup.syncRules) {
    try {
      const result = await syncRules();
      logger.info('Startup rules sync finished', { status: result.status });
    } catch (error) {
      logger.warn('Startup rules sync failed', { message: error.message });
    }
  }
}

async function start() {
  validateRuntimeConfig();
  logEffectiveConfig();
  await initDatabase();

  // Serverul HTTP porneste inaintea oricarei munci lente. Healthcheck-ul Railway are o
  // fereastra limitata, iar daca ruta /healthz apare dupa import si sincronizare,
  // deploy-ul este marcat drept esuat desi aplicatia este sanatoasa.
  await startDashboard();

  const client = createDiscordClient();
  registerDiscordHandlers(client);

  if (config.startup.registerCommands) {
    client.once(Events.ClientReady, async () => {
      try {
        await registerCommands();
        logger.info('Startup slash command registration finished');
      } catch (error) {
        logger.warn('Startup slash command registration failed', { message: error.message });
      }
    });
  }

  if (cron.validate(config.rules.syncCron)) {
    cron.schedule(config.rules.syncCron, async () => {
      await syncRules(client);
    });
    logger.info('Rules sync cron scheduled', { cron: config.rules.syncCron });
  } else {
    logger.warn('Invalid RULE_SYNC_CRON; automatic sync disabled', {
      cron: config.rules.syncCron
    });
  }

  await client.login(config.discord.token);

  runStartupMaintenance().catch((error) => {
    logger.warn('Startup maintenance failed', { message: error.message });
  });

  return client;
}

// Railway trimite SIGTERM la fiecare redeploy. Fara inchiderea explicita a clientului
// Discord sesiunea ramane agatata, iar procesul este oprit fortat dupa timeout.
function registerShutdownHandlers(client) {
  let shuttingDown = false;

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.info('Shutdown signal received', { signal });
      try {
        await client.destroy();
      } catch (error) {
        logger.warn('Discord client shutdown failed', { message: error.message });
      }
      process.exit(0);
    });
  }
}

// Un singur eveniment netratat nu trebuie sa opreasca botul intr-un ciclu de restart.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { message: reason?.message || String(reason) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { message: error.message });
});

start()
  .then(registerShutdownHandlers)
  .catch((error) => {
    logger.error('Application failed to start', { message: error.message });
    process.exit(1);
  });
