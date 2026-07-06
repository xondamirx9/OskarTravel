// Тексты постов: Claude API (если есть ключ) или шаблонный fallback.
const fs = require('fs');
const path = require('path');
const { getSettings } = require('../lib/settings');
const { hasLLM, completeJSON } = require('../lib/llm');
const { logger } = require('../lib/logger');

const log = logger('writer');
const CONTENT_FILE = path.join(__dirname, '..', '..', 'data', 'content.json');

function siteTours() {
  try {
    return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')).tours || [];
  } catch { return []; }
}

function pickTour(index) {
  const tours = siteTours();
  return tours.length ? tours[index % tours.length] : null;
}

function buildHashtags(settings, destination) {
  const h = settings.hashtags;
  const dest = (destination || '')
    .toLowerCase().replace(/[^a-zа-яё\s]/gi, '').trim().split(/\s+/)[0];
  const destTags = dest ? [`#${dest}`, `#туры${dest.length < 12 ? 'в' + dest : ''}`] : [];
  return [...h.brand, ...h.niche.slice(0, 5), ...h.geo.slice(0, 4), ...destTags].slice(0, 16);
}

const POST_SCHEMA = {
  type: 'object',
  properties: {
    tgText: { type: 'string', description: 'Пост для Telegram, 400–900 знаков, эмодзи, хук в первой строке, CTA в конце, навигационный хэштег рубрики' },
    igCaption: { type: 'string', description: 'Подпись Instagram: первые 125 знаков — самодостаточный хук; короче TG; без хэштегов (они отдельно)' },
    igAltText: { type: 'string', description: 'Alt-текст для изображения, 1 предложение' },
    coverTitle: { type: 'string', description: 'Заголовок обложки, максимум 5 слов' },
    coverBadge: { type: 'string', description: 'Текст бейджа обложки, например «🔥 Горящий тур», или пустая строка' },
  },
  required: ['tgText', 'igCaption', 'igAltText', 'coverTitle', 'coverBadge'],
  additionalProperties: false,
};

async function writeWithLLM(rubric, rubricTitle, tour, settings) {
  const system = `Ты — SMM-копирайтер туристического агентства «${settings.brand.name}» (${settings.brand.city}, ${settings.brand.country}).
Tone of voice: ${settings.tone}
УТП: ${settings.brand.usp}
Контакты для CTA: Telegram ${settings.brand.telegram}, телефон ${settings.brand.phone}.
Пиши на русском. Не выдумывай цены и факты, которых нет во входных данных; если данных нет — пиши без конкретики.`;

  const prompt = `Напиши пост для рубрики «${rubricTitle}» (ключ: ${rubric}).
${tour ? `Материал — тур из каталога:\n${JSON.stringify(tour, null, 2)}` : 'Конкретного тура нет — напиши пост рубрики по направлениям: ' + settings.destinations.join(', ')}
Нужны отдельные версии для Telegram (длиннее, с эмодзи, CTA с контактами) и Instagram (короче, хук в первых 125 знаках).`;

  return completeJSON(system, prompt, POST_SCHEMA, 3000);
}

