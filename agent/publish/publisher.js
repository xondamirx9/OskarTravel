// Диспетчер публикации: ретраи с экспоненциальным backoff, статусы, журнал поста.
const db = require('../lib/db');
const { getSettings } = require('../lib/settings');
const { publishToTelegram } = require('./telegram');
const { publishToInstagram } = require('./instagram');
const { logger } = require('../lib/logger');

const log = logger('publisher');
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [2000, 4000, 8000, 16000];

function appendLog(postId, event, detail) {
  db.update('posts', (posts) => {
    const p = posts.find((x) => x.id === postId);
    if (p) p.log.push({ ts: new Date().toISOString(), event, ...(detail ? { detail } : {}) });
  });
}

function setStatus(postId, status, patch) {
  db.update('posts', (posts) => {
    const p = posts.find((x) => x.id === postId);
    if (p) Object.assign(p, { status }, patch || {});
  });
}

async function withRetries(fn, label, postId) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      // Конфигурационные ошибки и лимиты не ретраим — быстрее упасть с ясным сообщением
      const permanent = /не задан|лимит|требует публичные/.test(e.message);
      log.warn(`${label}: попытка ${attempt}/${MAX_ATTEMPTS} — ${e.message}`);
      appendLog(postId, 'attempt_failed', `${label}: ${e.message}`);
      if (permanent || attempt === MAX_ATTEMPTS) break;
      const wait = e.retryAfter ? e.retryAfter * 1000 : BACKOFF_MS[attempt - 1];
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}

/** Публикация одного поста в его канал(ы). Возвращает обновлённый пост. */
async function publishPost(postId) {
  const posts = db.read('posts');
  const post = posts.find((p) => p.id === postId);
  if (!post) throw new Error(`Пост ${postId} не найден`);
  const settings = getSettings();

  setStatus(postId, 'publishing');
  const results = { ...(post.results || {}) };
  const errors = [];

  const targets = post.channel === 'both' ? ['tg', 'ig'] : [post.channel];
  for (const target of targets) {
    if (results[target] && results[target].ok) continue; // уже опубликовано (частичный ретрай)
    try {
      const res = target === 'tg'
        ? await withRetries(() => publishToTelegram(post, settings), 'Telegram', postId)
        : await withRetries(() => publishToInstagram(post, settings), 'Instagram', postId);
      results[target] = { ok: true, ...res, at: new Date().toISOString() };
      appendLog(postId, 'published', target);
    } catch (e) {
      results[target] = { ok: false, error: e.message, at: new Date().toISOString() };
      errors.push(`${target}: ${e.message}`);
    }
  }

  const allOk = targets.every((t) => results[t] && results[t].ok);
  setStatus(postId, allOk ? 'published' : 'failed', { results, publishedAt: allOk ? new Date().toISOString() : undefined });
  if (!allOk) log.error(`Пост ${postId} не опубликован полностью: ${errors.join('; ')}`);
  return db.read('posts').find((p) => p.id === postId);
}

/** Одобренные посты, чьё время пришло (вызывается планировщиком). */
async function publishDue() {
  const settings = getSettings();
  if (!settings.autoPublish) return [];
  const now = new Date().toISOString();
  const due = db.read('posts').filter((p) => p.status === 'approved' && p.scheduledAt <= now);
  const published = [];
  for (const post of due) {
    try {
      published.push(await publishPost(post.id));
    } catch (e) {
      log.error(`publishDue ${post.id}: ${e.message}`);
    }
  }
  return published;
}

module.exports = { publishPost, publishDue };
