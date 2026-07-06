// Недельный отчёт: динамика метрик + разбор постов + рекомендации.
// Эвристики работают всегда; при наличии ANTHROPIC_API_KEY добавляется разбор от Claude.
// Самообучение: applyLearnings() двигает доли рубрик к тем, что дают результат.
const crypto = require('crypto');
const db = require('../lib/db');
const { getSettings, saveSettings } = require('../lib/settings');
const { hasLLM, complete } = require('../lib/llm');
const { logger } = require('../lib/logger');

const log = logger('report');

function weekAgoISO() {
  return new Date(Date.now() - 7 * 86400000).toISOString();
}

function series(metrics, channel, field) {
  return metrics
    .filter((m) => m.channel === channel && m[field] !== undefined && m[field] !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, value: m[field] }));
}

function delta(s) {
  if (s.length < 2) return null;
  const first = s[0].value;
  const last = s[s.length - 1].value;
  return { from: first, to: last, abs: last - first, pct: first ? Math.round(((last - first) / first) * 1000) / 10 : null };
}

// Оценка поста: ручные метрики поста (если внесены) или факт публикации
function postScore(p) {
  const m = p.manualMetrics || {};
  return (m.views || 0) + (m.reactions || 0) * 20 + (m.forwards || 0) * 50
    + (m.likes || 0) * 10 + (m.comments || 0) * 40 + (m.leads || 0) * 500;
}

function buildStats() {
  const metrics = db.read('metrics');
  const posts = db.read('posts');
  const since = weekAgoISO();
  const weekPosts = posts.filter((p) => p.status === 'published' && p.publishedAt >= since);

  const byRubric = {};
  for (const p of weekPosts) {
    byRubric[p.rubric] = byRubric[p.rubric] || { count: 0, score: 0 };
    byRubric[p.rubric].count++;
    byRubric[p.rubric].score += postScore(p);
  }
  const scored = weekPosts.map((p) => ({
    id: p.id, rubric: p.rubric, channel: p.channel,
    title: p.cover?.vars?.title || '', score: postScore(p),
  })).sort((a, b) => b.score - a.score);

  return {
    period: { from: since.slice(0, 10), to: new Date().toISOString().slice(0, 10) },
    tgFollowers: delta(series(metrics, 'tg', 'followers')),
    igFollowers: delta(series(metrics, 'ig', 'followers')),
    igReach: delta(series(metrics, 'ig', 'reach')),
    published: weekPosts.length,
    failed: db.read('posts').filter((p) => p.status === 'failed' && p.createdAt >= since).length,
    byRubric,
    topPosts: scored.slice(0, 3),
    worstPosts: scored.slice(-2).reverse(),
  };
}

function heuristicRecommendations(stats) {
  const recs = [];
  const rubrics = Object.entries(stats.byRubric)
    .map(([key, v]) => ({ key, avg: v.count ? v.score / v.count : 0, count: v.count }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.avg - a.avg);

  if (rubrics.length >= 2) {
    recs.push(`Лучшая рубрика недели — «${rubrics[0].key}» (ср. балл ${Math.round(rubrics[0].avg)}). Рекомендация: +5% доли в плане.`);
    const worst = rubrics[rubrics.length - 1];
    if (worst.avg < rubrics[0].avg / 3) {
      recs.push(`Рубрика «${worst.key}» отстаёт в 3+ раза — проверьте формат/хук или уменьшите долю на 5%.`);
    }
  }
  if (stats.published === 0) recs.push('На этой неделе не опубликовано ни одного поста — сгенерируйте план и одобрите черновики в очереди.');
  if (stats.failed > 0) recs.push(`Ошибок публикации: ${stats.failed} — проверьте токены и журналы постов со статусом failed.`);
  if (stats.tgFollowers && stats.tgFollowers.abs < 0) recs.push('Подписчики TG снижаются — усилить пересылаемые форматы (гайды, чек-листы) и интерактивы.');
  if (!stats.igFollowers) recs.push('Метрики Instagram не собираются — настройте токены (docs/setup-instagram.md).');
  return recs;
}

async function llmNarrative(stats, recs) {
  const system = 'Ты — маркетинговый аналитик турагентства. Пиши по-русски, коротко и предметно, без воды.';
  const prompt = `Данные за неделю (JSON):\n${JSON.stringify(stats, null, 2)}\n\nЭвристические рекомендации:\n${recs.join('\n')}\n\nНапиши отчёт: 1) что сработало, 2) что нет, 3) 3–5 конкретных действий на следующую неделю (форматы, рубрики, время). До 250 слов.`;
  return complete(system, prompt, 1500);
}

/** Самообучение: сдвигаем доли рубрик на ±5 п.п. к лучшей/от худшей (в пределах 5–40). */
function applyLearnings(stats) {
  const rubrics = Object.entries(stats.byRubric)
    .map(([key, v]) => ({ key, avg: v.count ? v.score / v.count : 0, count: v.count }))
    .filter((r) => r.count >= 2) // не учимся на единичных постах
    .sort((a, b) => b.avg - a.avg);
  if (rubrics.length < 2 || rubrics[0].avg === 0) return null;

  const settings = getSettings();
  const best = rubrics[0].key;
  const worst = rubrics[rubrics.length - 1].key;
  const shares = { ...settings.rubrics };
  if (shares[best].share < 40 && shares[worst].share > 5) {
    shares[best] = { ...shares[best], share: shares[best].share + 5 };
    shares[worst] = { ...shares[worst], share: shares[worst].share - 5 };
    saveSettings({ rubrics: shares });
    return { best, worst, change: 5 };
  }
  return null;
}

async function generateWeeklyReport() {
  const stats = buildStats();
  const recommendations = heuristicRecommendations(stats);
  let narrative = null;
  if (hasLLM()) {
    try { narrative = await llmNarrative(stats, recommendations); }
    catch (e) { log.warn(`LLM-отчёт недоступен: ${e.message}`); }
  }
  const learned = applyLearnings(stats);
  if (learned) recommendations.push(`Автокорректировка плана: доля «${learned.best}» +${learned.change} п.п., «${learned.worst}» −${learned.change} п.п.`);

  const report = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    stats, recommendations, narrative, learned,
  };
  db.update('reports', (reports) => { reports.push(report); });
  db.update('state', (s) => { s.lastWeeklyReport = report.createdAt; });
  log.info(`Недельный отчёт сформирован (${recommendations.length} рекомендаций)`);
  return report;
}

module.exports = { generateWeeklyReport, buildStats };
