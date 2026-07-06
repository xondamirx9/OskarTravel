// Логирование действий агента: консоль + logs/agent.log (JSONL).
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent.log');

function write(level, scope, message, extra) {
  const entry = { ts: new Date().toISOString(), level, scope, message, ...(extra ? { extra } : {}) };
  const line = JSON.stringify(entry);
  const fn = level === 'error' ? console.error : console.log;
  fn(`[agent:${scope}] ${level.toUpperCase()} ${message}`);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* логирование не должно ронять агента */ }
}

function logger(scope) {
  return {
    info: (msg, extra) => write('info', scope, msg, extra),
    warn: (msg, extra) => write('warn', scope, msg, extra),
    error: (msg, extra) => write('error', scope, msg, extra),
  };
}

module.exports = { logger, LOG_FILE };
