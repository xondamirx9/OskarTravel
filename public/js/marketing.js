/* Дашборд маркетингового агента Oskar Travel */
let token = localStorage.getItem('admin_token') || '';
const $ = (sel) => document.querySelector(sel);
const PALETTE = { tg: '#4C8FC9', ig: '#C56B2C' }; // валидировано на тёмной поверхности
const STATUS_RU = { draft: 'Черновик', approved: 'Одобрен', published: 'Опубликован', rejected: 'Отклонён', failed: 'Ошибка', publishing: 'Публикуется' };
const CHANNEL_RU = { tg: 'Telegram', ig: 'Instagram', both: 'TG + IG' };

/* ---------- API ---------- */
async function api(method, path, body, isForm) {
  const opts = { method, headers: { 'x-admin-token': token } };
  if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (body && isForm) opts.body = body;
  const res = await fetch(`/api/marketing${path}`, opts);
  if (res.status === 401) { logout(); throw new Error('Не авторизован'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, isError) {
  const el = $('#toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.borderColor = isError ? 'rgba(231,76,60,.6)' : 'rgba(46,204,113,.5)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Вход ---------- */
async function checkAuth() {
  if (!token) return false;
  try { await api('GET', '/status'); return true; } catch { return false; }
}
function logout() {
  localStorage.removeItem('admin_token'); token = '';
  $('#app').style.display = 'none';
  $('#login-screen').style.display = 'flex';
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('#login-password').value }),
  });
  if (res.ok) {
    token = (await res.json()).token;
    localStorage.setItem('admin_token', token);
    boot();
  } else {
    $('#login-error').textContent = 'Неверный пароль';
  }
});

/* ---------- Навигация ---------- */
const SECTIONS = { calendar: 'Календарь', queue: 'Очередь модерации', analytics: 'Аналитика', competitors: 'Конкуренты', reports: 'Отчёты агента', settings: 'Настройки' };
let current = 'calendar';
$('#nav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  item.classList.add('active');
  current = item.dataset.section;
  $('#topbar-title').textContent = SECTIONS[current];
  document.querySelectorAll('.mk-section').forEach((s) => { s.style.display = 'none'; });
  $(`#section-${current}`).style.display = 'block';
  RENDER[current]();
});

/* ---------- Статус-пилюли ---------- */
async function renderStatus() {
  try {
    const s = await api('GET', '/status');
    $('#status-pills').innerHTML = [
      `<span class="pill ${s.llm ? 'on' : 'off'}" title="Генерация текстов: ${s.llm ? s.model : 'шаблоны (нет ANTHROPIC_API_KEY)'}">LLM</span>`,
      `<span class="pill ${s.telegram ? 'on' : 'off'}">Telegram</span>`,
      `<span class="pill ${s.instagram ? 'on' : 'off'}">Instagram</span>`,
      `<span class="pill ${s.autoPublish ? 'on' : 'off'}" title="Автопубликация одобренных по расписанию">АВТО</span>`,
    ].join('');
  } catch { /* не критично */ }
}

/* ---------- Генерация плана ---------- */
$('#btn-generate').addEventListener('click', async () => {
  const btn = $('#btn-generate');
  btn.disabled = true; btn.textContent = 'Генерирую…';
  try {
    const r = await api('POST', '/generate-week', {});
    toast(`Создано черновиков: ${r.created}. Проверьте очередь модерации.`);
    RENDER[current]();
  } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.textContent = '✨ Сгенерировать план на неделю';
});

