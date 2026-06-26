let token = localStorage.getItem('admin_token') || '';
let appData = null;

// Auth
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = document.getElementById('login-password').value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const d = await res.json();
    if (d.success) {
      token = d.token;
      localStorage.setItem('admin_token', token);
      showApp();
    } else {
      document.getElementById('login-error').textContent = d.error || 'Неверный пароль';
    }
  } catch { document.getElementById('login-error').textContent = 'Ошибка подключения'; }
});

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'grid';
  await loadAllData();
}

async function loadAllData() {
  try {
    const res = await fetch('/api/content');
    appData = await res.json();
    renderDashboard();
    fillHeroForm();
    fillAboutForm();
    fillGallery();
    fillVideos();
    fillTours();
    fillReviews();
    fillContact();
    fillSettings();
  } catch (e) { toast('Ошибка загрузки данных', 'error'); }
}

function logout() {
  localStorage.removeItem('admin_token');
  location.reload();
}

// Check if already logged in
if (token) {
  fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: token })
  }).then(r => r.json()).then(d => { if (d.success) showApp(); });
}

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const section = item.dataset.section;
    showSection(section);
    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
  });
});

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelector(`[data-section="${name}"]`).classList.add('active');
  document.getElementById('topbar-title').textContent = document.querySelector(`[data-section="${name}"]`).textContent.trim();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// Dashboard
function renderDashboard() {
  const s = document.getElementById('dash-stats');
  s.innerHTML = [
    { num: (appData.tours || []).length, label: 'Туров' },
    { num: (appData.gallery?.photos || []).length, label: 'Фото' },
    { num: (appData.videos?.items || []).length, label: 'Видео' },
    { num: (appData.testimonials || []).length, label: 'Отзывов' }
  ].map(i => `<div class="dash-stat"><div class="dash-stat-num">${i.num}</div><div class="dash-stat-label">${i.label}</div></div>`).join('');
}

// Hero form
function fillHeroForm() {
  const h = appData.hero || {};
  setValue('hero-title-input', h.title);
  setValue('hero-subtitle-input', h.subtitle);
  setValue('hero-desc-input', h.description);
  setValue('hero-btn-text', h.buttonText);
  setValue('hero-btn-link', h.buttonLink);
}
document.getElementById('hero-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  await api('PUT', '/api/admin/hero', data);
  toast('Главная страница сохранена ✓');
});

// About form
function fillAboutForm() {
  const a = appData.about || {};
  setValue('about-title-input', a.title);
  setValue('about-desc-input', a.description);
  renderFeaturesEditor(a.features || []);
  renderStatsEditor(a.stats || []);
}

function renderFeaturesEditor(features) {
  document.getElementById('features-editor').innerHTML = features.map((f, i) => `
    <div class="feature-item" data-idx="${i}">
      <input type="text" value="${f.icon}" placeholder="🌍" class="feat-icon" data-i="${i}">
      <input type="text" value="${f.title}" placeholder="Название" class="feat-title" data-i="${i}">
      <input type="text" value="${f.text}" placeholder="Описание" class="feat-text" data-i="${i}">
      <button type="button" class="remove-btn" onclick="removeFeature(${i})">✕</button>
    </div>`).join('');
}

function renderStatsEditor(stats) {
  document.getElementById('stats-editor').innerHTML = stats.map((s, i) => `
    <div class="stat-item" data-idx="${i}">
      <input type="text" value="${s.number}" placeholder="100+" class="stat-num" data-i="${i}">
      <input type="text" value="${s.label}" placeholder="Клиентов" class="stat-label-input" data-i="${i}">
      <button type="button" class="remove-btn" onclick="removeStat(${i})">✕</button>
    </div>`).join('');
}

function addFeature() {
  appData.about.features.push({ icon: '⭐', title: 'Название', text: 'Описание' });
  renderFeaturesEditor(appData.about.features);
}
function removeFeature(i) { appData.about.features.splice(i, 1); renderFeaturesEditor(appData.about.features); }
function addStat() {
  appData.about.stats.push({ number: '0', label: 'Показатель' });
  renderStatsEditor(appData.about.stats);
}
function removeStat(i) { appData.about.stats.splice(i, 1); renderStatsEditor(appData.about.stats); }

