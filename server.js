require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'content.json');

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Storage for photos
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/photos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

// Storage for videos
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/videos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only videos allowed'));
  },
  limits: { fileSize: 100 * 1024 * 1024 }
});

const uploadAny = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = file.mimetype.startsWith('video/') ? 'public/uploads/videos' : 'public/uploads/photos';
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, Date.now() + ext);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'];
  const data = readData();
  if (token !== data.settings.adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Public API
app.get('/api/content', (req, res) => {
  const data = readData();
  const safe = { ...data };
  delete safe.settings.adminPassword;
  res.json(safe);
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const data = readData();
  if (password === data.settings.adminPassword) {
    res.json({ success: true, token: password });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

// Update hero
app.put('/api/admin/hero', authMiddleware, (req, res) => {
  const data = readData();
  data.hero = { ...data.hero, ...req.body };
  writeData(data);
  res.json({ success: true, data: data.hero });
});

// Update about
app.put('/api/admin/about', authMiddleware, (req, res) => {
  const data = readData();
  data.about = { ...data.about, ...req.body };
  writeData(data);
  res.json({ success: true, data: data.about });
});

// Update contact
app.put('/api/admin/contact', authMiddleware, (req, res) => {
  const data = readData();
  data.contact = { ...data.contact, ...req.body };
  writeData(data);
  res.json({ success: true });
});

// Update settings
app.put('/api/admin/settings', authMiddleware, (req, res) => {
  const data = readData();
  data.settings = { ...data.settings, ...req.body };
  writeData(data);
  res.json({ success: true });
});

// Tours CRUD
app.get('/api/admin/tours', authMiddleware, (req, res) => {
  res.json(readData().tours);
});

app.post('/api/admin/tours', authMiddleware, uploadAny.single('image'), (req, res) => {
  const data = readData();
  const tour = {
    id: Date.now(),
    title: req.body.title || '',
    destination: req.body.destination || '',
    duration: req.body.duration || '',
    price: req.body.price || '',
    description: req.body.description || '',
    included: req.body.included ? JSON.parse(req.body.included) : [],
    image: req.file ? '/uploads/photos/' + req.file.filename : (req.body.image || '')
  };
  data.tours.push(tour);
  writeData(data);
  res.json({ success: true, tour });
});

app.put('/api/admin/tours/:id', authMiddleware, uploadAny.single('image'), (req, res) => {
  const data = readData();
  const idx = data.tours.findIndex(t => t.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const updated = {
    ...data.tours[idx],
    title: req.body.title || data.tours[idx].title,
    destination: req.body.destination || data.tours[idx].destination,
    duration: req.body.duration || data.tours[idx].duration,
    price: req.body.price || data.tours[idx].price,
    description: req.body.description || data.tours[idx].description,
    included: req.body.included ? JSON.parse(req.body.included) : data.tours[idx].included
  };
  if (req.file) updated.image = '/uploads/photos/' + req.file.filename;
  data.tours[idx] = updated;
  writeData(data);
  res.json({ success: true, tour: updated });
});

app.delete('/api/admin/tours/:id', authMiddleware, (req, res) => {
  const data = readData();
  data.tours = data.tours.filter(t => t.id != req.params.id);
  writeData(data);
  res.json({ success: true });
});

// Gallery photos
app.post('/api/admin/gallery/photos', authMiddleware, uploadPhoto.array('photos', 20), (req, res) => {
  const data = readData();
  const newPhotos = req.files.map(f => ({
    id: Date.now() + Math.random(),
    url: '/uploads/photos/' + f.filename,
    caption: req.body.caption || '',
    filename: f.filename
  }));
  data.gallery.photos = [...data.gallery.photos, ...newPhotos];
  writeData(data);
  res.json({ success: true, photos: newPhotos });
});

app.delete('/api/admin/gallery/photos/:id', authMiddleware, (req, res) => {
  const data = readData();
  const photo = data.gallery.photos.find(p => p.id == req.params.id);
  if (photo && photo.filename) {
    const filePath = path.join(__dirname, 'public/uploads/photos', photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  data.gallery.photos = data.gallery.photos.filter(p => p.id != req.params.id);
  writeData(data);
  res.json({ success: true });
});

app.put('/api/admin/gallery', authMiddleware, (req, res) => {
  const data = readData();
  if (req.body.title !== undefined) data.gallery.title = req.body.title;
  if (req.body.subtitle !== undefined) data.gallery.subtitle = req.body.subtitle;
  writeData(data);
  res.json({ success: true });
});

// Videos
app.post('/api/admin/videos', authMiddleware, uploadVideo.single('video'), (req, res) => {
  const data = readData();
  const item = {
    id: Date.now(),
    title: req.body.title || '',
    description: req.body.description || '',
    youtubeUrl: req.body.youtubeUrl || '',
    filename: req.file ? req.file.filename : null,
    url: req.file ? '/uploads/videos/' + req.file.filename : null,
    thumbnail: req.body.thumbnail || ''
  };
  data.videos.items.push(item);
  writeData(data);
  res.json({ success: true, video: item });
});

app.delete('/api/admin/videos/:id', authMiddleware, (req, res) => {
  const data = readData();
  const video = data.videos.items.find(v => v.id == req.params.id);
  if (video && video.filename) {
    const filePath = path.join(__dirname, 'public/uploads/videos', video.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  data.videos.items = data.videos.items.filter(v => v.id != req.params.id);
  writeData(data);
  res.json({ success: true });
});

app.put('/api/admin/videos', authMiddleware, (req, res) => {
  const data = readData();
  if (req.body.title !== undefined) data.videos.title = req.body.title;
  if (req.body.subtitle !== undefined) data.videos.subtitle = req.body.subtitle;
  writeData(data);
  res.json({ success: true });
});

// Testimonials CRUD
app.post('/api/admin/testimonials', authMiddleware, (req, res) => {
  const data = readData();
  const t = { id: Date.now(), ...req.body };
  data.testimonials.push(t);
  writeData(data);
  res.json({ success: true, testimonial: t });
});

app.put('/api/admin/testimonials/:id', authMiddleware, (req, res) => {
  const data = readData();
  const idx = data.testimonials.findIndex(t => t.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  data.testimonials[idx] = { ...data.testimonials[idx], ...req.body };
  writeData(data);
  res.json({ success: true });
});

app.delete('/api/admin/testimonials/:id', authMiddleware, (req, res) => {
  const data = readData();
  data.testimonials = data.testimonials.filter(t => t.id != req.params.id);
  writeData(data);
  res.json({ success: true });
});

// Upload logo
app.post('/api/admin/upload/logo', authMiddleware, uploadPhoto.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const data = readData();
  data.settings.logo = '/uploads/photos/' + req.file.filename;
  writeData(data);
  res.json({ success: true, url: data.settings.logo });
});

// Маркетинговый агент: API + планировщик (см. docs/architecture.md)
app.use('/api/marketing', require('./agent/api'));
require('./agent/scheduler').startScheduler();

app.listen(PORT, () => {
  console.log(`Oskar Travel server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
  console.log(`Marketing dashboard: http://localhost:${PORT}/marketing.html`);
});
