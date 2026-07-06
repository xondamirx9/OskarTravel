# Архитектура маркетингового агента Oskar Travel

## Выбор стека и обоснование

| Компонент | Выбор | Почему |
|---|---|---|
| Рантайм | **Node.js (Express)** — единый процесс с существующим сайтом | Сайт и админка уже на Express; один процесс = один деплой, общая авторизация, общий домен (важно для Instagram Graph API — ему нужны публичные URL медиа) |
| Дашборд | **Vanilla HTML/JS/CSS** в `public/` (как существующая админка) | В ТЗ ориентир Next.js, но существующая админка — статические страницы на Express; отдельное Next.js-приложение удвоило бы деплой и авторизацию без выгоды на этом масштабе. Миграция на Next.js возможна позже — API уже отделён |
| Хранилище | **JSON-файлы** в `data/marketing/` (атомарная запись) | Согласуется с существующим `data/content.json`; объёмы (сотни постов, тысячи точек метрик) для JSON тривиальны. Путь миграции на PostgreSQL описан в README |
| Генерация текстов | **Claude API** (`@anthropic-ai/sdk`, модель ⚙️ `ANTHROPIC_MODEL`, по умолчанию `claude-opus-4-8`) | Лучшее качество русскоязычных продающих текстов; при отсутствии ключа — шаблонный fallback (агент остаётся рабочим) |
| Рендер обложек | **Playwright** (Chromium screenshot HTML-шаблонов) | HTML/CSS-шаблоны легко править; рендер пиксель-в-пиксель под форматы 1080×1920 / 1080×1350 / 1280×720 |
| Публикация TG | **Telegram Bot API** (HTTPS, без SDK) | Достаточно 4 методов; нет лишней зависимости |
| Публикация IG | **Instagram Graph API** (контейнерный flow) | Единственный легальный способ автопостинга в IG |
| Планировщик | Встроенный тик раз в минуту (`agent/scheduler.js`) | cron-пакет не нужен: логика «что пора сделать» вычисляется от настроек и данных |
| Higgsfield | **Полуручной workflow** | Публичного API у Higgsfield нет (проверено на 2026-07). Агент генерирует детальный промпт → вы генерируете видео вручную → загружаете файл к посту в дашборде → агент накладывает бренд-обложку и публикует |

## Схема модулей

```
server.js ──── статика public/ + API сайта (как было)
   │
   ├── agent/api.js          REST /api/marketing/* (авторизация x-admin-token)
   ├── agent/scheduler.js    тик 60с: публикация по расписанию, сбор метрик, недельный отчёт
   │
   ├── agent/lib/
   │     db.js               JSON-хранилище data/marketing/*.json (атомарная запись)
   │     settings.js         настройки + дефолты из стратегии
   │     logger.js           логи в консоль + logs/agent.log
   │     llm.js              Claude API + шаблонный fallback
   │
   ├── agent/content/
   │     rubrics.js          рубрики из стратегии (ключи hot/guide/review/reels/backstage/promo)
   │     planner.js          контент-план на неделю: слоты (день, время, рубрика, канал)
   │     writer.js           тексты TG/IG, хэштеги, alt-текст (через llm.js)
   │     higgsfield.js       промпты для Higgsfield в стиле бренда
   │
   ├── agent/publish/
   │     telegram.js         Bot API: текст/фото/видео/альбом + inline-кнопки
   │     instagram.js        Graph API: фото/карусель/Reels; учёт лимита 50 публ./сутки
   │     publisher.js        диспетчер: ретраи с backoff, статусы, журнал поста
   │
   ├── agent/analytics/
   │     collect.js          ежедневный сбор: TG (подписчики через Bot API; просмотры — вручную/Telethon), IG Insights
   │     report.js           недельный отчёт: динамика, лучшие посты, рекомендации (LLM + эвристики)
   │
   ├── templates/covers/     HTML-шаблоны обложек + render.js (Playwright)
   ├── scripts/telethon_scan.py   опциональный сбор статистики TG-каналов (своего и конкурентов)
   └── public/marketing.html + js/marketing.js + css/marketing.css   дашборд
```

## Модель данных (data/marketing/)

- `settings.json` — бренд, рубрики c долями, сетка времени, тон, автопубликация (по умолчанию **выкл**), лимиты.
- `posts.json` — посты: `{id, status: draft|approved|scheduled|published|rejected|failed, rubric, channel: tg|ig|both, scheduledAt, tg:{text, buttons}, ig:{caption, hashtags, altText}, higgsfieldPrompt, cover:{template, vars, file}, media:{video, photos[]}, results, log[]}`.
- `metrics.json` — временные ряды по дням: TG (подписчики, просмотры*, реакции*), IG (подписчики, охват, показы, вовлечённость). `*` — вручную или Telethon, Bot API их не отдаёт (честное ограничение).
- `reports.json` — недельные отчёты агента.
- `competitors.json` — данные Этапа 1 (импорт из CSV/Telethon + ручной ввод в дашборде).

## Жизненный цикл поста

```
Кнопка «Сгенерировать план на неделю» (или API)
  → planner: слоты по рубрикам и сетке времени
  → writer: тексты TG/IG (+ hashtags, alt) через Claude
  → higgsfield: промпт видео/фото в стиле бренда
  → render: черновая обложка из шаблона (можно перегенерить с другим фоном)
  → status=draft → очередь модерации в дашборде
Модерация: правка текста/даты → approve | reject
  → status=approved, scheduledAt
Scheduler (каждую минуту): наступило время → publisher
  → TG и/или IG → status=published (+ ссылки), ошибки → ретраи → failed + лог
Analytics: ежедневно 21:05 сбор метрик; понедельник 08:00 — отчёт и корректировка плана
```

## Безопасность и ограничения

- Все ключи — только в `.env` (см. `.env.example`); в git не попадают.
- Instagram: ≤ 50 публикаций аккаунта в сутки через API (агент считает и не превышает); медиа должны быть доступны по публичному HTTPS-URL → переменная `PUBLIC_BASE_URL` и деплой с публичным доменом обязательны для IG.
- Telegram Bot API: ~20 сообщений/мин в один канал — публикации агента разнесены по времени, лимит недостижим.
- Парсинг Instagram конкурентов автоматически невозможен легально — в дашборде предусмотрен ручной ввод (см. `docs/competitor-analysis.md`).
- Просмотры/реакции постов TG недоступны через Bot API — либо ручной ввод раз в неделю, либо опциональный `scripts/telethon_scan.py` (MTProto, нужен свой api_id).