/* ---------- Календарь ---------- */
let calMonth = new Date(); calMonth.setDate(1);
async function renderCalendar() {
  const posts = await api('GET', '/posts');
  const y = calMonth.getFullYear(); const m = calMonth.getMonth();
  const title = calMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Пн = 0
  const gridStart = new Date(y, m, 1 - startOffset);
  const todayKey = new Date().toISOString().slice(0, 10);

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayPosts = posts.filter((p) => p.scheduledAt.slice(0, 10) === key);
    cells += `<div class="cal-cell ${d.getMonth() !== m ? 'other' : ''} ${key === todayKey ? 'today' : ''}">
      <div class="cal-date">${d.getDate()}</div>
      ${dayPosts.map((p) => `<div class="cal-post st-${p.status}" data-post="${p.id}" title="${esc(STATUS_RU[p.status])} · ${esc(CHANNEL_RU[p.channel])}">
        ${p.channel === 'ig' ? '📸' : '✈️'} ${esc(p.cover?.vars?.title || p.rubric)}</div>`).join('')}
    </div>`;
  }
  $('#section-calendar').innerHTML = `
    <div class="cal-header">
      <button class="btn-ghost" id="cal-prev">←</button>
      <h3 style="min-width:180px;text-align:center">${title}</h3>
      <button class="btn-ghost" id="cal-next">→</button>
      <span class="mk-muted">Клик по посту — просмотр и модерация</span>
    </div>
    <div class="cal-grid">
      ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => `<div class="cal-dayname">${d}</div>`).join('')}
      ${cells}
    </div>`;
  $('#cal-prev').onclick = () => { calMonth.setMonth(m - 1); renderCalendar(); };
  $('#cal-next').onclick = () => { calMonth.setMonth(m + 1); renderCalendar(); };
  $('#section-calendar').querySelectorAll('[data-post]').forEach((el) => {
    el.onclick = () => openPost(el.dataset.post);
  });
}

/* ---------- Очередь модерации ---------- */
async function renderQueue() {
  const posts = await api('GET', '/posts');
  const queue = posts.filter((p) => ['draft', 'approved', 'failed', 'publishing'].includes(p.status));
  $('#section-queue').innerHTML = queue.length ? queue.map((p) => `
    <div class="mk-card q-item">
      ${p.cover.file ? `<img class="q-cover" src="${esc(p.cover.file)}" alt="">` : '<div class="q-cover" style="height:90px;display:flex;align-items:center;justify-content:center;color:#8899aa;font-size:11px">нет обложки</div>'}
      <div class="q-meta">
        <div class="q-badges">
          <span class="badge">${esc(p.rubric)}</span>
          <span class="badge gray">${esc(CHANNEL_RU[p.channel])}</span>
          <span class="badge gray">${new Date(p.scheduledAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <span class="badge gray">${esc(STATUS_RU[p.status])}</span>
          ${p.generatedBy === 'template' ? '<span class="badge gray" title="Сгенерировано без LLM — отредактируйте текст">шаблон</span>' : ''}
          ${p.media.video ? '<span class="badge gray">🎬 видео загружено</span>' : ''}
        </div>
        <div class="q-text">${esc(p.channel === 'ig' ? p.ig.caption : p.tg.text)}</div>
        <div class="q-actions">
          <button class="btn-ghost" data-open="${p.id}">Открыть</button>
          ${p.status === 'draft' ? `<button class="btn-ok" data-approve="${p.id}">✓ Одобрить</button><button class="btn-danger" data-reject="${p.id}">✕ Отклонить</button>` : ''}
          ${['approved', 'failed'].includes(p.status) ? `<button class="btn-primary" data-publish="${p.id}">Опубликовать сейчас</button>` : ''}
        </div>
      </div>
    </div>`).join('')
    : '<div class="mk-card"><p class="mk-muted">Очередь пуста. Нажмите «Сгенерировать план на неделю».</p></div>';

  const sec = $('#section-queue');
  sec.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openPost(b.dataset.open); });
  sec.querySelectorAll('[data-approve]').forEach((b) => {
    b.onclick = async () => { await api('POST', `/posts/${b.dataset.approve}/approve`, {}); toast('Одобрено'); renderQueue(); };
  });
  sec.querySelectorAll('[data-reject]').forEach((b) => {
    b.onclick = async () => { await api('POST', `/posts/${b.dataset.reject}/reject`, {}); toast('Отклонено'); renderQueue(); };
  });
  sec.querySelectorAll('[data-publish]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'Публикую…';
      try {
        const p = await api('POST', `/posts/${b.dataset.publish}/publish`, {});
        toast(p.status === 'published' ? 'Опубликовано!' : 'Ошибка публикации — см. журнал поста', p.status !== 'published');
      } catch (e) { toast(e.message, true); }
      renderQueue();
    };
  });
}

