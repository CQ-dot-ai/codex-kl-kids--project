#!/usr/bin/env python3

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


GRAPH_VERSION = os.getenv("WHATSAPP_GRAPH_VERSION", "v21.0")
PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
TEMPLATE_NAME = os.getenv("WHATSAPP_TEMPLATE_NAME", "weekly_kids_plan")
LANGUAGE_CODE = os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "zh_CN")


def send_template(to_number: str, place_name: str, weather_note: str, plan_url: str) -> dict:
    if not PHONE_NUMBER_ID or not ACCESS_TOKEN:
        raise RuntimeError("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN")

    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {
            "name": TEMPLATE_NAME,
            "language": {"code": LANGUAGE_CODE},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": place_name},
                        {"type": "text", "text": weather_note},
                        {"type": "text", "text": plan_url},
                    ],
                }
            ],
        },
    }
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{PHONE_NUMBER_ID}/messages"
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"WhatsApp API error {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"WhatsApp API request failed: {exc}") from exc


if __name__ == "__main__":
    print(
        json.dumps(
            send_template(
                to_number=os.environ["WHATSAPP_TO_NUMBER"],
                place_name=os.getenv("WHATSAPP_PLACE_NAME", "Petrosains KLCC"),
                weather_note=os.getenv("WHATSAPP_WEATHER_NOTE", "周末可能有雨，建议室内"),
                plan_url=os.getenv("WHATSAPP_PLAN_URL", "https://your-domain.example/"),
            ),
            ensure_ascii=False,
            indent=2,
        )
    )
