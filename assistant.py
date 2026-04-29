#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import uuid
from datetime import date, datetime, timezone
from html import unescape
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
STATIC_DIR = ROOT / "static"
PLACES_FILE = DATA_DIR / "kids_places.json"
EVENTS_FILE = DATA_DIR / "live_events.json"

FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}

EVENT_SOURCES = [
    {
        "name": "Little Steps KL family events",
        "url": "https://www.littlestepsasia.com/kuala-lumpur/events/seasonal-events-guides/top-family-friendly-events/",
    },
    {
        "name": "Little Steps KL summer camps",
        "url": "https://www.littlestepsasia.com/kuala-lumpur/learn/holiday-camps/best-summer-camps/",
    },
    {
        "name": "Makchic things to do",
        "url": "https://www.makchic.com/things-to-do-in-april-2026/",
    },
]


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PLACES_FILE.exists():
        PLACES_FILE.write_text("[]\n", encoding="utf-8")
    if not EVENTS_FILE.exists():
        EVENTS_FILE.write_text('{"last_synced_at": "", "events": []}\n', encoding="utf-8")


def read_json(path: Path, fallback: Any) -> Any:
    ensure_storage()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError):
        return fallback


def write_json(path: Path, payload: Any) -> None:
    ensure_storage()
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_html(value: str) -> str:
    value = re.sub(r"<script.*?</script>", " ", value, flags=re.IGNORECASE | re.DOTALL)
    value = re.sub(r"<style.*?</style>", " ", value, flags=re.IGNORECASE | re.DOTALL)
    return normalize_space(unescape(re.sub(r"<[^>]+>", " ", value)))


def fetch_url(url: str) -> str:
    request = Request(url, headers=FETCH_HEADERS)
    with urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="ignore")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or str(uuid.uuid4())


def parse_iso(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def event_status(event: dict[str, Any]) -> str:
    today = date.today()
    start = parse_iso(str(event.get("start_date") or ""))
    end = parse_iso(str(event.get("end_date") or "")) or start
    if not start:
        return "unknown"
    if end and end < today:
        return "past"
    if start > today:
        return "upcoming"
    return "ongoing"


def enrich_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    enriched = []
    for event in events:
        row = {**event}
        row["status"] = event_status(row)
        enriched.append(row)
    return sorted(
        enriched,
        key=lambda item: (
            {"ongoing": 0, "upcoming": 1, "unknown": 2, "past": 3}.get(item.get("status"), 2),
            item.get("start_date") or "9999-12-31",
        ),
    )


def month_number(month_name: str) -> str:
    months = {
        "jan": "01",
        "feb": "02",
        "mar": "03",
        "apr": "04",
        "may": "05",
        "jun": "06",
        "jul": "07",
        "aug": "08",
        "sep": "09",
        "oct": "10",
        "nov": "11",
        "dec": "12",
    }
    return months.get(month_name[:3].lower(), "")


def extract_dates(text: str) -> tuple[str, str, str]:
    normalized = normalize_space(text)
    range_match = re.search(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2}),?\s*(2026)",
        normalized,
        flags=re.IGNORECASE,
    )
    if range_match:
        month, start_day, end_day, year = range_match.groups()
        month_no = month_number(month)
        return (
            f"{year}-{month_no}-{int(start_day):02d}",
            f"{year}-{month_no}-{int(end_day):02d}",
            range_match.group(0),
        )

    full_range = re.search(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}).{0,16}?"
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(2026)",
        normalized,
        flags=re.IGNORECASE,
    )
    if full_range:
        start_month, start_day, end_month, end_day, year = full_range.groups()
        return (
            f"{year}-{month_number(start_month)}-{int(start_day):02d}",
            f"{year}-{month_number(end_month)}-{int(end_day):02d}",
            full_range.group(0),
        )

    single = re.search(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(2026)",
        normalized,
        flags=re.IGNORECASE,
    )
    if single:
        month, day, year = single.groups()
        iso = f"{year}-{month_number(month)}-{int(day):02d}"
        return iso, iso, single.group(0)
    return "", "", ""


def extract_venue(text: str) -> str:
    venue_match = re.search(r"Venue:\s*([^.\n]+)", text, flags=re.IGNORECASE)
    if venue_match:
        return normalize_space(venue_match.group(1)).replace("</", "").replace("<", "")[:180]
    where_match = re.search(r"Where:\s*([^.\n]+)", text, flags=re.IGNORECASE)
    if where_match:
        return normalize_space(where_match.group(1)).replace("</", "").replace("<", "")[:180]
    return "地点待确认"