/* ---------- Модалка поста ---------- */
async function openPost(id) {
  const p = await api('GET', `/posts/${id}`);
  const dt = p.scheduledAt.slice(0, 16);
  $('#post-modal-body').innerHTML = `
    <h2>${esc(p.cover?.vars?.title || 'Пост')} <span class="badge gray">${esc(STATUS_RU[p.status])}</span></h2>
    <div class="row">
      <div><label>Дата и время</label><input type="datetime-local" id="pm-date" value="${dt}"></div>
      <div><label>Канал</label><select id="pm-channel">
        ${['tg', 'ig', 'both'].map((c) => `<option value="${c}" ${p.channel === c ? 'selected' : ''}>${CHANNEL_RU[c]}</option>`).join('')}
      </select></div>
    </div>
    <label>Текст для Telegram</label><textarea id="pm-tg">${esc(p.tg.text)}</textarea>
    <label>Подпись для Instagram</label><textarea id="pm-ig">${esc(p.ig.caption)}</textarea>
    <label>Хэштеги Instagram</label><input type="text" id="pm-tags" value="${esc((p.ig.hashtags || []).join(' '))}">
    <label>Alt-текст</label><input type="text" id="pm-alt" value="${esc(p.ig.altText || '')}">
    <label>Промпт для Higgsfield <button class="btn-ghost" style="padding:2px 8px;font-size:11px" id="pm-copy">копировать</button></label>
    <textarea id="pm-hf" style="min-height:130px">${esc(p.higgsfieldPrompt || '')}</textarea>
    <div class="row">
      <div>
        <label>Обложка (${esc(p.cover.template)})</label>
        ${p.cover.file ? `<img class="mk-cover-preview" src="${esc(p.cover.file)}?${Date.now()}" alt="">` : '<p class="mk-muted">ещё не сгенерирована</p>'}
        <div class="q-actions"><button class="btn-ghost" id="pm-render">🎨 Сгенерировать обложку</button></div>
      </div>
      <div>
        <label>Медиа (видео из Higgsfield / фото)</label>
        ${p.media.video ? `<p class="mk-muted">🎬 ${esc(p.media.video)}</p>` : ''}
        ${(p.media.photos || []).map((f) => `<p class="mk-muted">🖼 ${esc(f)}</p>`).join('')}
        <input type="file" id="pm-file" accept="video/*,image/*">
        <div class="q-actions"><button class="btn-ghost" id="pm-upload">⬆️ Загрузить</button></div>
      </div>
    </div>
    <label>Журнал</label>
    <pre class="mk-pre" style="max-height:120px;overflow:auto">${esc(p.log.map((l) => `${l.ts.slice(0, 16).replace('T', ' ')} ${l.event}${l.detail ? ': ' + l.detail : ''}`).join('\n'))}</pre>
    <div class="q-actions" style="margin-top:16px">
      <button class="btn-primary" id="pm-save">💾 Сохранить</button>
      ${p.status === 'draft' ? '<button class="btn-ok" id="pm-approve">✓ Одобрить</button>' : ''}
      ${['approved', 'failed'].includes(p.status) ? '<button class="btn-primary" id="pm-publish">Опубликовать сейчас</button>' : ''}
      <button class="btn-danger" id="pm-delete">Удалить</button>
      <button class="btn-ghost" id="pm-close">Закрыть</button>
    </div>`;
  $('#post-modal').style.display = 'flex';

  const save = () => api('PUT', `/posts/${id}`, {
    scheduledAt: new Date($('#pm-date').value).toISOString(),
    channel: $('#pm-channel').value,
    tg: { text: $('#pm-tg').value },
    ig: { caption: $('#pm-ig').value, hashtags: $('#pm-tags').value.split(/\s+/).filter(Boolean), altText: $('#pm-alt').value },
    higgsfieldPrompt: $('#pm-hf').value,
  });
  $('#pm-save').onclick = async () => { await save(); toast('Сохранено'); closeModal(); RENDER[current](); };
  if ($('#pm-approve')) $('#pm-approve').onclick = async () => { await save(); await api('POST', `/posts/${id}/approve`, {}); toast('Одобрено'); closeModal(); RENDER[current](); };
  if ($('#pm-publish')) $('#pm-publish').onclick = async () => {
    await save();
    try { const r = await api('POST', `/posts/${id}/publish`, {}); toast(r.status === 'published' ? 'Опубликовано!' : 'Ошибка — см. журнал', r.status !== 'published'); }
    catch (e) { toast(e.message, true); }
    closeModal(); RENDER[current]();
  };
  $('#pm-delete').onclick = async () => { await api('DELETE', `/posts/${id}`); toast('Удалено'); closeModal(); RENDER[current](); };
  $('#pm-close').onclick = closeModal;
  $('#pm-copy').onclick = () => { navigator.clipboard.writeText($('#pm-hf').value); toast('Промпт скопирован'); };
  $('#pm-render').onclick = async () => {
    toast('Рендерю обложку…');
    try { await api('POST', `/posts/${id}/render-cover`, {}); toast('Обложка готова'); openPost(id); }
    catch (e) { toast(e.message, true); }
  };
  $('#pm-upload').onclick = async () => {
    const f = $('#pm-file').files[0];
    if (!f) return toast('Выберите файл', true);
    const fd = new FormData(); fd.append('file', f);
    try { await api('POST', `/posts/${id}/media`, fd, true); toast('Файл загружен'); openPost(id); }
    catch (e) { toast(e.message, true); }
  };
}
function closeModal() { $('#post-modal').style.display = 'none'; }
$('#post-modal').addEventListener('click', (e) => { if (e.target.id === 'post-modal') closeModal(); });

