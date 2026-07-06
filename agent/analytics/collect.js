// Ежедневный сбор метрик в data/marketing/metrics.json.
// TG: подписчики через Bot API (просмотры/реакции Bot API не отдаёт — ручной ввод или Telethon).
// IG: подписчики, охват, показы через Graph API Insights.
const db = require('../lib/db');
const telegram = require('../publish/telegram');
const instagram = require('../publish/instagram');
const { logger } = require('../lib/logger');

const log = logger('analytics');

function upsertMetric(entry) {
  db.update('metrics', (metrics) => {
    const i = metrics.findIndex((m) => m.date === entry.date && m.channel === entry.channel);
    if (i >= 0) metrics[i] = { ...metrics[i], ...entry };
    else metrics.push(entry);
  });
}

async function collectDaily() {
  const date = new Date().toISOString().slice(0, 10);
  const collected = [];

  if (telegram.configured()) {
    try {
      const tg = await telegram.getChannelStats();
      upsertMetric({ date, channel: 'tg', followers: tg.followers, source: 'bot-api' });
      collected.push('tg');
    } catch (e) { log.error(`Сбор TG: ${e.message}`); }
  }

  if (instagram.configured()) {
    try {
      const ig = await instagram.getAccountStats();
      upsertMetric({
        date, channel: 'ig', followers: ig.followers,
        reach: ig.reach, views: ig.views, mediaCount: ig.mediaCount, source: 'graph-api',
      });
      collected.push('ig');
    } catch (e) { log.error(`Сбор IG: ${e.message}`); }
  }

  db.update('state', (s) => { s.lastDailyCollect = new Date().toISOString(); });
  log.info(`Ежедневный сбор метрик: ${collected.join(', ') || 'каналы не настроены'}`);
  return collected;
}

/** Ручной ввод метрик из дашборда (просмотры TG и т.п.). */
function addManualMetric(entry) {
  if (!entry.date || !entry.channel) throw new Error('date и channel обязательны');
  upsertMetric({ ...entry, source: 'manual' });
  return db.read('metrics');
}

module.exports = { collectDaily, addManualMetric };
