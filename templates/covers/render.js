// Рендер брендированных обложек: HTML-шаблон + переменные → PNG (Playwright).
// CLI:  node templates/covers/render.js <template> <out.png> [--title "..."] [--photo /path.jpg] ...
// Код:  const { renderCover } = require('./templates/covers/render'); await renderCover('reels-1080x1920', vars, outPath);
const path = require('path');
const fs = require('fs');

const SIZES = {
  'reels-1080x1920': { width: 1080, height: 1920 },
  'ig-post-1080x1350': { width: 1080, height: 1350 },
  'tg-post-1280x720': { width: 1280, height: 720 },
  'carousel-1080x1350': { width: 1080, height: 1350 },
};

function fillTemplate(template, vars) {
  const file = path.join(__dirname, `${template}.html`);
  let html = fs.readFileSync(file, 'utf8');

  const v = { ...vars };
  // Фото: файл превращаем в data URI, чтобы не зависеть от file:// доступа
  if (v.photo && fs.existsSync(v.photo)) {
    const ext = path.extname(v.photo).slice(1).toLowerCase() || 'jpeg';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    v.photo = `data:image/${mime};base64,${fs.readFileSync(v.photo).toString('base64')}`;
  }
  v.photoClass = v.photo ? 'photo' : '';
  v.durationSep = v.destination && v.duration ? ' · ' : '';

  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = v[key];
    if (val === undefined || val === null) return '';
    // Экранируем HTML везде, кроме photo (data URI в url())
    if (key === 'photo' || key === 'photoClass') return String(val);
    return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}

async function renderCover(template, vars, outPath) {
  const size = SIZES[template];
  if (!size) throw new Error(`Неизвестный шаблон: ${template}. Доступны: ${Object.keys(SIZES).join(', ')}`);

  const html = fillTemplate(template, vars);
  const { chromium } = require('playwright');
  // CHROMIUM_PATH — для окружений с предустановленным браузером другой сборки
  const launchOpts = {};
  const preinstalled = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  if (fs.existsSync(preinstalled)) launchOpts.executablePath = preinstalled;
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, type: 'png' });
  } finally {
    await browser.close();
  }
  return outPath;
}

module.exports = { renderCover, SIZES };

if (require.main === module) {
  const [template, outPath, ...rest] = process.argv.slice(2);
  if (!template || !outPath) {
    console.error('Использование: node render.js <template> <out.png> [--var value ...]');
    console.error(`Шаблоны: ${Object.keys(SIZES).join(', ')}`);
    process.exit(1);
  }
  const vars = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i].startsWith('--')) vars[rest[i].slice(2)] = rest[i + 1] || '';
  }
  renderCover(template, vars, outPath)
    .then((p) => console.log(`OK: ${p}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
