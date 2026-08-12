const express = require('express');
const { config } = require('../config');
const { getDatabase, initDatabase } = require('../database');
const { getHealth, getStats } = require('../statsService');
const logger = require('../logger');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(title, body) {
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; line-height: 1.45; color: #151515; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    th { background: #f3f3f3; text-align: left; }
    pre { white-space: pre-wrap; background: #f7f7f7; padding: 12px; }
    nav a { margin-right: 12px; }
  </style>
</head>
<body>
  <nav>
    <a href="/health">Health</a>
    <a href="/stats">Stats</a>
    <a href="/knowledge">Knowledge</a>
    <a href="/rules">Rules</a>
    <a href="/conversations">Conversations</a>
    <a href="/logs">Logs</a>
  </nav>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;
}

function requireToken(req, res, next) {
  if (!config.dashboard.token) {
    res.status(403).send('DASHBOARD_TOKEN is not configured.');
    return;
  }

  const provided = req.query.token || req.header('x-dashboard-token');
  if (provided !== config.dashboard.token) {
    res.status(401).send('Unauthorized');
    return;
  }

  next();
}

function table(rows) {
  if (!rows || rows.length === 0) return '<p>No rows.</p>';
  const columns = Object.keys(rows[0]);
  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

async function createDashboardApp() {
  await initDatabase();
  const app = express();

  // Endpoint public folosit de healthcheck-ul Railway. Nu are token si nu expune
  // nimic despre configuratie sau despre continutul bazei de date.
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use(requireToken);

  app.get('/health', async (req, res) => {
    res.send(renderPage('Health', `<pre>${escapeHtml(JSON.stringify(await getHealth(), null, 2))}</pre>`));
  });

  app.get('/stats', async (req, res) => {
    res.send(renderPage('Stats', `<pre>${escapeHtml(JSON.stringify(await getStats(), null, 2))}</pre>`));
  });

  app.get('/knowledge', async (req, res) => {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT id, normalized_topic, knowledge_type, source_type, active, updated_at, substr(content, 1, 240) AS content
       FROM learned_knowledge
       ORDER BY updated_at DESC
       LIMIT 100`
    );
    res.send(renderPage('Knowledge', table(rows)));
  });

  app.get('/rules', async (req, res) => {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT id, name, url, active, synced_at, length(content) AS chars
       FROM official_rules
       ORDER BY active DESC, synced_at DESC`
    );
    res.send(renderPage('Rules', table(rows)));
  });

  app.get('/conversations', async (req, res) => {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT id, user_display_name, user_id, channel_id, created_at,
              substr(question, 1, 160) AS question, substr(answer, 1, 220) AS answer
       FROM conversations
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.send(renderPage('Conversations', table(rows)));
  });

  app.get('/logs', async (req, res) => {
    const db = await getDatabase();
    const rows = await db.all(
      `SELECT 'ai' AS log_type, event_type AS type, details, created_at FROM ai_logs
       UNION ALL
       SELECT 'sync' AS log_type, status AS type, message AS details, created_at FROM sync_logs
       ORDER BY created_at DESC
       LIMIT 150`
    );
    res.send(renderPage('Logs', table(rows)));
  });

  return app;
}

async function startDashboard() {
  if (!config.dashboard.enabled) {
    logger.info('Dashboard disabled');
    return null;
  }

  try {
    const app = await createDashboardApp();

    // Fara host explicit, Node asculta dual-stack (`::` plus IPv4 mapat). Railway
    // foloseste IPv6 in reteaua interna, deci o legare doar pe 0.0.0.0 ar putea sa nu
    // fie vizibila pentru healthcheck. Adresa reala este logata mai jos.
    return await new Promise((resolve) => {
      const server = app.listen(config.dashboard.port, () => {
        const bound = server.address();
        logger.info('Dashboard started', {
          boundAddress: typeof bound === 'string' ? bound : `${bound?.address}:${bound?.port} (${bound?.family})`,
          configuredPort: config.dashboard.port,
          healthcheck: '/healthz',
          portSource: process.env.DASHBOARD_PORT ? 'DASHBOARD_PORT' : process.env.PORT ? 'PORT' : 'default (PORT lipseste!)'
        });
        resolve(server);
      });

      server.on('error', (error) => {
        logger.error('Dashboard listen failed', { message: error.message, port: config.dashboard.port });
        resolve(null);
      });
    });
  } catch (error) {
    logger.error('Dashboard failed to start', { message: error.message });
    return null;
  }
}

if (require.main === module) {
  startDashboard();
}

module.exports = {
  createDashboardApp,
  startDashboard
};