document.getElementById('about-form').addEventListener('submit', async e => {
  e.preventDefault();
  // Collect features
  const features = [];
  document.querySelectorAll('.feature-item').forEach((el, i) => {
    features.push({
      icon: el.querySelector('.feat-icon').value,
      title: el.querySelector('.feat-title').value,
      text: el.querySelector('.feat-text').value
    });
  });
  const stats = [];
  document.querySelectorAll('.stat-item').forEach(el => {
    stats.push({ number: el.querySelector('.stat-num').value, label: el.querySelector('.stat-label-input').value });
  });
  const data = {
    title: document.getElementById('about-title-input').value,
    description: document.getElementById('about-desc-input').value,
    features, stats
  };
  await api('PUT', '/api/admin/about', data);
  toast('Раздел «О нас» сохранён ✓');
});

// Gallery
function fillGallery() {
  const g = appData.gallery || {};
  setValue('gallery-title-input', g.title);
  setValue('gallery-subtitle-input', g.subtitle);
  renderPhotos(g.photos || []);
}

function renderPhotos(photos) {
  const g = document.getElementById('photo-grid');
  document.getElementById('photo-count').textContent = photos.length;
  if (!photos.length) { g.innerHTML = '<p style="color:var(--gray);font-style:italic;grid-column:1/-1">Фото ещё не добавлены</p>'; return; }
  g.innerHTML = photos.map(p => `
    <div class="photo-item">
      <img src="${p.url}" alt="">
      <div class="photo-item-overlay">
        <button class="photo-delete" onclick="deletePhoto('${p.id}')">Удалить</button>
      </div>
    </div>`).join('');
}

// Photo upload
const photoInput = document.getElementById('photo-input');
const uploadZone = document.getElementById('photo-upload-zone');

photoInput.addEventListener('change', () => uploadPhotos(photoInput.files));

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  uploadPhotos(e.dataTransfer.files);
});

async function uploadPhotos(files) {
  if (!files.length) return;
  const prog = document.getElementById('upload-progress');
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  prog.style.display = 'block';

  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('photos', f));

  try {
    fill.style.width = '30%';
    text.textContent = `Загружаю ${files.length} фото...`;
    const res = await fetch('/api/admin/gallery/photos', {
      method: 'POST', headers: { 'x-admin-token': token }, body: fd
    });
    fill.style.width = '100%';
    const d = await res.json();
    if (d.success) {
      appData.gallery.photos = [...(appData.gallery.photos || []), ...d.photos];
      renderPhotos(appData.gallery.photos);
      renderDashboard();
      toast(`Загружено ${d.photos.length} фото ✓`);
    }
  } catch { toast('Ошибка загрузки', 'error'); }
  setTimeout(() => { prog.style.display = 'none'; fill.style.width = '0%'; }, 1000);
  photoInput.value = '';
}

async function deletePhoto(id) {
  if (!confirm('Удалить фото?')) return;
  const res = await api('DELETE', `/api/admin/gallery/photos/${id}`);
  if (res.success) {
    appData.gallery.photos = appData.gallery.photos.filter(p => p.id != id);
    renderPhotos(appData.gallery.photos);
    renderDashboard();
    toast('Фото удалено');
  }
}

document.getElementById('gallery-meta-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  await api('PUT', '/api/admin/gallery', data);
  toast('Настройки галереи сохранены ✓');
});

// Videos
function fillVideos() {
  const v = appData.videos || {};
  setValue('videos-title-input', v.title);
  setValue('videos-subtitle-input', v.subtitle);
  renderVideosAdmin(v.items || []);
}

function renderVideosAdmin(items) {
  const g = document.getElementById('videos-admin-list');
  document.getElementById('video-count').textContent = items.length;
  if (!items.length) { g.innerHTML = '<p style="color:var(--gray);font-style:italic">Видео ещё не добавлены</p>'; return; }
  g.innerHTML = items.map(v => `
    <div class="video-admin-item">
      <div class="video-thumb">${v.youtubeUrl ? '▶️' : '🎬'}</div>
      <div class="item-info">
        <h4>${v.title}</h4>
        <p>${v.youtubeUrl || (v.url ? 'Загруженный файл' : '')} ${v.description ? '· ' + v.description : ''}</p>
      </div>
      <div class="item-actions">
        <button class="btn-danger" onclick="deleteVideo(${v.id})">Удалить</button>
      </div>
    </div>`).join('');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  event.target.classList.add('active');
  document.getElementById('tab-' + tab).style.display = 'block';
}

