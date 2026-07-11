#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""สร้างโปรเจกต์ CapCut จากซับที่ผู้ใช้แก้ในตัวแก้ซับบนเว็บ (/editor)
ต่างจาก build_capcut.py: ไม่ถอดเสียงใหม่ ไม่ตัด dead air — ใช้วิดีโอเดิม + captions ที่แก้แล้วตรง ๆ

Usage: python build_from_editor.py --video <path> --name <proj> --project <project.json>
project.json = { "lines": [ { "words": [ {"text","start","end"}, ... ] }, ... ],
                 "style": { font, fontSizePct, yPercent, strokeWidthPx, color, highlightColor, noSpace, template } }
"""
import sys, os, json, argparse
import capcut_core as cc


def _hex_rgb(h):
    h = (h or "").lstrip("#")
    if len(h) != 6:
        return None
    try:
        return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    except ValueError:
        return None


def apply_style(brand, style):
    """map ค่าสไตล์จากเว็บ -> brand (ให้ตรงกับ build_capcut.py)"""
    font = (style.get("font") or "").strip()
    if font:
        fp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "fonts", font + ".ttf")
        if os.path.exists(fp):
            brand["font_path"] = fp
            print(f"ฟอนต์: {font}", flush=True)
        else:
            print(f"   !! ไม่พบฟอนต์ {font} — ใช้ค่าเริ่มต้น", flush=True)
    # ขนาด: เว็บใช้ % ของความสูงจอ (default 6%) -> brand.font_size (default 12) => *2
    fsp = float(style.get("fontSizePct") or 0)
    if fsp > 0:
        brand["font_size"] = round(fsp * 2.0, 2)
    # ตำแหน่งแนวตั้ง: เว็บ 0(บน)-100(ล่าง) default 74 -> CapCut y (0=กลาง,-1=บน,+1=ล่าง)
    yp = style.get("yPercent")
    if yp is not None:
        brand["word_y_pos"] = round((float(yp) - 50.0) / 50.0, 3)
    # ความหนาขอบ: เว็บ px@1280 (default 10) -> brand.border_width (default 0.16) => /62.5
    sw = style.get("strokeWidthPx")
    if sw is not None:
        brand["border_width"] = round(float(sw) / 62.5, 3)
    c = _hex_rgb(style.get("color"))
    if c:
        brand["white"] = c
    hl = _hex_rgb(style.get("highlightColor"))
    if hl:
        brand["yellow"] = hl
    return brand


def build_caps(lines, no_space):
    """แต่ละบรรทัด -> 1 caption tuple (start, end, text, {'style':'word'})"""
    caps = []
    join = "" if no_space else " "
    for ln in lines:
        words = ln.get("words") or []
        words = [w for w in words if (w.get("text") or "").strip()]
        if not words:
            continue
        start = float(words[0]["start"])
        end = float(words[-1]["end"])
        if end <= start:
            end = start + 0.4
        text = join.join((w.get("text") or "").strip() for w in words)
        caps.append((start, end, text, {"style": "word"}))
    return caps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--name", default="CAPCUT_Easy_CUT")
    ap.add_argument("--project", required=True, help="ไฟล์ JSON ของโปรเจกต์ซับ")
    a = ap.parse_args()

    if not os.path.exists(a.video):
        print("__RESULT__" + json.dumps({"ok": False, "error": "ไม่พบวิดีโอ"}, ensure_ascii=False), flush=True)
        return
    proj = json.load(open(a.project, encoding="utf-8"))
    style = proj.get("style") or {}
    lines = proj.get("lines") or []

    brand = cc.load_brand()
    brand = apply_style(brand, style)

    caps = build_caps(lines, bool(style.get("noSpace")))
    if not caps:
        print("__RESULT__" + json.dumps({"ok": False, "error": "ไม่มีซับให้สร้าง"}, ensure_ascii=False), flush=True)
        return

    print(f"เตรียมสร้างโปรเจกต์ CapCut จากซับที่แก้แล้ว ({len(caps)} แคปชัน)...", flush=True)
    total_dur = cc.ffprobe_dur(a.video)
    if not total_dur or total_dur <= 0:
        total_dur = caps[-1][1] + 1.0

    # clamp เวลา caption ไม่ให้เกินความยาววิดีโอ
    caps = [(s, min(e, total_dur), t, m) for (s, e, t, m) in caps if s < total_dur]

    out_dir, tpl, (w, h) = cc.build_draft(
        a.video, a.name, caps, int(total_dur * 1_000_000), None, brand, sfx=None,
    )
    print("__RESULT__" + json.dumps({"ok": True, "outDir": out_dir, "name": a.name, "captions": len(caps)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
