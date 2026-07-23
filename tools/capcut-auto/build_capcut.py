# -*- coding: utf-8 -*-
"""
build_capcut.py — รวมคลิป Flow ทั้งชุด -> โปรเจกต์ CapCut พร้อมซับอัตโนมัติ

ใช้:
  python build_capcut.py --clips "โฟลเดอร์คลิป" --name "ชื่องาน" [--script script.json]
     [--brand brand.json] [--no-transitions]

--script script.json : บทซับจากเว็บ (ถูกเป๊ะ) รูปแบบ {"scenes":[{"voiceoverTH":"..."}...]}
                       หรือ ["ข้อความช็อต1","ข้อความช็อต2",...]  (เรียงตามลำดับคลิป)
ถ้าไม่ส่ง --script จะถอดเสียงจากคลิปด้วย whisper แทน
ผลลัพธ์: โปรเจกต์ CapCut ชื่อ NAME (เปิด CapCut ใหม่แล้วเห็นเลย) + ไฟล์รวม _capcut_work/combined.mp4
"""
import json, os, sys, io, re, argparse, glob
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capcut_core as cc

VIDEO_EXT = (".mp4", ".mov", ".mkv", ".webm", ".m4v")


def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def load_script(path, n_clips):
    if not path or not os.path.exists(path):
        return None
    data = json.load(open(path, encoding="utf-8"))
    if isinstance(data, dict) and "scenes" in data:
        texts = [(s.get("voiceoverTH") or s.get("text") or "").strip() for s in data["scenes"]]
    elif isinstance(data, list):
        texts = [(x if isinstance(x, str) else (x.get("voiceoverTH") or x.get("text") or "")).strip()
                 for x in data]
    else:
        return None
    return texts


def cap_text(cap):
    return cap[2]