document.getElementById('video-youtube-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  const res = await api('POST', '/api/admin/videos', data);
  if (res.success) {
    appData.videos.items.push(res.video);
    renderVideosAdmin(appData.videos.items);
    renderDashboard();
    e.target.reset();
    toast('Видео добавлено ✓');
  }
});

document.getElementById('video-upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    toast('Загружаю видео...');
    const res = await fetch('/api/admin/videos', {
      method: 'POST', headers: { 'x-admin-token': token }, body: fd
    });
    const d = await res.json();
    if (d.success) {
      appData.videos.items.push(d.video);
      renderVideosAdmin(appData.videos.items);
      renderDashboard();
      e.target.reset();
      toast('Видео загружено ✓');
    }
  } catch { toast('Ошибка загрузки видео', 'error'); }
});

document.getElementById('videos-meta-form').addEventListener('submit', async e => {
  e.preventDefault();
  await api('PUT', '/api/admin/videos', formToObj(e.target));
  toast('Настройки видеораздела сохранены ✓');
});

async function deleteVideo(id) {
  if (!confirm('Удалить видео?')) return;
  const res = await api('DELETE', `/api/admin/videos/${id}`);
  if (res.success) {
    appData.videos.items = appData.videos.items.filter(v => v.id != id);
    renderVideosAdmin(appData.videos.items);
    renderDashboard();
    toast('Видео удалено');
  }
}

// Tours
let editingTourId = null;

function fillTours() { renderToursAdmin(appData.tours || []); }

function renderToursAdmin(tours) {
  const g = document.getElementById('tours-list');
  if (!tours.length) { g.innerHTML = '<p style="color:var(--gray);font-style:italic">Туры ещё не добавлены</p>'; return; }
  g.innerHTML = tours.map(t => `
    <div class="tour-item">
      <div class="tour-thumb">
        ${t.image ? `<img src="${t.image}" alt="">` : '✈️'}
      </div>
      <div class="item-info">
        <h4>${t.title}</h4>
        <p>${t.destination} · ${t.duration} · ${t.price}</p>
      </div>
      <div class="item-actions">
        <button class="btn-edit" onclick="editTour(${t.id})">Изменить</button>
        <button class="btn-danger" onclick="deleteTour(${t.id})">Удалить</button>
      </div>
    </div>`).join('');
}

function showTourModal(tour) {
  editingTourId = tour ? tour.id : null;
  document.getElementById('tour-modal-title').textContent = tour ? 'Редактировать тур' : 'Добавить тур';
  const form = document.getElementById('tour-form');
  form.reset();
  if (tour) {
    form.querySelector('[name="title"]').value = tour.title || '';
    form.querySelector('[name="destination"]').value = tour.destination || '';
    form.querySelector('[name="duration"]').value = tour.duration || '';
    form.querySelector('[name="price"]').value = tour.price || '';
    form.querySelector('[name="description"]').value = tour.description || '';
    form.querySelector('[name="includedText"]').value = (tour.included || []).join(', ');
    if (tour.image) document.getElementById('tour-current-image').innerHTML = `<img src="${tour.image}" style="width:80px;height:56px;object-fit:cover;border-radius:6px">`;
  } else {
    document.getElementById('tour-current-image').innerHTML = '';
  }
  document.getElementById('tour-modal').style.display = 'flex';
}

function editTour(id) {
  const tour = appData.tours.find(t => t.id == id);
  if (tour) showTourModal(tour);
}

function closeTourModal() { document.getElementById('tour-modal').style.display = 'none'; }

document.getElementById('tour-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const includedText = fd.get('includedText');
  fd.delete('includedText');
  fd.append('included', JSON.stringify(includedText.split(',').map(s => s.trim()).filter(Boolean)));
  try {
    const url = editingTourId ? `/api/admin/tours/${editingTourId}` : '/api/admin/tours';
    const method = editingTourId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'x-admin-token': token }, body: fd });
    const d = await res.json();
    if (d.success) {
      if (editingTourId) {
        const idx = appData.tours.findIndex(t => t.id == editingTourId);
        appData.tours[idx] = d.tour;
      } else {
        appData.tours.push(d.tour);
      }
      renderToursAdmin(appData.tours);
      renderDashboard();
      closeTourModal();
      toast(editingTourId ? 'Тур обновлён ✓' : 'Тур добавлен ✓');
    }
  } catch { toast('Ошибка сохранения', 'error'); }
});

