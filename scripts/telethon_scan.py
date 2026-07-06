#!/usr/bin/env python3
"""Сбор публичной статистики Telegram-каналов (свой канал + конкуренты).

Использование:
    pip install telethon
    export TG_API_ID=12345 TG_API_HASH=abcdef...   # https://my.telegram.org
    python scripts/telethon_scan.py @channel1 @channel2 ...

Выводит CSV-строки в формате data/competitors.csv и пишет полный дамп
в data/tg_scan.json (его можно импортировать в дашборд: Конкуренты → Импорт).

Читаются только публичные каналы через MTProto от имени вашего аккаунта.
Запускайте не чаще раза в неделю, чтобы не упереться в flood-лимиты.
"""
import asyncio
import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from telethon import TelegramClient
except ImportError:
    sys.exit("Установите telethon: pip install telethon")

API_ID = os.environ.get("TG_API_ID")
API_HASH = os.environ.get("TG_API_HASH")
POSTS_LIMIT = 50          # сколько последних постов анализировать
DAYS_WINDOW = 30          # окно для расчёта частоты

if not API_ID or not API_HASH:
    sys.exit("Задайте TG_API_ID и TG_API_HASH (https://my.telegram.org)")

channels = [a for a in sys.argv[1:] if a.strip()]
if not channels:
    sys.exit("Укажите каналы: python scripts/telethon_scan.py @channel1 @channel2")


def classify(msg):
    if msg.video:
        return "video"
    if msg.photo:
        return "photo"
    if msg.grouped_id:
        return "album"
    return "text"


async def scan(client, handle):
    entity = await client.get_entity(handle)
    full = await client.get_entity(entity)
    since = datetime.now(timezone.utc) - timedelta(days=DAYS_WINDOW)

    posts = []
    async for msg in client.iter_messages(entity, limit=POSTS_LIMIT):
        if not msg.date or msg.date < since:
            break
        reactions = 0
        if msg.reactions and msg.reactions.results:
            reactions = sum(r.count for r in msg.reactions.results)
        posts.append({
            "id": msg.id,
            "date": msg.date.isoformat(),
            "views": msg.views or 0,
            "forwards": msg.forwards or 0,
            "reactions": reactions,
            "format": classify(msg),
            "has_buttons": bool(msg.reply_markup),
            "text_preview": (msg.message or "")[:120],
        })

    from telethon.tl.functions.channels import GetFullChannelRequest
    full_info = await client(GetFullChannelRequest(entity))
    followers = full_info.full_chat.participants_count or 0

    n = len(posts)
    avg_views = round(sum(p["views"] for p in posts) / n) if n else 0
    engagement = sum(p["reactions"] + p["forwards"] for p in posts)
    er = round(engagement / n / followers * 100, 2) if n and followers else 0
    per_week = round(n / (DAYS_WINDOW / 7), 1)
    top = sorted(posts, key=lambda p: p["views"], reverse=True)[:3]

    return {
        "handle": handle,
        "title": getattr(entity, "title", handle),
        "followers": followers,
        "posts_30d": n,
        "posts_per_week": per_week,
        "avg_views": avg_views,
        "er_percent": er,
        "top_posts": top,
        "posts": posts,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


async def main():
    out_dir = Path(__file__).resolve().parent.parent / "data"
    results = []
    async with TelegramClient("tg_scan_session", int(API_ID), API_HASH) as client:
        for handle in channels:
            try:
                print(f"Сканирую {handle}...", file=sys.stderr)
                results.append(await scan(client, handle))
            except Exception as e:  # noqa: BLE001 — продолжаем по остальным каналам
                print(f"  ! {handle}: {e}", file=sys.stderr)

    (out_dir / "tg_scan.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    writer = csv.writer(sys.stdout)
    writer.writerow(["name", "platform", "handle", "followers", "posts_per_week",
                     "avg_views", "avg_likes", "avg_comments", "er_percent",
                     "formats", "visual_style_unified", "offers_prices",
                     "best_content", "notes", "checked_at"])
    for r in results:
        formats = ",".join(sorted({p["format"] for p in r["posts"]}))
        best = " | ".join(p["text_preview"][:40] for p in r["top_posts"])
        writer.writerow([r["title"], "telegram", r["handle"], r["followers"],
                         r["posts_per_week"], r["avg_views"], "", "",
                         r["er_percent"], formats, "", "", best, "",
                         r["checked_at"][:10]])
    print(f"\nПолный дамп: {out_dir / 'tg_scan.json'}", file=sys.stderr)


asyncio.run(main())
