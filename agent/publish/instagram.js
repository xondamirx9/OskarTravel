// Публикация в Instagram через Graph API (Business/Creator аккаунт + Facebook Page).
// Контейнерный flow: создать контейнер → дождаться готовности → опубликовать.
// Жёсткий лимит API: 50 публикаций аккаунта в сутки — учитывается в state.igPublishedToday.
const db = require('../lib/db');
const { logger } = require('../lib/logger');

const log = logger('instagram');
const GRAPH = 'https://graph.facebook.com/v21.0';

function configured() {
  return Boolean(process.env.IG_ACCESS_TOKEN && process.env.IG_BUSINESS_ACCOUNT_ID);
}

async function call(pathname, params) {
  const url = new URL(`${GRAPH}/${pathname}`);
  url.searchParams.set('access_token', process.env.IG_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();
  if (data.error) throw new Error(`Instagram API: ${data.error.message} (code ${data.error.code})`);
  return data;
}

async function get(pathname, params) {
  const url = new URL(`${GRAPH}/${pathname}`);
  url.searchParams.set('access_token', process.env.IG_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Instagram API: ${data.error.message} (code ${data.error.code})`);
  return data;
}

function mediaUrl(relPath) {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error('PUBLIC_BASE_URL не задан — Instagram Graph API требует публичные HTTPS-URL медиа');
  return `${base.replace(/\/$/, '')}${relPath}`;
}

function checkDailyLimit(settings) {
  const state = db.read('state');
  const today = new Date().toISOString().slice(0, 10);
  const used = state.igDay === today ? (state.igPublishedToday || 0) : 0;
  if (used >= (settings.igDailyLimit || 50)) {
    throw new Error(`Достигнут дневной лимит Instagram API (${used}) — пост будет опубликован завтра`);
  }
}

function bumpDailyCounter() {
  const today = new Date().toISOString().slice(0, 10);
  db.update('state', (s) => {
    if (s.igDay !== today) { s.igDay = today; s.igPublishedToday = 0; }
    s.igPublishedToday = (s.igPublishedToday || 0) + 1;
  });
}

async function waitReady(containerId, timeoutMs = 5 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status_code: status } = await get(containerId, { fields: 'status_code' });
    if (status === 'FINISHED') return;
    if (status === 'ERROR') throw new Error('Instagram: контейнер медиа в статусе ERROR');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Instagram: контейнер не готов за отведённое время');
}

/** Публикация: Reels (видео) / карусель / одиночное фото. */
async function publishToInstagram(post, settings) {
  if (!configured()) throw new Error('IG_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID не заданы (docs/setup-instagram.md)');
  checkDailyLimit(settings);

  const igId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const caption = [post.ig.caption, '', (post.ig.hashtags || []).join(' ')].join('\n').trim();
  const video = post.media.video && mediaUrl(post.media.video);
  const cover = post.cover.file && mediaUrl(post.cover.file);
  const photos = (post.media.photos || []).map(mediaUrl);

  let containerId;
  if (video) {
    ({ id: containerId } = await call(`${igId}/media`, {
      media_type: 'REELS', video_url: video, caption,
      ...(cover ? { cover_url: cover } : {}),
    }));
  } else if (photos.length > 1) {
    const children = [];
    for (const p of photos.slice(0, 10)) {
      const { id } = await call(`${igId}/media`, { image_url: p, is_carousel_item: true });
      children.push(id);
    }
    ({ id: containerId } = await call(`${igId}/media`, {
      media_type: 'CAROUSEL', children: children.join(','), caption,
    }));
  } else {
    const image = cover || photos[0];
    if (!image) throw new Error('Instagram: у поста нет ни видео, ни изображения');
    ({ id: containerId } = await call(`${igId}/media`, {
      image_url: image, caption,
      ...(post.ig.altText ? { alt_text: post.ig.altText } : {}),
    }));
  }

  await waitReady(containerId);
  const { id: mediaId } = await call(`${igId}/media_publish`, { creation_id: containerId });
  bumpDailyCounter();
  log.info(`Опубликовано в Instagram, media_id=${mediaId}`);
  return { mediaId };
}

/** Ежедневные метрики аккаунта для аналитики. */
async function getAccountStats() {
  if (!configured()) return null;
  const igId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const acc = await get(igId, { fields: 'followers_count,media_count' });
  let reach = null;
  let views = null;
  try {
    const ins = await get(`${igId}/insights`, { metric: 'reach,views', period: 'day' });
    for (const m of ins.data || []) {
      const val = m.values && m.values.length ? m.values[m.values.length - 1].value : null;
      if (m.name === 'reach') reach = val;
      if (m.name === 'views') views = val;
    }
  } catch (e) {
    log.warn(`Insights недоступны: ${e.message}`);
  }
  return { followers: acc.followers_count, mediaCount: acc.media_count, reach, views };
}

module.exports = { publishToInstagram, getAccountStats, configured };
