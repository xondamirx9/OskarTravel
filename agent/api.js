// REST API маркетингового агента: /api/marketing/*
// Авторизация — тот же x-admin-token, что и у админки сайта.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const { getSettings, saveSettings } = require('./lib/settings');
const { generateWeek } = require('./content/generate');
const { buildPrompt } = require('./content/higgsfield');
const { publishPost } = require('./publish/publisher');
const telegram = require('./publish/telegram');
const instagram = require('./publish/instagram');
const { hasLLM, MODEL } = require('./lib/llm');
const { collectDaily, addManualMetric } = require('./analytics/collect');
const { generateWeeklyReport, buildStats } = require('./analytics/report');
const { logger } = require('./lib/logger');

const log = logger('api');
const router = express.Router();

const CONTENT_FILE = path.join(__dirname, '..', 'data', 'content.json');
const MEDIA_DIR = path.join(__dirname, '..', 'public', 'uploads', 'marketing');

function auth(req, res, next) {
  try {
    const { settings } = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    if (req.headers['x-admin-token'] !== settings.adminPassword) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Не удалось проверить авторизацию' });
  }
}
router.use(auth);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(MEDIA_DIR, { recursive: true }); cb(null, MEDIA_DIR); },
    filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    log.error(`${req.method} ${req.path}: ${e.message}`);
    res.status(400).json({ error: e.message });
  });
};

function findPost(id) {
  const post = db.read('posts').find((p) => p.id === id);
  if (!post) throw new Error('Пост не найден');
  return post;
}

function patchPost(id, fn) {
  db.update('posts', (posts) => {
    const p = posts.find((x) => x.id === id);
    if (!p) throw new Error('Пост не найден');
    fn(p);
  });
  return findPost(id);
}

// ---- Статус конфигурации ----
router.get('/status', wrap(async (req, res) => {
  res.json({
    llm: hasLLM(), model: MODEL,
    telegram: telegram.configured(),
    instagram: instagram.configured(),
    publicBaseUrl: Boolean(process.env.PUBLIC_BASE_URL),
    autoPublish: getSettings().autoPublish,
    state: db.read('state'),
  });
}));

// ---- Генерация плана ----
router.post('/generate-week', wrap(async (req, res) => {
  const drafts = await generateWeek(req.body.startDate);
  res.json({ success: true, created: drafts.length, drafts });
}));

