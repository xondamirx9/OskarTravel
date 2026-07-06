// Контент-план: раскладывает рубрики по слотам недели согласно настройкам.
const { getSettings } = require('../lib/settings');

// «HH:MM» дня date (локальной для агента датой) → ISO-строка
function slotDate(baseDate, dayOffset, time) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + dayOffset);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function timesFor(channelSchedule, weekday) {
  if (weekday === 6) return channelSchedule.sat || [];
  if (weekday === 0) return channelSchedule.sun || [];
  return channelSchedule.weekday || [];
}

// Взвешенная последовательность рубрик: hot,hot,guide,review,... по долям
function rubricSequence(rubrics, count) {
  const enabled = Object.entries(rubrics).filter(([, r]) => r.enabled && r.share > 0);
  const total = enabled.reduce((s, [, r]) => s + r.share, 0) || 1;
  // идеальные квоты → округление с остатками
  const quotas = enabled.map(([key, r]) => ({ key, exact: (r.share / total) * count }));
  const seq = [];
  quotas.forEach((q) => { for (let i = 0; i < Math.floor(q.exact); i++) seq.push(q.key); });
  quotas
    .sort((a, b) => (b.exact % 1) - (a.exact % 1))
    .slice(0, count - seq.length)
    .forEach((q) => seq.push(q.key));
  // перемешиваем детерминированно, чтобы рубрики не шли подряд
  const out = [];
  const buckets = {};
  seq.forEach((k) => { (buckets[k] = buckets[k] || []).push(k); });
  const keys = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length);
  let i = 0;
  while (out.length < seq.length) {
    const k = keys[i % keys.length];
    if (buckets[k].length) out.push(buckets[k].pop());
    i++;
  }
  return out;
}

/**
 * План на неделю: массив слотов {channel, rubric, scheduledAt}.
 * startDate — с какого дня строить (по умолчанию завтра).
 */
function planWeek(startDate) {
  const settings = getSettings();
  const base = startDate ? new Date(startDate) : new Date(Date.now() + 24 * 3600 * 1000);
  base.setHours(0, 0, 0, 0);

  const slots = [];
  for (const channel of ['tg', 'ig']) {
    const want = settings.postsPerWeek[channel] || 0;
    const chSchedule = settings.schedule[channel];
    const available = [];
    for (let day = 0; day < 7; day++) {
      const weekday = new Date(base.getTime() + day * 86400000).getDay();
      for (const time of timesFor(chSchedule, weekday)) {
        available.push({ day, time });
      }
    }
    // равномерно выбираем want слотов из доступных
    const step = available.length / Math.max(want, 1);
    const chosen = [];
    for (let i = 0; i < want && available.length; i++) {
      chosen.push(available[Math.min(Math.floor(i * step), available.length - 1)]);
    }
    const rubrics = rubricSequence(settings.rubrics, chosen.length);
    chosen.forEach((slot, i) => {
      // reels — только в IG; если выпал на TG, заменяем на hot
      let rubric = rubrics[i];
      if (channel === 'tg' && rubric === 'reels') rubric = 'hot';
      slots.push({ channel, rubric, scheduledAt: slotDate(base, slot.day, slot.time) });
    });
  }
  return slots.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

module.exports = { planWeek };