/* ---------- Графики (SVG) ---------- */
function lineChart(container, seriesList, opts = {}) {
  // seriesList: [{name, color, points: [{date, value}]}]
  const W = opts.width || 640; const H = opts.height || 220;
  const pad = { l: 44, r: 90, t: 10, b: 24 };
  const all = seriesList.flatMap((s) => s.points);
  if (!all.length) { container.innerHTML = '<p class="mk-muted">Нет данных — метрики появятся после настройки токенов или ручного ввода.</p>'; return; }
  const dates = [...new Set(all.map((p) => p.date))].sort();
  const min = 0;
  const max = Math.max(...all.map((p) => p.value)) * 1.1 || 1;
  const x = (d) => pad.l + (dates.indexOf(d) / Math.max(dates.length - 1, 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const gridLines = [0, .25, .5, .75, 1].map((f) => {
    const v = min + f * (max - min);
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.07)"/>
      <text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#8899aa">${Math.round(v)}</text>`;
  }).join('');

  const paths = seriesList.map((s) => {
    const pts = s.points.filter((p) => dates.includes(p.date)).sort((a, b) => a.date.localeCompare(b.date));
    if (!pts.length) return '';
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.value)}`).join(' ');
    const last = pts[pts.length - 1];
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(last.date)}" cy="${y(last.value)}" r="3.5" fill="${s.color}"/>
      <text x="${x(last.date) + 8}" y="${y(last.value) + 4}" font-size="11" fill="#F2ECDF">${esc(s.name)} ${last.value}</text>`;
  }).join('');

  const xLabels = [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]]
    .filter((d, i, a) => d && a.indexOf(d) === i)
    .map((d) => `<text x="${x(d)}" y="${H - 6}" font-size="10" fill="#8899aa" text-anchor="middle">${d.slice(5)}</text>`).join('');

  container.innerHTML = `
    <div class="chart-legend">${seriesList.map((s) => `<span><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.title || 'График')}">${gridLines}${paths}
        <rect id="hover-zone" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent"/>
      </svg>
      <div class="chart-tooltip"></div>
    </div>`;

  // Ховер: ближайшая дата → тултип со значениями всех серий
  const svg = container.querySelector('svg');
  const tip = container.querySelector('.chart-tooltip');
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * W;
    let best = dates[0]; let bestD = Infinity;
    for (const d of dates) { const dist = Math.abs(x(d) - relX); if (dist < bestD) { bestD = dist; best = d; } }
    const rows = seriesList.map((s) => {
      const p = s.points.find((q) => q.date === best);
      return p ? `<div><span class="sw" style="background:${s.color};display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px"></span>${esc(s.name)}: <b>${p.value}</b></div>` : '';
    }).join('');
    tip.innerHTML = `<div class="mk-muted">${best}</div>${rows}`;
    tip.style.display = 'block';
    tip.style.left = `${Math.min(e.clientX - rect.left + 12, rect.width - 140)}px`;
    tip.style.top = '10px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

function barChart(container, items, opts = {}) {
  // items: [{label, value}] — одна серия, один тон (легенда не нужна, заголовок называет её)
  if (!items.length) { container.innerHTML = '<p class="mk-muted">Нет данных за период.</p>'; return; }
  const W = opts.width || 640; const H = 30 * items.length + 20;
  const max = Math.max(...items.map((i) => i.value)) || 1;
  const barW = (v) => Math.max((v / max) * (W - 220), 2);
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.title || '')}">
    ${items.map((it, i) => `
      <text x="130" y="${i * 30 + 24}" text-anchor="end" font-size="11" fill="#8899aa">${esc(it.label)}</text>
      <rect x="140" y="${i * 30 + 12}" width="${barW(it.value)}" height="16" rx="4" fill="#C56B2C">
        <title>${esc(it.label)}: ${it.value}</title>
      </rect>
      <text x="${146 + barW(it.value)}" y="${i * 30 + 24}" font-size="11" fill="#F2ECDF">${it.value}</text>`).join('')}
  </svg>`;
}

