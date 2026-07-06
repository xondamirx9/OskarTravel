// JSON-хранилище data/marketing/*.json с атомарной записью.
// На текущих объёмах (сотни постов, тысячи точек метрик) этого достаточно;
// путь миграции на PostgreSQL описан в README.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'marketing');

const DEFAULTS = {
  posts: [],
  metrics: [],       // [{date, channel: 'tg'|'ig', followers, views, reach, ...}]
  reports: [],
  competitors: [],   // строки в формате data/competitors.csv
  state: {},         // счётчики: igPublishedToday, lastDailyCollect, lastWeeklyReport...
};

function fileFor(name) {
  if (!(name in DEFAULTS)) throw new Error(`Неизвестная коллекция: ${name}`);
  return path.join(DATA_DIR, `${name}.json`);
}

function read(name) {
  const file = fileFor(name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS[name]));
  }
}

function write(name, data) {
  const file = fileFor(name);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // атомарная замена — файл не бьётся при падении
}

function update(name, fn) {
  const data = read(name);
  const result = fn(data);
  write(name, result === undefined ? data : result);
  return read(name);
}

module.exports = { read, write, update, DATA_DIR };