// Шаблонный fallback — рабочие болванки, помечаются как требующие правки
function writeFallback(rubric, rubricTitle, tour, settings) {
  const t = tour || { title: 'Тур недели', destination: settings.destinations[0], duration: '', price: '', description: '' };
  const cta = `\n\n📲 Бронирование: ${settings.brand.telegram} · ${settings.brand.phone}`;
  const templates = {
    hot: {
      tgText: `🔥 ${t.title} — ${t.price || 'цена по запросу'}\n\n${t.description}\n\n✈️ ${t.destination}${t.duration ? ` · ${t.duration}` : ''}\n${(t.included || []).map((i) => `✅ ${i}`).join('\n')}\n\nМест мало — уточните даты у менеджера.${cta}\n\n#горящий_тур`,
      igCaption: `🔥 ${t.title} ${t.price ? `— ${t.price}` : ''}. ${t.destination}${t.duration ? `, ${t.duration}` : ''}. Пишите в директ — забронируем за 15 минут!`,
      coverBadge: '🔥 Горящий тур',
    },
    guide: {
      tgText: `🧭 Гайд: ${t.destination}\n\nСохраните, чтобы не потерять, и перешлите тому, с кем полетите 😉\n\n1️⃣ Когда лететь и какая погода\n2️⃣ Что входит в пакетный тур\n3️⃣ Сколько брать с собой\n4️⃣ Топ-3 места, которые нельзя пропустить\n\n(Заполните пункты — черновик без LLM)${cta}\n\n#гайд`,
      igCaption: `🧭 Гайд по направлению: ${t.destination}. Сохраняйте — пригодится при планировании отпуска!`,
      coverBadge: '🧭 Гайд',
    },
    review: {
      tgText: `⭐ Отзыв нашего клиента\n\n«...» (вставьте цитату клиента)\n\n${t.destination ? `Направление: ${t.destination}` : ''}\n\nСпасибо, что путешествуете с нами! Хотите так же?${cta}\n\n#отзыв`,
      igCaption: `⭐ Отзыв клиента о поездке. Хотите так же? Пишите в директ!`,
      coverBadge: '⭐ Отзыв',
    },
    reels: {
      tgText: `🎬 ${t.destination}: посмотрите это видео со звуком 🔊\n\n${t.title}${t.price ? ` — ${t.price}` : ''}${cta}\n\n#видео`,
      igCaption: `🎬 ${t.destination} ждёт вас. ${t.price ? `Туры ${t.price}. ` : ''}Подробности в директ!`,
      coverBadge: '',
    },
    backstage: {
      tgText: `🎒 Как мы подбираем туры\n\n(Расскажите один процесс: как проверяете отель, как торгуетесь за блок мест, как встречаете туристов — черновик без LLM)${cta}\n\n#закулисье`,
      igCaption: `🎒 Закулисье ${settings.brand.name}: как мы подбираем туры, за которые не стыдно.`,
      coverBadge: '🎒 Закулисье',
    },
    promo: {
      tgText: `🎁 Акция для подписчиков\n\n(Опишите механику: скидка/бонус/условия — черновик без LLM)\n\nУспейте до конца недели!${cta}\n\n#акция`,
      igCaption: `🎁 Акция для подписчиков — подробности внутри. Успейте до конца недели!`,
      coverBadge: '🎁 Акция',
    },
  };
  const tpl = templates[rubric] || templates.hot;
  return {
    tgText: tpl.tgText,
    igCaption: tpl.igCaption,
    igAltText: `${t.title}${t.destination ? ` — ${t.destination}` : ''}, ${settings.brand.name}`,
    coverTitle: t.title,
    coverBadge: tpl.coverBadge,
    fallback: true,
  };
}

/** Полный черновик поста для слота {channel, rubric, scheduledAt}. */
async function writePost(slot, index) {
  const settings = getSettings();
  const rubricTitle = (settings.rubrics[slot.rubric] || {}).title || slot.rubric;
  const tour = ['hot', 'reels'].includes(slot.rubric) ? pickTour(index) : (slot.rubric === 'guide' ? pickTour(index) : null);

  let text;
  if (hasLLM()) {
    try {
      text = await writeWithLLM(slot.rubric, rubricTitle, tour, settings);
    } catch (e) {
      log.warn(`LLM недоступен (${e.message}) — использую шаблон для ${slot.rubric}`);
      text = writeFallback(slot.rubric, rubricTitle, tour, settings);
    }
  } else {
    text = writeFallback(slot.rubric, rubricTitle, tour, settings);
  }

  const hashtags = buildHashtags(settings, tour ? tour.destination : '');
  return {
    rubric: slot.rubric,
    channel: slot.channel,
    scheduledAt: slot.scheduledAt,
    tour: tour ? { title: tour.title, destination: tour.destination, price: tour.price, duration: tour.duration } : null,
    tg: { text: text.tgText },
    ig: { caption: text.igCaption, hashtags, altText: text.igAltText },
    cover: {
      template: slot.channel === 'ig' ? (slot.rubric === 'reels' ? 'reels-1080x1920' : 'ig-post-1080x1350') : 'tg-post-1280x720',
      vars: {
        title: text.coverTitle,
        destination: tour ? tour.destination : '',
        duration: tour ? tour.duration : '',
        price: tour ? tour.price : '',
        badge: text.coverBadge,
        cta: 'Забронировать →',
      },
      file: null,
    },
    generatedBy: text.fallback ? 'template' : 'llm',
  };
}

module.exports = { writePost, siteTours };