/* ---------- Аналитика ---------- */
async function renderAnalytics() {
  const { metrics, stats } = await api('GET', '/analytics');
  const sec = $('#section-analytics');

  const tile = (label, d) => {
    if (!d) return `<div class="stat-tile"><div class="v">—</div><div class="d">${esc(label)}</div></div>`;
    const cls = d.abs > 0 ? 'delta-up' : d.abs < 0 ? 'delta-down' : '';
    return `<div class="stat-tile"><div class="v">${d.to}</div>
      <div class="d">${esc(label)} <span class="${cls}">${d.abs > 0 ? '+' : ''}${d.abs}${d.pct !== null ? ` (${d.pct}%)` : ''}</span></div></div>`;
  };

  sec.innerHTML = `
    <div class="stat-row">
      ${tile('Подписчики Telegram', stats.tgFollowers)}
      ${tile('Подписчики Instagram', stats.igFollowers)}
      ${tile('Охват Instagram / день', stats.igReach)}
      <div class="stat-tile"><div class="v">${stats.published}</div><div class="d">Публикаций за 7 дней${stats.failed ? ` · <span class="delta-down">${stats.failed} ошибок</span>` : ''}</div></div>
    </div>
    <div class="mk-card"><h3>Подписчики по дням: Telegram vs Instagram</h3><div id="chart-followers"></div></div>
    <div class="set-grid">
      <div class="mk-card"><h3>Средний балл поста по рубрикам (7 дней)</h3><div id="chart-rubrics"></div></div>
      <div class="mk-card"><h3>Лучшие посты недели</h3>
        <table class="mk-table"><thead><tr><th>Пост</th><th>Рубрика</th><th>Канал</th><th>Балл</th></tr></thead>
        <tbody>${stats.topPosts.length ? stats.topPosts.map((p) => `<tr><td>${esc(p.title)}</td><td>${esc(p.rubric)}</td><td>${esc(CHANNEL_RU[p.channel] || p.channel)}</td><td>${p.score}</td></tr>`).join('') : '<tr><td colspan="4" class="mk-muted">Пока нет опубликованных постов с метриками</td></tr>'}</tbody></table>
        <p class="mk-muted" style="margin-top:8px">Балл = просмотры + 20×реакции + 50×пересылки + 10×лайки + 40×комментарии + 500×заявки (вносятся в карточке поста).</p>
      </div>
    </div>
    <div class="mk-card"><h3>Внести метрики вручную</h3>
      <p class="mk-muted">Просмотры/реакции Telegram не отдаются Bot API — вносите раз в неделю сюда или запускайте scripts/telethon_scan.py.</p>
      <div class="row" style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <input type="date" id="mm-date" value="${new Date().toISOString().slice(0, 10)}" style="max-width:160px">
        <select id="mm-channel" style="max-width:140px"><option value="tg">Telegram</option><option value="ig">Instagram</option></select>
        <input type="number" id="mm-followers" placeholder="Подписчики" style="max-width:140px">
        <input type="number" id="mm-views" placeholder="Просмотры" style="max-width:140px">
        <button class="btn-primary" id="mm-save">Сохранить</button>
        <button class="btn-ghost" id="mm-collect" title="Запросить метрики из API прямо сейчас">⟳ Собрать из API</button>
      </div>
    </div>`;

  const s = (ch, f) => metrics.filter((m) => m.channel === ch && m[f] != null).map((m) => ({ date: m.date, value: m[f] }));
  lineChart($('#chart-followers'), [
    { name: 'Telegram', color: PALETTE.tg, points: s('tg', 'followers') },
    { name: 'Instagram', color: PALETTE.ig, points: s('ig', 'followers') },
  ], { title: 'Подписчики по дням' });

  const rubricItems = Object.entries(stats.byRubric).map(([k, v]) => ({ label: k, value: Math.round(v.count ? v.score / v.count : 0) })).sort((a, b) => b.value - a.value);
  barChart($('#chart-rubrics'), rubricItems, { title: 'Средний балл по рубрикам' });

  sec.querySelector('#mm-save').onclick = async () => {
    const entry = { date: $('#mm-date').value, channel: $('#mm-channel').value };
    if ($('#mm-followers').value) entry.followers = Number($('#mm-followers').value);
    if ($('#mm-views').value) entry.views = Number($('#mm-views').value);
    await api('POST', '/analytics/manual', entry);
    toast('Метрика сохранена'); renderAnalytics();
  };
  sec.querySelector('#mm-collect').onclick = async () => {
    const r = await api('POST', '/analytics/collect', {});
    toast(r.collected.length ? `Собрано: ${r.collected.join(', ')}` : 'Каналы не настроены — задайте токены в .env', !r.collected.length);
    renderAnalytics();
  };
}

