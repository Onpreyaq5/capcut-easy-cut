#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ถอดเสียงอย่างเดียว (สำหรับตัวแก้ซับบนเว็บ) — รับวิดีโอ 1 ไฟล์ คืน words JSON
Usage: python transcribe_only.py <video> [out.json]
"""
import sys, json, os
import capcut_core as cc


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "no input"}, ensure_ascii=False))
        return
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    if not os.path.exists(src):
        print(json.dumps({"ok": False, "error": "file not found: " + src}, ensure_ascii=False))
        return
    # ถ้าเป็นวิดีโอ → ดึงเสียงเป็น wav ก่อน (whisper รับ media ได้อยู่แล้ว แต่ wav เสถียรกว่า)
    data = cc.transcribe(src)
    words = data.get("words", [])
    result = {"ok": True, "words": words, "segments": data.get("segments", [])}
    payload = json.dumps(result, ensure_ascii=False)
    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(payload)
    # ปิดท้ายด้วยบรรทัดพิเศษให้ฝั่ง Node จับผลได้ง่าย (เผื่อ whisper print progress ปน)
    print("__RESULT__" + payload, flush=True)


if __name__ == "__main__":
    main()
