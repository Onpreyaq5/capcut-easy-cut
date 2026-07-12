#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""เรนเดอร์วิดีโอฝังซับ (สำหรับเวอร์ชันเว็บ) — ได้ .mp4 ที่ใช้ที่ไหนก็ได้ ไม่ต้องมี CapCut
แปลงซับที่แก้ในเว็บ -> ASS (คาราโอเกะไล่สีทีละคำ native) -> ffmpeg burn ลงวิดีโอ

Usage: python render_video.py --video <in> --project <project.json> --out <out.mp4> [--watermark]
project.json = { "lines":[{"words":[{"text","start","end"}]}], "style":{...} }
"""
import sys, os, json, argparse, shutil, tempfile, subprocess
import capcut_core as cc
import build_from_editor as bfe

_KARAOKE = bfe._KARAOKE_TEMPLATES


def hex_to_ass(hexc):
    """#RRGGBB -> ASS &HBBGGRR (ทึบ)"""
    h = (hexc or "#FFFFFF").lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def ass_time(t):
    if t < 0:
        t = 0
    h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60)
    cs = int(round((t - int(t)) * 100))
    if cs == 100:
        cs = 0; s += 1
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass(lines, style, W, H, karaoke, no_space):
    fontname = (style.get("font") or "Leelawadee UI").strip()
    fs = int(round(float(style.get("fontSizePct") or 6) / 100.0 * H))
    yp = float(style.get("yPercent") if style.get("yPercent") is not None else 74)
    margin_v = int(max(10, (100.0 - yp) / 100.0 * H - fs * 0.5))
    outline = round(float(style.get("strokeWidthPx") if style.get("strokeWidthPx") is not None else 10) / 1280.0 * H, 1)
    primary = hex_to_ass(style.get("highlightColor") or "#FFE400")  # สีคำที่ร้องถึงแล้ว (karaoke fill)
    secondary = hex_to_ass(style.get("color") or "#FFFFFF")          # สีคำที่ยังไม่ถึง
    base = hex_to_ass(style.get("color") or "#FFFFFF")               # ไม่คาราโอเกะ = สีเดียว
    sep = "" if no_space else " "

    # ถ้าไม่คาราโอเกะ ใช้สีตัวอักษรเป็น Primary ตรง ๆ
    prim = primary if karaoke else base
    style_line = (
        f"Style: Main,{fontname},{fs},{prim},{secondary},&H00000000,&H64000000,"
        f"-1,0,0,0,100,100,0,0,1,{outline},0,2,60,60,{margin_v},1"
    )

    events = []
    for ln in lines:
        words = [w for w in (ln.get("words") or []) if (w.get("text") or "").strip()]
        if not words:
            continue
        st = float(words[0]["start"])
        en = float(words[-1]["end"])
        if en <= st:
            en = st + 0.4
        if karaoke:
            parts = []
            for i, w in enumerate(words):
                ws = float(w["start"])
                we = float(words[i + 1]["start"]) if i + 1 < len(words) else en
                dur_cs = max(1, int(round((we - ws) * 100)))
                txt = (w.get("text") or "").strip().replace("{", "").replace("}", "")
                parts.append(f"{{\\kf{dur_cs}}}{txt}")
            text = sep.join(parts)
        else:
            text = sep.join((w.get("text") or "").strip().replace("{", "").replace("}", "") for w in words)
        events.append(f"Dialogue: 0,{ass_time(st)},{ass_time(en)},Main,,0,0,0,,{text}")

    header = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 2\nScaledBorderAndShadow: yes\n"
        f"PlayResX: {W}\nPlayResY: {H}\n\n"
        "[V4+ Styles]\n"
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,"
        "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,"
        "Alignment,MarginL,MarginR,MarginV,Encoding\n"
        f"{style_line}\n\n"
        "[Events]\n"
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n"
        + "\n".join(events) + "\n"
    )
    return header


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--project", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--watermark", action="store_true", help="ใส่ลายน้ำ (สำหรับ Free tier)")
    a = ap.parse_args()

    if not os.path.exists(a.video):
        print("__RESULT__" + json.dumps({"ok": False, "error": "ไม่พบวิดีโอ"}, ensure_ascii=False), flush=True)
        return
    proj = json.load(open(a.project, encoding="utf-8"))
    style = proj.get("style") or {}
    lines = proj.get("lines") or []
    if not lines:
        print("__RESULT__" + json.dumps({"ok": False, "error": "ไม่มีซับ"}, ensure_ascii=False), flush=True)
        return

    W, H = cc.ffprobe_wh(a.video)
    template = (style.get("template") or "karaoke").strip()
    karaoke = template in _KARAOKE
    ass = build_ass(lines, style, W, H, karaoke, bool(style.get("noSpace")))

    work = tempfile.mkdtemp(prefix="ec_render_")
    try:
        # เขียน ASS + เตรียมโฟลเดอร์ฟอนต์ (relative เพื่อเลี่ยงปัญหา escape path บน Windows)
        ass_path = os.path.join(work, "subs.ass")
        open(ass_path, "w", encoding="utf-8").write(ass)
        fonts_dir = os.path.join(work, "fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        src_fonts = os.path.join(bfe.os.path.dirname(os.path.abspath(__file__)), "assets", "fonts")
        if os.path.isdir(src_fonts):
            for f in os.listdir(src_fonts):
                if f.lower().endswith((".ttf", ".otf")):
                    shutil.copy2(os.path.join(src_fonts, f), fonts_dir)

        vf = "subtitles=subs.ass:fontsdir=fonts"
        if a.watermark:
            # drawtext บน Windows ต้องระบุ fontfile (relative กัน path colon) — เลือกฟอนต์ที่ copy มาแล้ว
            wm_font = "fonts/Kanit.ttf" if os.path.exists(os.path.join(fonts_dir, "Kanit.ttf")) else None
            font_arg = f"fontfile={wm_font}:" if wm_font else ""
            vf += (",drawtext=" + font_arg + "text='CAPCUT Easy CUT':fontcolor=white@0.55:fontsize="
                   + str(max(16, int(H * 0.028))) + ":x=w-tw-24:y=24:box=1:boxcolor=black@0.28:boxborderw=8")

        out_abs = os.path.abspath(a.out)
        cmd = [cc.FFMPEG, "-y", "-i", os.path.abspath(a.video),
               "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
               "-c:a", "aac", "-b:a", "160k", out_abs]
        r = subprocess.run(cmd, cwd=work, capture_output=True, text=True, encoding="utf-8", errors="ignore")
        if r.returncode != 0 or not os.path.exists(out_abs):
            print("__RESULT__" + json.dumps({"ok": False, "error": "ffmpeg เรนเดอร์ไม่สำเร็จ: " + (r.stderr or "")[-500:]}, ensure_ascii=False), flush=True)
            return
        size = os.path.getsize(out_abs)
        print("__RESULT__" + json.dumps({"ok": True, "out": out_abs, "w": W, "h": H, "bytes": size, "karaoke": karaoke}, ensure_ascii=False), flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