/* ---------- Конкуренты ---------- */
const COMP_COLS = ['name', 'platform', 'handle', 'followers', 'posts_per_week', 'avg_views', 'er_percent', 'offers_prices', 'notes', 'checked_at'];
const COMP_TITLES = { name: 'Название', platform: 'Платформа', handle: 'Хэндл', followers: 'Подписчики', posts_per_week: 'Постов/нед', avg_views: 'Ср. просмотры', er_percent: 'ER %', offers_prices: 'Офферы/цены', notes: 'Заметки', checked_at: 'Проверено' };
async function renderCompetitors() {
  const list = await api('GET', '/competitors');
  const sec = $('#section-competitors');
  sec.innerHTML = `
    <div class="mk-card">
      <h3>Конкуренты <span class="mk-muted">(редактируется прямо в таблице; методика — docs/competitor-analysis.md)</span></h3>
      <div style="overflow-x:auto">
      <table class="mk-table"><thead><tr>${COMP_COLS.map((c) => `<th>${COMP_TITLES[c]}</th>`).join('')}<th></th></tr></thead>
      <tbody id="comp-body">
        ${list.map((row, i) => `<tr>${COMP_COLS.map((c) => `<td><input data-i="${i}" data-c="${c}" value="${esc(row[c] ?? '')}"></td>`).join('')}<td><button class="btn-danger" style="padding:2px 8px" data-del="${i}">✕</button></td></tr>`).join('')}
      </tbody></table>
      </div>
      <div class="q-actions" style="margin-top:12px">
        <button class="btn-primary" id="comp-save">💾 Сохранить таблицу</button>
        <button class="btn-ghost" id="comp-add">+ Строка</button>
      </div>
    </div>
    <div class="mk-card">
      <h3>Импорт</h3>
      <p class="mk-muted">Вставьте CSV (формат data/competitors.csv) или содержимое data/tg_scan.json из scripts/telethon_scan.py</p>
      <textarea id="comp-import" style="width:100%;min-height:100px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:var(--light);padding:10px;margin-top:8px"></textarea>
      <div class="q-actions" style="margin-top:10px"><button class="btn-primary" id="comp-do-import">Импортировать</button></div>
    </div>`;

  const collect = () => {
    const data = list.map((r) => ({ ...r }));
    sec.querySelectorAll('#comp-body input').forEach((inp) => { data[Number(inp.dataset.i)][inp.dataset.c] = inp.value; });
    return data;
  };
  sec.querySelector('#comp-save').onclick = async () => { await api('PUT', '/competitors', collect()); toast('Сохранено'); renderCompetitors(); };
  sec.querySelector('#comp-add').onclick = async () => { await api('PUT', '/competitors', [...collect(), { platform: 'telegram' }]); renderCompetitors(); };
  sec.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => { const d = collect(); d.splice(Number(b.dataset.del), 1); await api('PUT', '/competitors', d); renderCompetitors(); };
  });
  sec.querySelector('#comp-do-import').onclick = async () => {
    const raw = $('#comp-import').value.trim();
    if (!raw) return;
    const body = raw.startsWith('[') ? { tgScan: JSON.parse(raw) } : { csv: raw };
    const r = await api('POST', '/competitors/import', body);
    toast(`Импортировано записей: ${r.imported}`); renderCompetitors();
  };
}