// ---- Посты ----
router.get('/posts', wrap(async (req, res) => {
  let posts = db.read('posts');
  const { status, from, to } = req.query;
  if (status) posts = posts.filter((p) => p.status === status);
  if (from) posts = posts.filter((p) => p.scheduledAt >= from);
  if (to) posts = posts.filter((p) => p.scheduledAt <= to);
  res.json(posts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
}));

router.get('/posts/:id', wrap(async (req, res) => res.json(findPost(req.params.id))));

router.put('/posts/:id', wrap(async (req, res) => {
  const allowed = ['scheduledAt', 'channel', 'rubric', 'higgsfieldPrompt'];
  const post = patchPost(req.params.id, (p) => {
    for (const key of allowed) if (req.body[key] !== undefined) p[key] = req.body[key];
    if (req.body.tg) Object.assign(p.tg, req.body.tg);
    if (req.body.ig) Object.assign(p.ig, req.body.ig);
    if (req.body.cover && req.body.cover.vars) Object.assign(p.cover.vars, req.body.cover.vars);
    if (req.body.manualMetrics) p.manualMetrics = { ...(p.manualMetrics || {}), ...req.body.manualMetrics };
    p.log.push({ ts: new Date().toISOString(), event: 'edited' });
  });
  res.json(post);
}));

router.post('/posts/:id/approve', wrap(async (req, res) => {
  const post = patchPost(req.params.id, (p) => {
    p.status = 'approved';
    if (req.body.scheduledAt) p.scheduledAt = req.body.scheduledAt;
    p.log.push({ ts: new Date().toISOString(), event: 'approved' });
  });
  res.json(post);
}));

router.post('/posts/:id/reject', wrap(async (req, res) => {
  const post = patchPost(req.params.id, (p) => {
    p.status = 'rejected';
    p.log.push({ ts: new Date().toISOString(), event: 'rejected', detail: req.body.reason || '' });
  });
  res.json(post);
}));

router.post('/posts/:id/publish', wrap(async (req, res) => {
  res.json(await publishPost(req.params.id)); // ручная публикация «сейчас»
}));

router.delete('/posts/:id', wrap(async (req, res) => {
  db.update('posts', (posts) => posts.filter((p) => p.id !== req.params.id));
  res.json({ success: true });
}));

// Перегенерировать промпт Higgsfield (например, после смены рубрики/направления)
router.post('/posts/:id/higgsfield-prompt', wrap(async (req, res) => {
  const post = findPost(req.params.id);
  const updated = patchPost(req.params.id, (p) => {
    p.higgsfieldPrompt = buildPrompt(p.rubric, (p.tour && p.tour.destination) || req.body.destination || '');
  });
  res.json(updated);
}));

// ---- Обложка ----
router.post('/posts/:id/render-cover', wrap(async (req, res) => {
  const post = findPost(req.params.id);
  const { renderCover } = require('../templates/covers/render');
  const vars = { ...post.cover.vars, ...(req.body.vars || {}) };
  // Фоновое фото: из галереи сайта или загруженное к посту
  if (req.body.photo) vars.photo = path.join(__dirname, '..', 'public', req.body.photo.replace(/^\//, ''));
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const file = `cover-${post.id}-${Date.now()}.png`;
  await renderCover(post.cover.template, vars, path.join(MEDIA_DIR, file));
  const updated = patchPost(post.id, (p) => {
    p.cover.vars = { ...p.cover.vars, ...(req.body.vars || {}) };
    p.cover.file = `/uploads/marketing/${file}`;
    p.log.push({ ts: new Date().toISOString(), event: 'cover_rendered' });
  });
  res.json(updated);
}));

// ---- Медиа (видео из Higgsfield, фото) ----
router.post('/posts/:id/media', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new Error('Файл не получен');
  const rel = `/uploads/marketing/${req.file.filename}`;
  const isVideo = req.file.mimetype.startsWith('video/');
  const post = patchPost(req.params.id, (p) => {
    if (isVideo) p.media.video = rel;
    else p.media.photos.push(rel);
    p.log.push({ ts: new Date().toISOString(), event: 'media_uploaded', detail: rel });
  });
  res.json(post);
}));

// ---- Настройки ----
router.get('/settings', wrap(async (req, res) => res.json(getSettings())));
router.put('/settings', wrap(async (req, res) => res.json(saveSettings(req.body))));

// ---- Аналитика ----
router.get('/analytics', wrap(async (req, res) => {
  res.json({ metrics: db.read('metrics'), stats: buildStats() });
}));
router.post('/analytics/collect', wrap(async (req, res) => {
  res.json({ collected: await collectDaily() });
}));
router.post('/analytics/manual', wrap(async (req, res) => {
  res.json({ success: true, metrics: addManualMetric(req.body) });
}));

// ---- Отчёты ----
router.get('/reports', wrap(async (req, res) => res.json(db.read('reports'))));
router.post('/reports/generate', wrap(async (req, res) => res.json(await generateWeeklyReport())));

// ---- Конкуренты ----
router.get('/competitors', wrap(async (req, res) => res.json(db.read('competitors'))));
router.put('/competitors', wrap(async (req, res) => {
  if (!Array.isArray(req.body)) throw new Error('Ожидается массив записей');
  db.write('competitors', req.body);
  res.json(db.read('competitors'));
}));
// Импорт: CSV-текст (формат data/competitors.csv) или JSON из scripts/telethon_scan.py
router.post('/competitors/import', wrap(async (req, res) => {
  const { csv, tgScan } = req.body;
  const rows = [];
  if (csv) {
    const [header, ...lines] = csv.trim().split(/\r?\n/);
    const cols = header.split(',');
    for (const line of lines) {
      if (!line.trim()) continue;
      const vals = line.split(',');
      rows.push(Object.fromEntries(cols.map((c, i) => [c.trim(), (vals[i] || '').trim()])));
    }
  }
  if (Array.isArray(tgScan)) {
    for (const r of tgScan) {
      rows.push({
        name: r.title, platform: 'telegram', handle: r.handle,
        followers: r.followers, posts_per_week: r.posts_per_week,
        avg_views: r.avg_views, er_percent: r.er_percent,
        best_content: (r.top_posts || []).map((p) => p.text_preview).join(' | '),
        checked_at: (r.checked_at || '').slice(0, 10),
      });
    }
  }
  db.update('competitors', (list) => {
    for (const row of rows) {
      const i = list.findIndex((x) => x.handle === row.handle && x.platform === row.platform);
      if (i >= 0) list[i] = { ...list[i], ...row };
      else list.push(row);
    }
  });
  res.json({ imported: rows.length, competitors: db.read('competitors') });
}));

module.exports = router;