def extract_age_text(text: str) -> str:
    match = re.search(r"Ages?\s+([0-9][0-9+\-\s]*(?:above)?)", text, flags=re.IGNORECASE)
    if match:
        return f"{normalize_space(match.group(1))} 岁"
    return "年龄待确认"


def event_blocks_from_html(html: str) -> list[tuple[str, str]]:
    blocks = re.split(r"<h[2-4][^>]*>", html, flags=re.IGNORECASE)
    rows: list[tuple[str, str]] = []
    for block in blocks[1:]:
        title_html, _, body_html = block.partition("</h")
        title = strip_html(title_html)
        body = strip_html(body_html)[:2500]
        if len(title) >= 4 and any(term in f"{title} {body}".lower() for term in ["kid", "family", "age", "children", "camp", "workshop", "play"]):
            rows.append((title, body))
    return rows


def scrape_source_events(source: dict[str, str]) -> list[dict[str, Any]]:
    html = fetch_url(source["url"])
    events: list[dict[str, Any]] = []
    for title, body in event_blocks_from_html(html):
        start_date, end_date, date_text = extract_dates(body)
        if not start_date and "daily" not in body.lower():
            continue
        events.append(
            {
                "id": slugify(f"{source['name']} {title} {start_date}"),
                "title": title[:140],
                "date_text": date_text or "日期待确认",
                "start_date": start_date,
                "end_date": end_date or start_date,
                "venue": extract_venue(body),
                "age_text": extract_age_text(f"{title} {body}"),
                "fit_note": "公开活动源同步结果，出发前建议点来源确认报名和名额。",
                "source_url": source["url"],
            }
        )
    return events


def merge_events(existing: list[dict[str, Any]], fresh: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for event in existing + fresh:
        key = event.get("id") or slugify(f"{event.get('title')} {event.get('start_date')}")
        merged[str(key)] = {**event, "id": str(key)}
    return enrich_events(list(merged.values()))


def sync_events() -> dict[str, Any]:
    store = read_json(EVENTS_FILE, {"last_synced_at": "", "events": []})
    fresh: list[dict[str, Any]] = []
    errors: list[str] = []
    for source in EVENT_SOURCES:
        try:
            fresh.extend(scrape_source_events(source))
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append(f"{source['name']}: {exc}")
    events = merge_events(store.get("events", []), fresh)
    payload = {
        "last_synced_at": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
        "events": events,
        "errors": errors,
    }
    write_json(EVENTS_FILE, payload)
    return payload


class KidsKlHandler(BaseHTTPRequestHandler):
    server_version = "KidsKLRadar/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/places":
            self.respond_json({"places": read_json(PLACES_FILE, [])})
            return
        if parsed.path == "/api/events":
            store = read_json(EVENTS_FILE, {"last_synced_at": "", "events": []})
            self.respond_json(
                {
                    "last_synced_at": store.get("last_synced_at", ""),
                    "events": enrich_events(store.get("events", [])),
                }
            )
            return
        if parsed.path in {"/", "/index.html"}:
            self.serve_static("index.html", "text/html; charset=utf-8")
            return
        if parsed.path == "/app.js":
            self.serve_static("app.js", "application/javascript; charset=utf-8")
            return
        if parsed.path == "/styles.css":
            self.serve_static("styles.css", "text/css; charset=utf-8")
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/events/sync":
            try:
                payload = sync_events()
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"error": f"同步失败：{exc}"}, status=HTTPStatus.BAD_GATEWAY)
                return
            status = HTTPStatus.OK if not payload.get("errors") else HTTPStatus.MULTI_STATUS
            self.respond_json(payload, status=status)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def log_message(self, format: str, *args: Any) -> None:
        return

    def respond_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, filename: str, content_type: str) -> None:
        path = STATIC_DIR / filename
        if not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(host: str, port: int) -> None:
    ensure_storage()
    server = ThreadingHTTPServer((host, port), KidsKlHandler)
    print(f"Serving KL Kids Weekend Radar on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="KL kids weekend radar.")
    parser.add_argument("--serve", action="store_true", help="运行本地网页应用")
    parser.add_argument("--host", default="127.0.0.1", help="本地服务地址")
    parser.add_argument("--port", type=int, default=8000, help="本地服务端口")
    args = parser.parse_args()
    if args.serve:
        run_server(args.host, args.port)
        return
    parser.print_help()


if __name__ == "__main__":
    main()
