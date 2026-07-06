// Статическая demo-сборка лендинга для GitHub Pages → dist/
// Pages не запускает Node, поэтому: данные сайта запекаются в файл api/content,
// абсолютные пути превращаются в относительные (Pages живёт на /OskarTravel/),
// админка и дашборд в demo не включаются (им нужен сервер — см. README «Деплой»).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'api'), { recursive: true });

// index.html: относительные пути, ссылка «Админ» → на ветку GitHub (в demo сервера нет)
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
  .replace(/href="\/css\//g, 'href="css/')
  .replace(/src="\/js\//g, 'src="js/')
  .replace('href="/admin.html"', 'href="https://github.com/xondamirx9/OskarTravel" title="Админка доступна в полной версии (нужен Node-хостинг)"');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// css / js
fs.mkdirSync(path.join(DIST, 'css'), { recursive: true });
fs.copyFileSync(path.join(PUB, 'css', 'style.css'), path.join(DIST, 'css', 'style.css'));
fs.mkdirSync(path.join(DIST, 'js'), { recursive: true });
let js = fs.readFileSync(path.join(PUB, 'js', 'main.js'), 'utf8')
  .replace("fetch('/api/content')", "fetch('api/content.json')");
fs.writeFileSync(path.join(DIST, 'js', 'main.js'), js);

// Данные сайта без пароля админки
const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8'));
delete content.settings.adminPassword;
fs.writeFileSync(path.join(DIST, 'api', 'content.json'), JSON.stringify(content));

// Загруженные фото/видео, если есть
const uploads = path.join(PUB, 'uploads');
if (fs.existsSync(uploads)) {
  fs.cpSync(uploads, path.join(DIST, 'uploads'), { recursive: true });
}

// GitHub Pages: отключаем Jekyll
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log('Статическая сборка готова: dist/');
