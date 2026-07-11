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
    ap.add_argument("--llm-provider", default="", help="ตรวจแก้ภาษาไทยในซับ: groq/cerebras/openrouter/gemini/openai/anthropic/local")
    ap.add_argument("--llm-key", default="")
    ap.add_argument("--llm-model", default="")
    ap.add_argument("--llm-base", default="", help="base URL ของ AI ในเครื่อง (local)")
    a = ap.parse_args()

    cc.ensure_ffmpeg()   # เช็ก ffmpeg ก่อน
    cc.ensure_capcut()   # เช็ก CapCut ติดตั้ง (fail เร็วก่อนถอดเสียงหนักๆ)
    cc.ensure_capcut_closed()   # กันเคสคลิปสีแดง: ต้องปิด CapCut ก่อน (เช็คตั้งแต่ต้น ไม่ต้องรอถอดเสียงจบ)
    brand = cc.load_brand(a.brand or None)
    if a.words:
        brand["word_max_words"] = a.words
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

    print("เขียนโปรเจกต์ CapCut...", flush=True)
    out_dir, tpl, (w, h) = cc.build_draft(combined, a.name, all_caps,
                                          int(total_dur * 1_000_000), scene_kf, brand)

    print("\n===== เสร็จแล้ว =====")
    print("template   :", tpl)
    print("โปรเจกต์   :", a.name, "(เปิด CapCut ใหม่ -> เลือกตัวบนสุด)")
    print("ไฟล์รวม    :", combined, f"({total_dur:.1f}s, {w}x{h})")
    print("รวมแคปชัน  :", len(all_caps), "| ทรานสิชัน:", len(scene_bounds), "จุด")
    print("ที่อยู่ draft:", out_dir)


if __name__ == "__main__":
    main()
