let galleryPhotos = [];
let lightboxIndex = 0;

async function loadContent() {
  try {
    const res = await fetch('/api/content');
    const d = await res.json();
    renderHero(d.hero);
    renderAbout(d.about);
    renderTours(d.tours);
    renderGallery(d.gallery);
    renderVideos(d.videos);
    renderReviews(d.testimonials);
    renderContact(d.contact);
    if (d.settings.siteName) {
      document.title = d.settings.siteName;
      document.getElementById('nav-sitename').textContent = d.settings.siteName;
      document.getElementById('footer-sitename').textContent = d.settings.siteName;
    }
  } catch (e) { console.error('Failed to load content', e); }
}

function renderHero(h) {
  if (!h) return;
  setText('hero-title', h.title);
  setText('hero-subtitle', h.subtitle);
  setText('hero-desc', h.description);
  const btn = document.getElementById('hero-btn');
  if (btn) { btn.textContent = h.buttonText; btn.href = h.buttonLink; }
}

function renderAbout(a) {
  if (!a) return;
  setText('about-title', a.title);
  setText('about-desc', a.description);
  const fg = document.getElementById('features-grid');
  if (fg && a.features) {
    fg.innerHTML = a.features.map(f => `
      <div class="feature-card">
        <div class="feature-icon">${f.icon}</div>
        <h3>${f.title}</h3>
        <p>${f.text}</p>
      </div>`).join('');
  }
  const sg = document.getElementById('stats-grid');
  if (sg && a.stats) {
    sg.innerHTML = a.stats.map(s => `
      <div class="stat-item">
        <div class="stat-number">${s.number}</div>
        <div class="stat-label">${s.label}</div>
      </div>`).join('');
  }
}

function renderTours(tours) {
  const g = document.getElementById('tours-grid');
  if (!g) return;
  if (!tours || !tours.length) { g.innerHTML = '<p class="no-content">Туры скоро появятся</p>'; return; }
  g.innerHTML = tours.map(t => `
    <div class="tour-card">
      <div class="tour-img">
        ${t.image ? `<img src="${t.image}" alt="${t.title}">` : `<span class="tour-img-placeholder">✈️</span>`}
      </div>
      <div class="tour-body">
        <div class="tour-destination">${t.destination}</div>
        <h3>${t.title}</h3>
        <p>${t.description}</p>
        <div class="tour-meta">
          <span>🕐 ${t.duration}</span>
        </div>
        <div class="tour-price">${t.price}</div>
        <div class="tour-tags">
          ${(t.included || []).map(i => `<span class="tour-tag">${i}</span>`).join('')}
        </div>
      </div>
    </div>`).join('');
}

function renderGallery(gallery) {
  const g = document.getElementById('gallery-grid');
  if (!g) return;
  setText('gallery-title', gallery.title);
  setText('gallery-subtitle', gallery.subtitle);
  if (!gallery.photos || !gallery.photos.length) {
    g.innerHTML = '<p class="no-content">Фотографии скоро появятся</p>';
    return;
  }
  galleryPhotos = gallery.photos;
  g.innerHTML = gallery.photos.map((p, i) => `
    <div class="gallery-item" onclick="openLightbox(${i})">
      <img src="${p.url}" alt="${p.caption || ''}">
      <div class="gallery-item-overlay">🔍</div>
    </div>`).join('');
}

function renderVideos(videos) {
  const g = document.getElementById('videos-grid');
  if (!g) return;
  setText('videos-title', videos.title);
  setText('videos-subtitle', videos.subtitle);
  if (!videos.items || !videos.items.length) {
    g.innerHTML = '<p class="no-content">Видео скоро появятся</p>';
    return;
  }
  g.innerHTML = videos.items.map(v => `
    <div class="video-card">
      <div class="video-wrapper">
        ${v.youtubeUrl ? youtubeEmbed(v.youtubeUrl) : `<video src="${v.url}" controls></video>`}
      </div>
      <div class="video-body">
        <h3>${v.title}</h3>
        ${v.description ? `<p>${v.description}</p>` : ''}
      </div>
    </div>`).join('');
}

function youtubeEmbed(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/);
  if (!match) return `<a href="${url}" target="_blank" style="color:var(--primary);padding:20px;display:block">Смотреть видео</a>`;
  return `<iframe src="https://www.youtube.com/embed/${match[1]}" allowfullscreen></iframe>`;
}

function renderReviews(reviews) {
  const g = document.getElementById('reviews-grid');
  if (!g) return;
  if (!reviews || !reviews.length) { g.innerHTML = '<p class="no-content">Отзывы скоро появятся</p>'; return; }
  g.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-stars">${'★'.repeat(r.rating || 5)}</div>
      <p class="review-text">"${r.text}"</p>
      <div class="review-author">${r.name}</div>
    </div>`).join('');
}

function renderContact(c) {
  if (!c) return;
  setText('contact-title', c.title);
  setText('contact-subtitle', c.subtitle);
  const info = document.getElementById('contact-info');
  if (info) {
    info.innerHTML = `
      ${item('📞', 'Телефон', c.phone)}
      ${item('✉️', 'Email', c.email)}
      ${item('📍', 'Адрес', c.address)}
      ${item('🕐', 'Время работы', c.workHours)}
      ${c.telegram ? item('💬', 'Telegram', c.telegram) : ''}
      ${c.instagram ? item('📸', 'Instagram', c.instagram) : ''}
    `;
  }
}

function item(icon, label, value) {
  if (!value) return '';
  return `<div class="contact-item">
    <div class="contact-icon">${icon}</div>
    <div><div class="contact-label">${label}</div><div class="contact-value">${value}</div></div>
  </div>`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el && val) el.textContent = val;
}

// Lightbox
function openLightbox(index) {
  lightboxIndex = index;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = galleryPhotos[index].url;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}
function lightboxNav(dir) {
  lightboxIndex = (lightboxIndex + dir + galleryPhotos.length) % galleryPhotos.length;
  document.getElementById('lightbox-img').src = galleryPhotos[lightboxIndex].url;
}
document.getElementById('lightbox').addEventListener('click', function(e) {
  if (e.target === this) closeLightbox();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  if (e.key === 'ArrowRight') lightboxNav(1);
});

// Navbar scroll
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// Burger
document.getElementById('burger').addEventListener('click', () => {
  document.getElementById('nav-links').classList.toggle('open');
});

// Contact form
document.getElementById('contact-form').addEventListener('submit', e => {
  e.preventDefault();
  alert('Спасибо! Мы свяжемся с вами в ближайшее время.');
  e.target.reset();
});

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

loadContent();