def cap_meta(cap):
    return cap[3] if len(cap) >= 4 and isinstance(cap[3], dict) else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True, help="โฟลเดอร์ที่มีคลิป (เรียงตามชื่อ 01,02,03..)")
    ap.add_argument("--name", required=True)
    ap.add_argument("--script", default="")
    ap.add_argument("--brand", default="")
    ap.add_argument("--no-transitions", action="store_true")
    ap.add_argument("--hook", default="", help='ข้อความ hook เขียวล่างจอ ("auto" = ใช้ประโยคแรก)')
    ap.add_argument("--words", type=int, default=0, help="จำนวนคำต่อ 1 ซับ (0 = อัตโนมัติ)")
    ap.add_argument("--cut-flubs", action="store_true",
                    help="ตัดคำพูดติดขัด/พูดผิดออก (เอ่อ อ่า, พูดซ้ำ, retake/blooper); มี --llm-* จะใช้ AI ตัด retake ด้วย")
    ap.add_argument("--bgm", default="", help="ไฟล์เพลงประกอบ (จะคลอทั้งคลิป)")
    ap.add_argument("--remove-vocals", action="store_true", help="ตัดเสียงร้องออกจากเพลง BGM (เหลือแต่ดนตรี)")
    ap.add_argument("--bgm-volume", type=float, default=0.12, help="ระดับเสียงเพลงประกอบ 0-1")
    ap.add_argument("--whoosh", default="", help="SFX ตรงรอยต่อคลิป (วูช)")
    ap.add_argument("--intro", default="", help="SFX ตอนเปิดคลิป")
    ap.add_argument("--ding", default="", help="SFX เน้นคำสำคัญ (ใส่หลายไฟล์คั่นด้วย ',' เพื่อสลับเสียง)")
    ap.add_argument("--auto-sfx", action="store_true", help="ใช้ SFX ในตัว (วูช/เปิดคลิป/เน้นคำ) ที่ bundle มาให้ฟรี")
    # ---- สไตล์ซับ (เลือกได้จากเว็บ) ----
    ap.add_argument("--font", default="", help="ชื่อฟอนต์ (Kanit/Prompt/Sarabun/... ที่ bundle มา)")
    ap.add_argument("--font-size", type=float, default=0, help="ขนาดตัวอักษรฐาน (0 = ตามค่าเริ่มต้น)")
    ap.add_argument("--sub-y", type=float, default=999, help="ตำแหน่งซับแนวตั้ง -1..1 (999 = ค่าเริ่มต้น)")
    ap.add_argument("--border-width", type=float, default=-1, help="ความหนาเส้นขอบ (-1 = ค่าเริ่มต้น)")
    ap.add_argument("--text-color", default="", help="สีตัวอักษร hex เช่น #FFFFFF")
    ap.add_argument("--hl-color", default="", help="สีคำเน้น (highlight) hex เช่น #FFE400")
    ap.add_argument("--hook-logo", default="", help="ภาพโลโก้ Hook (1-2 ไฟล์ คั่นด้วย ',') ฝังลงช่วงเปิดคลิป")
    ap.add_argument("--hook-title", default="", help="ข้อความใหญ่บน Hook (เช่น 'ตัดต่อ')")
    ap.add_argument("--hook-dur", type=float, default=5.0, help="ความยาว Hook (วินาที)")
    ap.add_argument("--llm-provider", default="", help="ตรวจแก้ภาษาไทยในซับ: groq/cerebras/openrouter/gemini/openai/anthropic/local")
    ap.add_argument("--llm-key", default="")
    ap.add_argument("--llm-model", default="")
    ap.add_argument("--llm-base", default="", help="base URL ของ AI ในเครื่อง (local)")
    ap.add_argument("--compare-models", action="store_true",
                    help="ถอดเสียงซ้ำด้วยโมเดลคนละตัว แล้วให้ AI เทียบผลเพื่อความแม่นยำสูงสุด (ช้าลง ~2 เท่า ต้องตั้ง AI ด้วย)")
    a = ap.parse_args()

    cc.ensure_ffmpeg()   # เช็ก ffmpeg ก่อน
    cc.ensure_capcut()   # เช็ก CapCut ติดตั้ง (fail เร็วก่อนถอดเสียงหนักๆ)
    cc.ensure_capcut_closed()   # กันเคสคลิปสีแดง: ต้องปิด CapCut ก่อน (เช็คตั้งแต่ต้น ไม่ต้องรอถอดเสียงจบ)
    brand = cc.load_brand(a.brand or None)
    if a.words:
        brand["word_max_words"] = a.words

    # ---- สไตล์ซับจากเว็บ (ฟอนต์/ขนาด/ตำแหน่ง/สี/ขอบ) ----
    def _hex_rgb(h):
        h = h.lstrip("#")
        return [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)] if len(h) == 6 else None
    if a.font:
        fp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "fonts", a.font + ".ttf")
        if os.path.exists(fp):
            brand["font_path"] = fp
            print(f"ฟอนต์: {a.font}", flush=True)
        else:
            print(f"   !! ไม่พบฟอนต์ {a.font} — ใช้ค่าเริ่มต้น", flush=True)
    if a.font_size and a.font_size > 0:
        brand["font_size"] = float(a.font_size)
    if a.sub_y != 999:
        brand["word_y_pos"] = float(a.sub_y)
    if a.border_width >= 0:
        brand["border_width"] = float(a.border_width)
    if a.text_color and _hex_rgb(a.text_color):
        brand["white"] = _hex_rgb(a.text_color)
    if a.hl_color and _hex_rgb(a.hl_color):
        brand["yellow"] = _hex_rgb(a.hl_color)
    folder = os.path.abspath(a.clips)
    clips = sorted([os.path.join(folder, f) for f in os.listdir(folder)
                    if os.path.splitext(f)[1].lower() in VIDEO_EXT
                    and not f.startswith("combined")],
                   key=lambda p: natkey(os.path.basename(p)))
    if not clips:
        raise SystemExit(f"ไม่พบคลิปในโฟลเดอร์: {folder}")

    # ค้นหา script.json อัตโนมัติในโฟลเดอร์ ถ้าไม่ได้ระบุ
    script_path = a.script
    if not script_path:
        for cand in ("script.json", "subtitles.json", "storyboard.json"):
            if os.path.exists(os.path.join(folder, cand)):
                script_path = os.path.join(folder, cand); break
    script_texts = load_script(script_path, len(clips))

    # ไฟล์งาน (คลิปตัดแล้ว/รวมแล้ว) ต้องไม่อยู่ในโฟลเดอร์ที่ซิงก์คลาวด์ (OneDrive/Dropbox ฯลฯ)
    # ไม่งั้นไฟล์จะถูกแปลงเป็น cloud-only placeholder ทีหลัง ทำให้ CapCut เปิดไม่ได้ (ขึ้นสีแดง)
    # -> ใช้ %LOCALAPPDATA% เสมอ ไม่ว่าโฟลเดอร์คลิปที่ผู้ใช้ลากมาจะอยู่ที่ไหนก็ตาม
    work = cc.safe_work_dir(folder)

    print(f"พบคลิป {len(clips)} ไฟล์ | ซับจาก: "
          f"{'บทเว็บ+whisper จับเวลา' if script_texts else 'whisper ถอดเสียง'}", flush=True)

    # ---- ขั้นที่ 2 ของซับแม่นยำ: AI ตรวจแก้คำไทยที่ถอดผิด (ตามสูตร 2 ขั้นตอน) ----
    ok_llm = a.llm_provider and (a.llm_key or a.llm_provider == "local")
    if ok_llm:
        try:
            all_texts = []
            for i, clip in enumerate(clips):
                data = cc.transcribe(clip, cache_json=os.path.join(work, f"words_{i:02d}.json"))
                all_texts += [s.get("text", "") for s in data["segments"]]
            print("AI ตรวจแก้ภาษาไทยในซับ...", flush=True)
            reps = cc.llm_thai_corrections(all_texts, a.llm_provider, a.llm_key,
                                           a.llm_model, a.llm_base or None)
            if reps:
                brand["corrections"] = {**reps, **(brand.get("corrections") or {})}
                shown = ", ".join(f"{k}→{v}" for k, v in list(reps.items())[:6])
                print(f"[THAI] แก้คำผิด {len(reps)} คำ ({shown})", flush=True)
            else:
                print("[THAI] ไม่พบคำที่ต้องแก้ (หรือ AI ตรวจไม่ได้ — ดู log ด้านบน)", flush=True)
        except Exception as e:
            print(f"[THAI] ตรวจภาษาไทยไม่สำเร็จ (ข้าม): {str(e)[:200]}", flush=True)

    ai_flubs = a.cut_flubs and ok_llm   # เปิดตัดคำพูดผิด + มี LLM => ใช้ AI ตัด retake ระดับประโยคด้วย
    per_clip = []
    for i, clip in enumerate(clips):
        print(f"[{i+1}/{len(clips)}] {os.path.basename(clip)}", flush=True)
        dur = cc.ffprobe_dur(clip)
        data = cc.transcribe(clip, cache_json=os.path.join(work, f"words_{i:02d}.json"))
        # ---- เทียบผลถอดเสียง 2 โมเดล (คนละสายพันธุ์) เพื่อความแม่นยำสูงสุด (ไม่บังคับ, ต้องมี AI) ----
        if a.compare_models and ok_llm:
            secondary_model = cc._SECONDARY_MODEL_FOR.get(cc._primary_model_name())
            if not secondary_model:
                print("[RECONCILE] โปรไฟล์ปัจจุบันไม่มีโมเดลรองให้เทียบ (ข้าม)", flush=True)
            else:
                try:
                    print(f"      [RECONCILE] ถอดเสียงรอบ 2 ด้วยโมเดล {secondary_model} เพื่อเทียบผล...", flush=True)
                    secondary_segs = cc.transcribe_secondary(clip, secondary_model)
                    reps2 = cc.reconcile_word_corrections(
                        data["segments"], secondary_segs,
                        a.llm_provider, a.llm_key, a.llm_model, a.llm_base or None,
                    )
                    if reps2:
                        brand["corrections"].update(reps2)
                        shown = ", ".join(f"{k}→{v}" for k, v in list(reps2.items())[:8])
                        print(f"      [RECONCILE] เทียบ 2 โมเดลแล้ว แก้เพิ่ม {len(reps2)} คำ ({shown})", flush=True)
                    else:
                        print("      [RECONCILE] เทียบ 2 โมเดลแล้ว ไม่พบคำที่ต้องแก้เพิ่ม", flush=True)
                except Exception as e:
                    print(f"      [RECONCILE] เทียบ 2 โมเดลไม่สำเร็จ (ข้าม): {str(e)[:200]}", flush=True)
        # ---- เอเจนต์ตัดคำพูดติดขัด/พูดผิด (ก่อนตัด dead air เพื่อรวมช่วงตัดเข้าด้วยกัน) ----
        flub_cuts = []
        if a.cut_flubs:
            hits = cc.detect_disfluencies(data["words"])
            if ai_flubs:
                hits += cc.llm_find_flubs(data["segments"], a.llm_provider, a.llm_key,
                                          a.llm_model, a.llm_base or None)
            flub_cuts = cc.merge_spans([(h["start"], h["end"]) for h in hits])
            if flub_cuts:
                sec = sum(b - aa for aa, b in flub_cuts)
                print(f"      ตัดคำพูดติดขัด/พูดผิด {len(flub_cuts)} ช่วง (~{sec:.1f}s)", flush=True)
                data = cc.strip_words_in_cuts(data, flub_cuts)
        keeps = cc.compute_keeps(dur, cc.detect_silence(clip), brand["min_silence"], brand["pad"],
                                 extra_cuts=flub_cuts)
        tight = os.path.join(work, f"tight_{i:02d}.mp4")
        cc.tighten_clip(clip, keeps, tight)
        tdur = cc.ffprobe_dur(tight)
        tmap = cc.make_timemap(keeps)
        if script_texts and i < len(script_texts) and script_texts[i]:
            caps = cc.captions_from_script(script_texts[i], data["words"], tmap,
                                           brand["max_chars"], brand["corrections"])
        else:
            # สไตล์คลิปตัวอย่าง: คำสั้นขึ้นกลางจอทีละคำ ตามจังหวะพูด
            caps = cc.captions_phrases_highlight(data["words"], tmap, brand["corrections"], data["segments"], brand,
                                                 max_chars=brand.get("word_max_chars", 12), style_name="word",
                                                 max_words=brand.get("word_max_words", 0))
            if not caps:
                caps = cc.captions_from_segments(data["segments"], tmap,
                                                 brand["max_chars"], brand["corrections"])
        removed = dur - tdur
        print(f"      ตัด dead air {removed:.1f}s -> {tdur:.1f}s | {len(caps)} แคปชัน", flush=True)
        per_clip.append((tight, tdur, caps))

    print("รวมคลิปเป็นไฟล์เดียว...", flush=True)
    combined = os.path.join(work, "combined.mp4")
    cc.concat_clips([p[0] for p in per_clip], combined)
    total_dur = cc.ffprobe_dur(combined)

    all_caps, scene_bounds, offset = [], [], 0.0
    for i, (tight, tdur, caps) in enumerate(per_clip):
        if i > 0:
            scene_bounds.append(offset)                 # รอยต่อฉาก -> ทรานสิชัน
        for cap in caps:
            ns, ne = cap[0], cap[1]
            all_caps.append((ns + offset, min(ne + offset, total_dur), cap_text(cap), cap_meta(cap)))
        offset += tdur
    scene_kf = None if a.no_transitions else [int(b * 1_000_000) for b in scene_bounds]

    # ---- ข้อความ hook เขียวตัวใหญ่ล่างจอ (ค้างช่วงเปิดคลิป) ----
    hook_text = a.hook.strip()
    if hook_text:
        hd = min(brand.get("hook_dur", 5.5), total_dur)
        all_caps.insert(0, (0.0, hd, cc.correct_thai(hook_text, brand["corrections"]), {"style": "hook"}))

    # ---- SFX ในตัว (bundle มาให้ฟรี) — ใช้เมื่อเปิด --auto-sfx และไม่ได้อัปโหลดเอง ----
    if a.auto_sfx:
        _sfxdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "sfx")
        def _b(fn):
            p = os.path.join(_sfxdir, fn)
            return p if os.path.exists(p) else ""
        if not a.whoosh:
            a.whoosh = _b("woosh.mp3")
        if not a.intro:
            a.intro = _b("metallic_riser.mp3")
        if not a.ding:
            a.ding = ",".join(p for p in (_b("pick.mp3"), _b("mouseclick.mp3"),
                                          _b("camera_shutter.mp3"), _b("ding.mp3")) if p)

    # ---- เพลง/SFX ประกอบ (ไม่บังคับ) ----
    sfx = {}
    if a.bgm and os.path.exists(a.bgm):
        sfx["bgm"] = {"path": a.bgm, "volume": max(0.0, min(1.0, a.bgm_volume)),
                      "remove_vocals": bool(a.remove_vocals)}
        print(f"เพลงประกอบ: {os.path.basename(a.bgm)}"
              f"{' (ตัดเสียงร้อง)' if a.remove_vocals else ''}", flush=True)
    if a.whoosh and os.path.exists(a.whoosh):
        sfx["whoosh"] = {"path": a.whoosh, "volume": 0.7}
    if a.intro and os.path.exists(a.intro):
        sfx["intro"] = {"path": a.intro, "volume": 0.9}
    ding_files = [p for p in a.ding.split(",") if p.strip() and os.path.exists(p.strip())]
    if ding_files:
        sfx["ding"] = {"paths": [p.strip() for p in ding_files], "volume": 0.5, "min_gap": 4.0, "max_dur": 0.5}
    sfx = sfx or None

    # ---- Hook: ฝังโลโก้ + ข้อความลงช่วงเปิดคลิป (ffmpeg) ----
    hook_logos = [p.strip() for p in a.hook_logo.split(",") if p.strip() and os.path.exists(p.strip())]
    if hook_logos or a.hook_title.strip():
        cw, ch = cc.ffprobe_wh(combined)
        print("ฝัง Hook เปิดคลิป (โลโก้ + ข้อความ)...", flush=True)
        combined = cc.bake_hook(combined, os.path.join(work, "combined_hook.mp4"),
                                hook_logos, a.hook_title, a.hook_dur, (cw, ch), work)
        total_dur = cc.ffprobe_dur(combined)

    print("เขียนโปรเจกต์ CapCut...", flush=True)
    out_dir, tpl, (w, h) = cc.build_draft(combined, a.name, all_caps,
                                          int(total_dur * 1_000_000), scene_kf, brand, sfx=sfx)

    print("\n===== เสร็จแล้ว =====")
    print("template   :", tpl)
    print("โปรเจกต์   :", a.name, "(เปิด CapCut ใหม่ -> เลือกตัวบนสุด)")
    print("ไฟล์รวม    :", combined, f"({total_dur:.1f}s, {w}x{h})")
    print("รวมแคปชัน  :", len(all_caps), "| ทรานสิชัน:", len(scene_bounds), "จุด")
    print("ที่อยู่ draft:", out_dir)


if __name__ == "__main__":
    main()
