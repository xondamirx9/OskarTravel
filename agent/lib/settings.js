// Настройки агента: дефолты из docs/marketing-strategy.md + сохранённые правки из дашборда.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'marketing', 'settings.json');

const DEFAULTS = {
  brand: {
    name: 'Oskar Travel',
    city: 'Ташкент',
    country: 'Узбекистан',
    language: 'ru',
    phone: '+998 90 123 45 67',
    telegram: '@oskartravel',
    instagram: '@oskartravel_uz',
    site: 'https://oskartravel.uz',
    usp: '10+ лет опыта, 5000+ клиентов. Туры под ключ: перелёт, отель, трансфер, страховка. Менеджер на связи в поездке.',
  },
  tone: 'Тёплый, живой, конкретный. Обращение на «вы», умеренные эмодзи, цифры вместо превосходных степеней, срочность без истерики. Без канцелярита.',
  // Доли рубрик в контент-плане (ключи фиксированы, доли редактируемы)
  rubrics: {
    hot: { title: '🔥 Горящий тур', share: 30, enabled: true },
    guide: { title: '🧭 Гайд по направлению', share: 20, enabled: true },
    review: { title: '⭐ Отзыв клиента', share: 15, enabled: true },
    reels: { title: '🎬 Reels / атмосферное видео', share: 15, enabled: true },
    backstage: { title: '🎒 Закулисье', share: 10, enabled: true },
    promo: { title: '🎁 Акция', share: 10, enabled: true },
  },
  destinations: ['Турция (Анталья)', 'ОАЭ (Дубай)', 'Египет (Хургада, Шарм-эль-Шейх)'],
  postsPerWeek: { tg: 7, ig: 5 },
  // Сетка оптимального времени (Asia/Tashkent), из стратегии §6
  schedule: {
    tg: { weekday: ['09:00', '19:30'], sat: ['11:00'], sun: ['18:00'] },
    ig: { weekday: ['12:30', '20:00'], sat: ['11:30', '20:00'], sun: ['19:00'] },
  },
  timezone: 'Asia/Tashkent',
  autoPublish: false,          // публиковать одобренные посты по расписанию автоматически
  igDailyLimit: 50,            // жёсткий лимит Instagram Graph API
  hashtags: {
    brand: ['#oskartravel', '#оскартревел', '#oskartravel_uz'],
    geo: ['#ташкент', '#узбекистан', '#tashkent', '#uzbekistan'],
    niche: ['#горящиетуры', '#турыизташкента', '#путешествия', '#отпуск2026', '#турагентство'],
  },
};

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override) || typeof base !== 'object' || base === null
      || typeof override !== 'object' || override === null) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) out[key] = deepMerge(base[key], override[key]);
  return out;
}

function getSettings() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* дефолты */ }
  return deepMerge(DEFAULTS, saved);
}

function saveSettings(patch) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* пусто */ }
  const next = deepMerge(saved, patch);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return getSettings();
}

module.exports = { getSettings, saveSettings, DEFAULTS };
