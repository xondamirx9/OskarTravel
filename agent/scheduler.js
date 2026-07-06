// Планировщик: тик раз в минуту.
//  - публикация одобренных постов по расписанию (если autoPublish включён)
//  - ежедневный сбор метрик в 21:05
//  - недельный отчёт в понедельник 08:00
const db = require('./lib/db');
const { publishDue } = require('./publish/publisher');
const { collectDaily } = require('./analytics/collect');
const { generateWeeklyReport } = require('./analytics/report');
const { logger } = require('./lib/logger');

const log = logger('scheduler');

function localNow(timezone) {
  // Отдельные поля локального времени без сторонних библиотек
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Asia/Tashkent',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday, // 'Mon', 'Tue', ...
  };
}

async function tick() {
  const { getSettings } = require('./lib/settings');
  const settings = getSettings();
  const now = localNow(settings.timezone);
  const state = db.read('state');

  try {
    await publishDue();
  } catch (e) { log.error(`publishDue: ${e.message}`); }

  // Ежедневный сбор после 21:05, один раз в день
  if (now.time >= '21:05' && state.lastDailyDate !== now.date) {
    db.update('state', (s) => { s.lastDailyDate = now.date; });
    try { await collectDaily(); } catch (e) { log.error(`collectDaily: ${e.message}`); }
  }

  // Недельный отчёт: понедельник после 08:00, один раз в неделю
  if (now.weekday === 'Mon' && now.time >= '08:00' && state.lastReportDate !== now.date) {
    db.update('state', (s) => { s.lastReportDate = now.date; });
    try { await generateWeeklyReport(); } catch (e) { log.error(`weeklyReport: ${e.message}`); }
  }
}

function startScheduler() {
  log.info('Планировщик запущен (тик 60с)');
  setInterval(() => { tick().catch((e) => log.error(`tick: ${e.message}`)); }, 60 * 1000);
}

module.exports = { startScheduler, tick };
