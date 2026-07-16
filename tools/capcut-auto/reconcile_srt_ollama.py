import argparse
import json
import re
from pathlib import Path

import requests


BLOCK_RE = re.compile(
    r"(?ms)^\s*(\d+)\s*\n(\d\d:\d\d:\d\d[,.]\d{3}\s+-->\s+\d\d:\d\d:\d\d[,.]\d{3})\s*\n(.+?)(?=\n\s*\n\s*\d+\s*\n|\Z)"
)


def seconds(value):
    h, m, rest = value.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(rest)


def read_srt(path):
    text = Path(path).read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    out = []
    for match in BLOCK_RE.finditer(text):
        left, right = re.split(r"\s+-->\s+", match.group(2))
        out.append({
            "id": int(match.group(1)), "time": match.group(2),
            "start": seconds(left), "end": seconds(right),
            "text": " ".join(match.group(3).splitlines()).strip(),
        })
    return out


def reconcile(group, alternative, model, url):
    start, end = group[0]["start"] - 1.0, group[-1]["end"] + 1.0
    candidates = [x for x in alternative if x["end"] >= start and x["start"] <= end]
    primary = [{"id": x["id"], "text": x["text"]} for x in group]
    evidence = [{"time": x["time"], "text": x["text"]} for x in candidates]
    system = (
        "คุณเป็นผู้ตรวจถอดเสียงภาษาไทยระดับมืออาชีพ มีผล ASR สองโมเดลของเสียงเดียวกัน "
        "ชุดหลักมี id และต้องคงจำนวนบรรทัดเดิม ชุดอ้างอิงมีเวลาเพื่อช่วยฟังเชิงเปรียบเทียบ "
        "เลือกหรือประกอบคำที่มีหลักฐานร่วมกัน แก้พยัญชนะ/สระ/เว้นวรรค ห้ามแต่งเนื้อหาใหม่ "
        "ถ้าสองชุดขัดกันและไม่แน่ใจให้ใช้ชุดหลัก คงภาษาพูดและคำหยาบตามเสียง "
        "ศัพท์ยืนยัน: วงการกอล์ฟ, Topgolf, Mizuno, Osaka, interlock, move on, IG, สตอรี่, "
        "ตีแชงก์, ตีท็อป, ฟูลสวิง, กรี๊ดกร๊าด, ค็อกเทล, ความสัมพันธ์, จีรังยั่งยืน "
        "ตอบ JSON เท่านั้น {\"lines\":[{\"id\":1,\"text\":\"...\"}]}"
    )
    user = (
        "ชุดหลัก:\n" + json.dumps(primary, ensure_ascii=False) +
        "\n\nชุดอ้างอิงจาก Large v3 Turbo:\n" + json.dumps(evidence, ensure_ascii=False)
    )
    body = {
        "model": model, "temperature": 0.05, "stream": False,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    response = requests.post(url.rstrip("/") + "/chat/completions", json=body, timeout=600)
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    match = re.search(r"\{[\s\S]*\}", content)
    data = json.loads(match.group(0) if match else content)
    fixed = {int(x["id"]): str(x["text"]).strip() for x in data.get("lines", [])}
    expected = {x["id"] for x in group}
    safe = set(fixed) == expected and all(fixed.get(x["id"], "") for x in group)
    if safe:
        # Reject line-boundary rewrites: a corrected cue may grow modestly but
        # must not absorb several neighboring cues and leave timing misleading.
        safe = all(
            len(fixed[x["id"]]) <= max(len(x["text"]) * 2 + 8, 24)
            for x in group
        )
    return fixed if safe else {x["id"]: x["text"] for x in group}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("primary")
    parser.add_argument("alternative")
    parser.add_argument("output")
    parser.add_argument("--model", default="qwen2.5:7b")
    parser.add_argument("--url", default="http://127.0.0.1:11434/v1")
    parser.add_argument("--chunk", type=int, default=16)
    args = parser.parse_args()
    primary, alternative = read_srt(args.primary), read_srt(args.alternative)
    for start in range(0, len(primary), args.chunk):
        group = primary[start:start + args.chunk]
        fixed = reconcile(group, alternative, args.model, args.url)
        for item in group:
            item["text"] = fixed[item["id"]]
        print(f"เทียบสองโมเดล {min(start + len(group), len(primary))}/{len(primary)}", flush=True)
    body = "\n\n".join(f'{x["id"]}\n{x["time"]}\n{x["text"]}' for x in primary) + "\n"
    Path(args.output).write_text(body, encoding="utf-8")


if __name__ == "__main__":
    main()
