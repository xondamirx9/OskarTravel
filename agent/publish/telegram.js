// Публикация в Telegram-канал через Bot API (бот должен быть админом канала).
// Лимиты: ~20 сообщений/мин в один канал — публикации агента разнесены по расписанию.
const { logger } = require('../lib/logger');

const log = logger('telegram');
const API = 'https://api.telegram.org';

function configured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID);
}

async function call(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(`Telegram ${method}: ${data.description || res.status}`);
    err.retryAfter = data.parameters && data.parameters.retry_after;
    throw err;
  }
  return data.result;
}

function buttons(post, settings) {
  const url = `https://t.me/${(settings.brand.telegram || '').replace('@', '')}`;
  return { inline_keyboard: [[{ text: '✈️ Забронировать', url }]] };
}

function mediaUrl(relPath) {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}${relPath}`;
}

/**
 * Публикация поста: видео > обложка+текст > просто текст.
 * Медиа отправляется публичным URL (PUBLIC_BASE_URL), чтобы не грузить multipart.
 */
async function publishToTelegram(post, settings) {
  if (!configured()) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID не заданы (docs/setup-telegram.md)');
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  const text = post.tg.text;
  const markup = buttons(post, settings);

  const video = post.media.video && mediaUrl(post.media.video);
  const cover = post.cover.file && mediaUrl(post.cover.file);
  const photos = (post.media.photos || []).map(mediaUrl).filter(Boolean);

  let result;
  if (video) {
    result = await call('sendVideo', {
      chat_id: chatId, video, caption: text.slice(0, 1024), reply_markup: markup,
    });
  } else if (photos.length > 1) {
    // Альбом: подпись только у первого элемента, кнопки альбому недоступны
    const media = photos.slice(0, 10).map((p, i) => ({
      type: 'photo', media: p, ...(i === 0 ? { caption: text.slice(0, 1024) } : {}),
    }));
    result = await call('sendMediaGroup', { chat_id: chatId, media });
  } else if (cover || photos.length === 1) {
    result = await call('sendPhoto', {
      chat_id: chatId, photo: cover || photos[0], caption: text.slice(0, 1024), reply_markup: markup,
    });
  } else {
    result = await call('sendMessage', {
      chat_id: chatId, text: text.slice(0, 4096), reply_markup: markup, disable_web_page_preview: true,
    });
  }

  const messageId = Array.isArray(result) ? result[0].message_id : result.message_id;
  log.info(`Опубликовано в Telegram, message_id=${messageId}`);
  return { messageId };
}

/** Подписчики канала — для ежедневной аналитики. */
async function getChannelStats() {
  if (!configured()) return null;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  const count = await call('getChatMemberCount', { chat_id: chatId });
  return { followers: count };
}

module.exports = { publishToTelegram, getChannelStats, configured };
