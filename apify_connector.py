from __future__ import annotations

import json
import os
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


APIFY_BASE_URL = "https://api.apify.com/v2"
POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 180


class ApifyConnectorError(RuntimeError):
    pass


def normalize(value: Any) -> str:
    return str(value or "").strip()


def get_apify_token() -> str:
    token = os.environ.get("APIFY_TOKEN", "").strip()
    if not token:
        raise ApifyConnectorError("环境变量 APIFY_TOKEN 未设置")
    return token


def actor_id_candidates(actor_id: str) -> list[str]:
    cleaned = actor_id.strip()
    if not cleaned:
        return []
    candidates = [cleaned]
    if "/" in cleaned:
        candidates.append(cleaned.replace("/", "~"))
    return list(dict.fromkeys(candidates))


def _request_json(url: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "DACH-IB-Prospecting-Agent/2.0",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise ApifyConnectorError(f"Apify 请求失败：HTTP {exc.code} {details}") from exc
    except URLError as exc:
        raise ApifyConnectorError(f"Apify 网络请求失败：{exc}") from exc


def _request_json_list(url: str) -> list[dict[str, Any]]:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "DACH-IB-Prospecting-Agent/2.0",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise ApifyConnectorError(f"读取 Apify dataset 失败：HTTP {exc.code} {details}") from exc
    except URLError as exc:
        raise ApifyConnectorError(f"读取 Apify dataset 网络失败：{exc}") from exc
    if not isinstance(data, list):
        raise ApifyConnectorError("Apify dataset 返回格式异常，不是列表")
    return data


def _pick_string(item: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _pick_int(item: dict[str, Any], keys: list[str]) -> int:
    for key in keys:
        value = item.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str) and value.strip():
            match = re.search(r"([0-9][0-9,._]*\s*[KkMm]?)", value)
            if match:
                return compact_number_to_int(match.group(1))
    return 0


def compact_number_to_int(value: str) -> int:
    clean = value.replace(",", "").replace("_", "").strip().lower()
    multiplier = 1
    if clean.endswith("k"):
        multiplier = 1000
        clean = clean[:-1]
    elif clean.endswith("m"):
        multiplier = 1000000
        clean = clean[:-1]
    try:
        return int(float(clean) * multiplier)
    except ValueError:
        return 0


def normalize_profile_url(item: dict[str, Any]) -> str:
    return _pick_string(
        item,
        [
            "profileUrl",
            "url",
            "inputUrl",
            "ownerProfileUrl",
            "ownerUrl",
            "externalUrl",
            "link",
        ],
    )


def normalize_bio(item: dict[str, Any]) -> str:
    bio = _pick_string(
        item,
        [
            "bio",
            "biography",
            "description",
            "caption",
            "fullText",
            "about",
        ],
    )
    if bio:
        return bio
    for nested_key in ["owner", "author", "profile", "user"]:
        nested = item.get(nested_key)
        if isinstance(nested, dict):
            nested_bio = _pick_string(nested, ["bio", "biography", "description", "about"])
            if nested_bio:
                return nested_bio
    return ""


def normalize_name(item: dict[str, Any]) -> str:
    name = _pick_string(
        item,
        [
            "name",
            "fullName",
            "username",
            "userName",
            "ownerUsername",
            "ownerFullName",
            "title",
        ],
    )
    if name:
        return name
    for nested_key in ["owner", "author", "profile", "user"]:
        nested = item.get(nested_key)
        if isinstance(nested, dict):
            nested_name = _pick_string(nested, ["fullName", "username", "userName", "name"])
            if nested_name:
                return nested_name
    return "未知线索"


def normalize_country_signal(item: dict[str, Any], country: str, keywords: list[str], bio: str) -> str:
    explicit = _pick_string(item, ["country", "countrySignal", "location", "region"])
    if explicit:
        return explicit
    joined = " ".join(keywords)
    text = " ".join(part for part in [country, joined, bio] if part)
    return text.strip()


def normalize_language_signal(item: dict[str, Any], bio: str) -> str:
    explicit = _pick_string(item, ["language", "languageSignal", "lang"])
    if explicit:
        return explicit
    return bio


def normalize_funnel_signals(item: dict[str, Any], bio: str) -> list[str]:
    explicit = item.get("funnel_signals") or item.get("funnelSignals")
    if isinstance(explicit, list):
        return sorted({normalize(signal).lower() for signal in explicit if normalize(signal)})

    text = " ".join(
        part
        for part in [
            bio,
            _pick_string(item, ["externalUrl", "website", "link", "bioLinks"]),
            _pick_string(item, ["businessEmail", "email"]),
        ]
        if part
    ).lower()
    signals: list[str] = []
    if "telegram" in text or "t.me/" in text:
        signals.append("telegram")
    if "whatsapp" in text or "wa.me/" in text:
        signals.append("whatsapp")
    if "discord" in text:
        signals.append("discord")
    if "linktr.ee" in text or "linktree" in text:
        signals.append("linktree")
    if "http://" in text or "https://" in text or "website" in text:
        signals.append("website")
    if re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", text):
        signals.append("email")
    if re.search(r"\bdm\b", text) or "message me" in text or "inbox" in text:
        signals.append("dm_cta")
    return sorted(set(signals))


def normalize_monetization_signals(item: dict[str, Any], bio: str) -> list[str]:
    explicit = item.get("monetization_signals") or item.get("monetizationSignals")
    if isinstance(explicit, list):
        return sorted({normalize(signal).lower() for signal in explicit if normalize(signal)})

    text = " ".join(
        part
        for part in [
            bio,
            _pick_string(item, ["description", "caption", "fullText"]),
        ]
        if part
    ).lower()
    signals: list[str] = []
    if "signal" in text or "signals" in text:
        signals.append("signals")
    if "coaching" in text or "coach" in text:
        signals.append("coaching")
    if "course" in text or "academy" in text or "masterclass" in text:
        signals.append("course")
    if "vip" in text:
        signals.append("vip")
    if "paid community" in text or "premium group" in text or "private community" in text:
        signals.append("paid_community")
    if "copy trading" in text or "copytrading" in text or "copy trade" in text:
        signals.append("copy_trading")
    if "mentor" in text or "mentoring" in text:
        signals.append("mentoring")
    return sorted(set(signals))


def normalize_item(item: dict[str, Any], platform: str, country: str, keywords: list[str]) -> dict[str, Any]:
    bio = normalize_bio(item)
    normalized = {
        "name": normalize_name(item),
        "platform": platform,
        "profile_url": normalize_profile_url(item),
        "bio": bio,
        "followers": _pick_int(item, ["followers", "followersCount", "followerCount", "followers_count"]),
        "posts": _pick_int(item, ["posts", "postsCount", "posts_count", "videosCount"]),
        "country_signal": normalize_country_signal(item, country, keywords, bio),
        "language_signal": normalize_language_signal(item, bio),
        "funnel_signals": normalize_funnel_signals(item, bio),
        "monetization_signals": normalize_monetization_signals(item, bio),
        "source_raw": item,
    }
    return normalized


def run_actor(actor_id: str, platform: str, country: str, keywords: list[str], max_leads: int) -> list[dict[str, Any]]:
    token = get_apify_token()
    if not actor_id.strip():
        raise ApifyConnectorError("缺少 actor_id")
    run_id = ""
    last_error = ""
    actor_input = {
        "platform": platform,
        "country": country,
        "keywords": keywords,
        "max_leads": max_leads,
        "maxItems": max_leads,
        "search": " ".join([country, *keywords]).strip(),
        "searchStringsArray": [f"{country} {keyword}".strip() for keyword in keywords],
    }
    for candidate in actor_id_candidates(actor_id):
        actor_path = quote(candidate, safe="~")
        run_url = f"{APIFY_BASE_URL}/acts/{actor_path}/runs?token={token}"
        try:
            run_response = _request_json(run_url, method="POST", payload=actor_input)
        except ApifyConnectorError as exc:
            last_error = str(exc)
            continue
        run_data = run_response.get("data") or {}
        run_id = normalize(run_data.get("id"))
        if run_id:
            break
    if not run_id:
        raise ApifyConnectorError(last_error or "Apify Actor 启动失败，未返回 run id")

    started_at = time.time()
    dataset_id = ""
    while time.time() - started_at < POLL_TIMEOUT_SECONDS:
        status_url = f"{APIFY_BASE_URL}/actor-runs/{quote(run_id, safe='')}" f"?token={token}"
        status_response = _request_json(status_url)
        status_data = status_response.get("data") or {}
        status = normalize(status_data.get("status")).upper()
        dataset_id = normalize(status_data.get("defaultDatasetId"))
        if status == "SUCCEEDED":
            break
        if status in {"FAILED", "ABORTED", "TIMED-OUT"}:
            raise ApifyConnectorError(f"Apify Actor 运行失败，状态：{status}")
        time.sleep(POLL_INTERVAL_SECONDS)
    else:
        raise ApifyConnectorError("Apify Actor 运行超时")

    if not dataset_id:
        raise ApifyConnectorError("Apify Actor 已完成，但未返回 default dataset")

    dataset_url = f"{APIFY_BASE_URL}/datasets/{quote(dataset_id, safe='')}/items?token={token}&clean=true&format=json"
    items = _request_json_list(dataset_url)
    normalized_items: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            normalized_items.append(normalize_item(item, platform, country, keywords))
    return normalized_items
