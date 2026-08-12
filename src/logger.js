const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function getCurrentLevel() {
  const configured = process.env.LOG_LEVEL || 'info';
  return levels[configured] ?? levels.info;
}

function write(level, message, meta) {
  if (levels[level] > getCurrentLevel()) return;

  const payload = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {})
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta)
};