async function deleteTour(id) {
  if (!confirm('Удалить тур?')) return;
  const res = await api('DELETE', `/api/admin/tours/${id}`);
  if (res.success) {
    appData.tours = appData.tours.filter(t => t.id != id);
    renderToursAdmin(appData.tours);
    renderDashboard();
    toast('Тур удалён');
  }
}

// Reviews
let editingReviewId = null;

function fillReviews() { renderReviewsAdmin(appData.testimonials || []); }

function renderReviewsAdmin(reviews) {
  const g = document.getElementById('reviews-admin-list');
  if (!reviews.length) { g.innerHTML = '<p style="color:var(--gray);font-style:italic">Отзывы ещё не добавлены</p>'; return; }
  g.innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="item-info">
        <h4>${r.name} ${'★'.repeat(r.rating || 5)}</h4>
        <p>${r.text}</p>
      </div>
      <div class="item-actions">
        <button class="btn-edit" onclick="editReview(${r.id})">Изменить</button>
        <button class="btn-danger" onclick="deleteReview(${r.id})">Удалить</button>
      </div>
    </div>`).join('');
}

function showReviewModal(review) {
  editingReviewId = review ? review.id : null;
  document.getElementById('review-modal-title').textContent = review ? 'Редактировать отзыв' : 'Добавить отзыв';
  const form = document.getElementById('review-form');
  form.reset();
  if (review) {
    form.querySelector('[name="name"]').value = review.name || '';
    form.querySelector('[name="text"]').value = review.text || '';
    form.querySelector('[name="rating"]').value = review.rating || 5;
  }
  document.getElementById('review-modal').style.display = 'flex';
}

function editReview(id) {
  const r = appData.testimonials.find(t => t.id == id);
  if (r) showReviewModal(r);
}

function closeReviewModal() { document.getElementById('review-modal').style.display = 'none'; }

document.getElementById('review-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  data.rating = parseInt(data.rating);
  let res;
  if (editingReviewId) {
    res = await api('PUT', `/api/admin/testimonials/${editingReviewId}`, data);
    if (res.success) {
      const idx = appData.testimonials.findIndex(t => t.id == editingReviewId);
      appData.testimonials[idx] = { ...appData.testimonials[idx], ...data };
      toast('Отзыв обновлён ✓');
    }
  } else {
    res = await api('POST', '/api/admin/testimonials', data);
    if (res.success) { appData.testimonials.push(res.testimonial); toast('Отзыв добавлен ✓'); }
  }
  renderReviewsAdmin(appData.testimonials);
  renderDashboard();
  closeReviewModal();
});

async function deleteReview(id) {
  if (!confirm('Удалить отзыв?')) return;
  const res = await api('DELETE', `/api/admin/testimonials/${id}`);
  if (res.success) {
    appData.testimonials = appData.testimonials.filter(t => t.id != id);
    renderReviewsAdmin(appData.testimonials);
    renderDashboard();
    toast('Отзыв удалён');
  }
}

// Contact
function fillContact() {
  const c = appData.contact || {};
  setValue('contact-title-input', c.title);
  setValue('contact-subtitle-input', c.subtitle);
  setValue('contact-phone', c.phone);
  setValue('contact-email', c.email);
  setValue('contact-address', c.address);
  setValue('contact-hours', c.workHours);
  setValue('contact-telegram', c.telegram);
  setValue('contact-instagram', c.instagram);
}

document.getElementById('contact-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  await api('PUT', '/api/admin/contact', data);
  toast('Контакты сохранены ✓');
});

// Settings
function fillSettings() {
  const s = appData.settings || {};
  setValue('settings-sitename', s.siteName);
}

document.getElementById('settings-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = formToObj(e.target);
  if (!data.adminPassword) delete data.adminPassword;
  await api('PUT', '/api/admin/settings', data);
  toast('Настройки сохранены ✓');
});

// Helpers
async function api(method, url, data) {
  try {
    const opts = { method, headers: { 'x-admin-token': token } };
    if (data) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    const res = await fetch(url, opts);
    if (res.status === 401) { logout(); return {}; }
    return await res.json();
  } catch { toast('Ошибка сети', 'error'); return {}; }
}

function formToObj(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  return data;
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

let toastTimer;
function toast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'success' ? '✅' : '❌'} ${msg}`;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3000);
}

// Close modals on overlay click
document.getElementById('tour-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeTourModal(); });
document.getElementById('review-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeReviewModal(); });
