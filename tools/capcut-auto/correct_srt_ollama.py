import argparse
import json
import re
from pathlib import Path

import requests


BLOCK_RE = re.compile(
    r"(?ms)^\s*(\d+)\s*\n(\d\d:\d\d:\d\d[,.]\d{3}\s+-->\s+\d\d:\d\d:\d\d[,.]\d{3})\s*\n(.+?)(?=\n\s*\n\s*\d+\s*\n|\Z)"
)


def read_srt(path: Path):
    text = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    return [
        {"id": int(m.group(1)), "time": m.group(2), "text": " ".join(m.group(3).splitlines()).strip()}
        for m in BLOCK_RE.finditer(text)
    ]


def correct_chunk(items, model, url):
    payload = [{"id": x["id"], "text": x["text"]} for x in items]
    system = (
        "คุณเป็นบรรณาธิการซับไตเติ้ลภาษาไทย แก้ข้อความถอดเสียง ASR ให้เป็นภาษาไทยพูดที่ถูกต้อง "
        "โดยใช้บริบทบรรทัดก่อนและหลัง ห้ามแต่งข้อมูลใหม่ ห้ามย่อ ห้ามเพิ่มหรือลบบรรทัด "
        "คงชื่อบุคคล ตัวเลข และความหมายเดิม ถ้าไม่แน่ใจให้เก็บข้อความเดิม "
        "ศัพท์ยืนยันตามบริบทคลิป: วงการกอล์ฟ, Topgolf, Mizuno, Osaka, interlock, move on, "
        "IG, สตอรี่, ตีแชงก์, ตีท็อป, ฟูลสวิง, กรี๊ดกร๊าด, ค็อกเทล, ความสัมพันธ์, จีรังยั่งยืน "
        "ตอบ JSON เท่านั้นในรูป {\"lines\":[{\"id\":1,\"text\":\"...\"}]}"
    )
    user = "แก้เฉพาะคำที่ถอดผิดในซับต่อไปนี้:\n" + json.dumps(payload, ensure_ascii=False)
    body = {
        "model": model,
        "temperature": 0.1,
        "stream": False,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    response = requests.post(url.rstrip("/") + "/chat/completions", json=body, timeout=600)
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    match = re.search(r"\{[\s\S]*\}", content)
    data = json.loads(match.group(0) if match else content)
    corrected = {int(x["id"]): str(x["text"]).strip() for x in data.get("lines", [])}
    expected = {x["id"] for x in items}
    safe = set(corrected) == expected and all(corrected.get(x["id"], "") for x in items)
    if safe:
        safe = all(len(corrected[x["id"]]) <= max(len(x["text"]) * 2 + 8, 24) for x in items)
    if not safe:
        return {x["id"]: x["text"] for x in items}
    return corrected


def write_srt(path: Path, items):
    body = "\n\n".join(f'{x["id"]}\n{x["time"]}\n{x["text"]}' for x in items) + "\n"
    path.write_text(body, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--model", default="qwen2.5:7b")
    parser.add_argument("--url", default="http://127.0.0.1:11434/v1")
    parser.add_argument("--chunk", type=int, default=24)
    args = parser.parse_args()
    items = read_srt(Path(args.source))
    for start in range(0, len(items), args.chunk):
        group = items[start : start + args.chunk]
        fixed = correct_chunk(group, args.model, args.url)
        for item in group:
            item["text"] = fixed.get(item["id"], item["text"])
        print(f"ตรวจภาษาไทย {min(start + len(group), len(items))}/{len(items)}", flush=True)
    write_srt(Path(args.output), items)


if __name__ == "__main__":
    main()
