# Настройка публикации в Instagram (пошагово)

Займёт 30–60 минут. Автопостинг в Instagram легально возможен только через **Instagram Graph API**, для этого нужны: бизнес/креатор-аккаунт Instagram, страница Facebook, приложение Meta for Developers.

## 0. Важное предусловие: публичный домен

Graph API принимает медиа **только по публичным HTTPS-URL** — файлы с локального диска загрузить нельзя. Значит, платформа должна быть задеплоена на сервер с доменом (например, `https://oskartravel.uz`), и в `.env` должен быть задан:

```
PUBLIC_BASE_URL=https://oskartravel.uz
```

Пока платформа работает только локально, публикация в Instagram недоступна (Telegram — доступна).

## 1. Переведите Instagram в Business/Creator

Instagram → Настройки → Аккаунт → Переключиться на профессиональный аккаунт → «Бизнес».

## 2. Свяжите с Facebook Page

1. Создайте страницу Facebook для компании (если нет): facebook.com/pages/create.
2. Instagram → Настройки → Центр аккаунтов → Добавить аккаунт Facebook, либо в настройках страницы FB: Настройки → Связанные аккаунты → Instagram → Подключить.

## 3. Создайте приложение Meta

1. [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App → тип **Business**.
2. В приложение добавьте продукт **Instagram Graph API** (и **Facebook Login for Business**).

## 4. Получите долгоживущий токен

Самый простой путь — через Graph API Explorer:

1. [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer) → выберите своё приложение.
2. «Generate Access Token», в правах (permissions) отметьте:
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`
   - `pages_show_list`, `pages_read_engagement`
3. Войдите и разрешите доступ к своей странице FB и IG-аккаунту.
4. Полученный короткоживущий токен обменяйте на долгоживущий (~60 дней):

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<КОРОТКИЙ_ТОКЕН>"
```

Ответ содержит `access_token` — это `IG_ACCESS_TOKEN`. ⚠️ Раз в ~60 дней токен нужно обновлять тем же запросом (поставьте напоминание; при истечении агент запишет ошибку в лог и посты уйдут в `failed` — их можно перепубликовать из дашборда).

## 5. Узнайте ID бизнес-аккаунта Instagram

```bash
# 1) ID вашей страницы FB
curl -s "https://graph.facebook.com/v21.0/me/accounts?access_token=<IG_ACCESS_TOKEN>"
# 2) IG-аккаунт, привязанный к странице
curl -s "https://graph.facebook.com/v21.0/<PAGE_ID>?fields=instagram_business_account&access_token=<IG_ACCESS_TOKEN>"
```

Поле `instagram_business_account.id` (число вида `1784...`) — это `IG_BUSINESS_ACCOUNT_ID`.

## 6. Заполните .env

```
IG_ACCESS_TOKEN=EAAG...
IG_BUSINESS_ACCOUNT_ID=17841400000000000
PUBLIC_BASE_URL=https://oskartravel.uz
```

## 7. Проверка

```bash
curl -s "https://graph.facebook.com/v21.0/$IG_BUSINESS_ACCOUNT_ID?fields=username,followers_count&access_token=$IG_ACCESS_TOKEN"
```

Должно вернуть username и число подписчиков.

## Ограничения API (агент их учитывает)

- **≤ 50 публикаций аккаунта в сутки** — агент ведёт счётчик и не превышает.
- Reels: MP4/MOV, до 15 мин, ≤ 1 ГБ; вертикаль 9:16 рекомендована. Обработка видео занимает 30–120 сек (агент ждёт готовности контейнера).
- Карусель: 2–10 элементов.
- Stories через API доступны не всем типам приложений; в текущей версии агент публикует посты, карусели и Reels.
- App Review: пока приложение в режиме Development, публиковать можно только в аккаунты, добавленные в приложение как тестовые/админские — для собственного аккаунта компании этого достаточно. Для продакшена без ограничений пройдите App Review по правам из шага 4.