/* ---------- Отчёты ---------- */
async function renderReports() {
  const reports = await api('GET', '/reports');
  const sec = $('#section-reports');
  sec.innerHTML = `
    <div class="q-actions" style="margin-bottom:16px"><button class="btn-primary" id="rep-gen">🧠 Сформировать отчёт сейчас</button>
    <span class="mk-muted">Автоматически — каждый понедельник 08:00</span></div>
    ${reports.slice().reverse().map((r) => `
      <div class="mk-card">
        <h3>Отчёт от ${new Date(r.createdAt).toLocaleDateString('ru-RU')} <span class="mk-muted">(${r.stats.period.from} — ${r.stats.period.to})</span></h3>
        <p class="mk-muted">Публикаций: ${r.stats.published} · Ошибок: ${r.stats.failed}
          ${r.stats.tgFollowers ? ` · TG: ${r.stats.tgFollowers.to} (${r.stats.tgFollowers.abs >= 0 ? '+' : ''}${r.stats.tgFollowers.abs})` : ''}
          ${r.stats.igFollowers ? ` · IG: ${r.stats.igFollowers.to} (${r.stats.igFollowers.abs >= 0 ? '+' : ''}${r.stats.igFollowers.abs})` : ''}</p>
        ${r.narrative ? `<pre class="mk-pre">${esc(r.narrative)}</pre>` : ''}
        <ul style="margin:10px 0 0 18px;font-size:13px">${r.recommendations.map((x) => `<li style="margin-bottom:6px">${esc(x)}</li>`).join('')}</ul>
      </div>`).join('') || '<div class="mk-card"><p class="mk-muted">Отчётов пока нет.</p></div>'}`;
  sec.querySelector('#rep-gen').onclick = async () => {
    toast('Формирую отчёт…');
    await api('POST', '/reports/generate', {});
    renderReports();
  };
}

/* ---------- Настройки ---------- */
async function renderSettings() {
  const s = await api('GET', '/settings');
  const sec = $('#section-settings');
  const rubricRows = Object.entries(s.rubrics).map(([k, r]) => `
    <tr><td>${esc(r.title)} <span class="mk-muted">(${k})</span></td>
    <td><input type="number" data-rubric-share="${k}" value="${r.share}" style="max-width:70px"></td>
    <td><input type="checkbox" data-rubric-on="${k}" ${r.enabled ? 'checked' : ''}></td></tr>`).join('');

  sec.innerHTML = `
    <div class="set-grid">
      <div class="mk-card">
        <h3>Бренд</h3>
        <label>Название</label><input id="st-name" value="${esc(s.brand.name)}">
        <label>Город</label><input id="st-city" value="${esc(s.brand.city)}">
        <label>Telegram-канал</label><input id="st-tg" value="${esc(s.brand.telegram)}">
        <label>Instagram</label><input id="st-ig" value="${esc(s.brand.instagram)}">
        <label>Телефон</label><input id="st-phone" value="${esc(s.brand.phone)}">
        <label>УТП (используется в текстах)</label><textarea id="st-usp" style="min-height:70px">${esc(s.brand.usp)}</textarea>
        <label>Тон бренда</label><textarea id="st-tone" style="min-height:70px">${esc(s.tone)}</textarea>
        <label>Направления (по одному в строке)</label><textarea id="st-dest" style="min-height:70px">${esc(s.destinations.join('\n'))}</textarea>
      </div>
      <div class="mk-card">
        <h3>Постинг</h3>
        <label>Постов в неделю: Telegram</label><input type="number" id="st-ptg" value="${s.postsPerWeek.tg}">
        <label>Постов в неделю: Instagram</label><input type="number" id="st-pig" value="${s.postsPerWeek.ig}">
        <label>Время TG будни (через запятую)</label><input id="st-tg-wd" value="${esc(s.schedule.tg.weekday.join(', '))}">
        <label>Время TG сб / вс</label><div class="row"><input id="st-tg-sa" value="${esc(s.schedule.tg.sat.join(', '))}"><input id="st-tg-su" value="${esc(s.schedule.tg.sun.join(', '))}"></div>
        <label>Время IG будни</label><input id="st-ig-wd" value="${esc(s.schedule.ig.weekday.join(', '))}">
        <label>Время IG сб / вс</label><div class="row"><input id="st-ig-sa" value="${esc(s.schedule.ig.sat.join(', '))}"><input id="st-ig-su" value="${esc(s.schedule.ig.sun.join(', '))}"></div>
        <div class="switch"><input type="checkbox" id="st-auto" ${s.autoPublish ? 'checked' : ''}><label for="st-auto" style="margin:0">Автопубликация одобренных постов по расписанию</label></div>
        <h3 style="margin-top:20px">Рубрики (доли, %)</h3>
        <table class="mk-table"><thead><tr><th>Рубрика</th><th>Доля</th><th>Вкл</th></tr></thead><tbody>${rubricRows}</tbody></table>
      </div>
    </div>
    <div class="q-actions"><button class="btn-primary" id="st-save">💾 Сохранить настройки</button></div>`;

  sec.querySelector('#st-save').onclick = async () => {
    const times = (id) => $(id).value.split(',').map((t) => t.trim()).filter(Boolean);
    const rubrics = {};
    sec.querySelectorAll('[data-rubric-share]').forEach((inp) => {
      const k = inp.dataset.rubricShare;
      rubrics[k] = { share: Number(inp.value), enabled: sec.querySelector(`[data-rubric-on="${k}"]`).checked };
    });
    await api('PUT', '/settings', {
      brand: { name: $('#st-name').value, city: $('#st-city').value, telegram: $('#st-tg').value, instagram: $('#st-ig').value, phone: $('#st-phone').value, usp: $('#st-usp').value },
      tone: $('#st-tone').value,
      destinations: $('#st-dest').value.split('\n').map((d) => d.trim()).filter(Boolean),
      postsPerWeek: { tg: Number($('#st-ptg').value), ig: Number($('#st-pig').value) },
      schedule: {
        tg: { weekday: times('#st-tg-wd'), sat: times('#st-tg-sa'), sun: times('#st-tg-su') },
        ig: { weekday: times('#st-ig-wd'), sat: times('#st-ig-sa'), sun: times('#st-ig-su') },
      },
      autoPublish: $('#st-auto').checked,
      rubrics,
    });
    toast('Настройки сохранены'); renderStatus();
  };
}

/* ---------- Запуск ---------- */
const RENDER = { calendar: renderCalendar, queue: renderQueue, analytics: renderAnalytics, competitors: renderCompetitors, reports: renderReports, settings: renderSettings };

async function boot() {
  $('#login-screen').style.display = 'none';
  $('#app').style.display = 'grid';
  renderStatus();
  RENDER[current]();
}

(async () => {
  if (await checkAuth()) boot();
  else { $('#login-screen').style.display = 'flex'; }
})();
