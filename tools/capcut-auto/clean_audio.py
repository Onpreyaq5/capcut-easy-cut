# -*- coding: utf-8 -*-
"""
clean_audio.py — ทำความสะอาดไฟล์เสียงล้วน (ไม่มีวิดีโอ)

รับไฟล์เสียง (wav/mp3/m4a/aac ฯลฯ) ในโฟลเดอร์ --clips แล้ว:
  1. ถอดเสียง (faster-whisper / เทียบ 2 โมเดล / AI แก้ภาษาไทย — เหมือน process_easycut.py ทุกอย่าง)
  2. ตัดคำพูดติดขัด/พูดผิด/พูดซ้ำ (--cut-flubs)
  3. ตัดช่วงเงียบ (dead air)
  4. ต่อช่วงที่เหลือกลับเป็นไฟล์เสียงเดียว (mp3) — ไม่ยุ่งกับวิดีโอเลย

Outputs (ต่อไฟล์):
  - <name>_cleaned.mp3
  - <name>.srt (transcript หลังแก้คำ)
  - transcript.txt
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capcut_core as cc
import process_easycut as pe  # reuse srt_time/write_srt/natkey

AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".wma", ".mp4", ".mov", ".mkv", ".webm"}


def read_audio_files(folder):
    return sorted(
        [os.path.join(folder, f) for f in os.listdir(folder)
         if os.path.splitext(f)[1].lower() in AUDIO_EXT and not f.startswith("_")],
        key=lambda p: pe.natkey(os.path.basename(p)),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True, help="โฟลเดอร์ที่มีไฟล์เสียง (เรียงตามชื่อ 01,02,03..)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--brand", default="")
    ap.add_argument("--no-dead-air", action="store_true")
    ap.add_argument("--quality", choices=("fast", "accurate", "max"), default="max")
    ap.add_argument("--keyterms", default="", help="ชื่อคน/แบรนด์/ศัพท์เฉพาะ คั่นด้วย comma")
    ap.add_argument("--llm-provider", default="")
    ap.add_argument("--llm-key", default="")
    ap.add_argument("--llm-model", default="")
    ap.add_argument("--llm-base", default="")
    ap.add_argument("--cut-flubs", action="store_true",
                    help="ตัดคำพูดติดขัด/พูดผิดออก (เอ่อ อ่า, พูดซ้ำ)")
    ap.add_argument("--compare-models", action="store_true",
                    help="ถอดเสียงซ้ำด้วยโมเดลคนละตัว แล้วให้ AI เทียบผลเพื่อความแม่นยำสูงสุด (ช้าลง ~2 เท่า ต้องตั้ง AI ด้วย)")
    args = ap.parse_args()

    os.environ["EASYCUT_TRANSCRIBE_QUALITY"] = args.quality
    if args.keyterms.strip():
        os.environ["EASYCUT_KEYTERMS"] = args.keyterms.strip()

    clips_folder = os.path.abspath(args.clips)
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    cc.ensure_ffmpeg()
    brand = cc.load_brand(args.brand or None)
    files = read_audio_files(clips_folder)
    if not files:
        raise SystemExit(f"ไม่พบไฟล์เสียง/วิดีโอในโฟลเดอร์: {clips_folder}")

    print(f"CAPCUT Easy CUT (ทำความสะอาดเสียง) | พบไฟล์ {len(files)} ไฟล์", flush=True)

    total_kept = 0.0
    for i, clip in enumerate(files):
        base = f"{args.name}_{i+1:02d}" if len(files) > 1 else args.name
        print(f"[{i + 1}/{len(files)}] วิเคราะห์เสียง: {os.path.basename(clip)}", flush=True)
        dur = cc.ffprobe_dur(clip)

        transcript = cc.transcribe(clip, cache_json=os.path.join(out_dir, f"_words_{i:02d}.json"))

        # ---- ขั้นที่ 2: AI ตรวจแก้ภาษาไทยที่ถอดผิด (คำเดียว) ----
        if args.llm_provider and (args.llm_key or args.llm_provider == "local") and args.llm_model:
            try:
                texts = [s.get("text", "") for s in transcript.get("segments", [])]
                reps = cc.llm_thai_corrections(texts, args.llm_provider, args.llm_key, args.llm_model, args.llm_base or None)
                if reps:
                    brand["corrections"].update(reps)
                    shown = ", ".join(f"{k}→{v}" for k, v in list(reps.items())[:8])
                    print(f"[THAI] ตรวจซ้ำและแก้คำ {len(reps)} คำ ({shown})", flush=True)
                else:
                    print("[THAI] AI ตรวจซ้ำแล้ว ไม่พบคำที่แก้ได้อย่างปลอดภัย", flush=True)
            except Exception as e:
                print(f"[THAI] AI ตรวจซ้ำไม่สำเร็จ จึงใช้ผล Whisper ต่อ ({str(e)[:160]})", flush=True)

        # ---- เทียบผลถอดเสียง 2 โมเดล (คนละสายพันธุ์) เพื่อความแม่นยำสูงสุด ----
        if args.compare_models and args.llm_provider and (args.llm_key or args.llm_provider == "local") and args.llm_model:
            secondary_model = cc._SECONDARY_MODEL_FOR.get(cc._primary_model_name())
            if not secondary_model:
                print("[RECONCILE] โปรไฟล์ปัจจุบันไม่มีโมเดลรองให้เทียบ (ข้าม)", flush=True)
            else:
                try:
                    print(f"[RECONCILE] ถอดเสียงรอบ 2 ด้วยโมเดล {secondary_model} เพื่อเทียบผล...", flush=True)
                    secondary_segs = cc.transcribe_secondary(clip, secondary_model)
                    reps2 = cc.reconcile_word_corrections(
                        transcript["segments"], secondary_segs,
                        args.llm_provider, args.llm_key, args.llm_model, args.llm_base or None,
                        keyterms=args.keyterms,
                    )
                    if reps2:
                        brand["corrections"].update(reps2)
                        shown = ", ".join(f"{k}→{v}" for k, v in list(reps2.items())[:8])
                        print(f"[RECONCILE] เทียบ 2 โมเดลแล้ว แก้เพิ่ม {len(reps2)} คำ ({shown})", flush=True)
                    else:
                        print("[RECONCILE] เทียบ 2 โมเดลแล้ว ไม่พบคำที่ต้องแก้เพิ่ม", flush=True)
                except Exception as e:
                    print(f"[RECONCILE] เทียบ 2 โมเดลไม่สำเร็จ (ข้าม): {str(e)[:200]}", flush=True)

        # ---- ตัดคำพูดติดขัด/พูดผิด (เอ่อ อ่า, พูดซ้ำ) ก่อนตัด dead air ----
        flub_cuts = []
        if args.cut_flubs:
            flub_cuts = cc.merge_spans(
                [(h["start"], h["end"]) for h in cc.detect_disfluencies(transcript["words"])]
            )
            if flub_cuts:
                sec = sum(b - aa for aa, b in flub_cuts)
                print(f"      ตัดคำพูดติดขัด/พูดผิด {len(flub_cuts)} ช่วง (~{sec:.1f}s)", flush=True)
                transcript = cc.strip_words_in_cuts(transcript, flub_cuts)

        # ---- ตัดช่วงเงียบ (dead air) ----
        if args.no_dead_air:
            keeps = cc.compute_keeps(dur, [], brand["min_silence"], brand["pad"], extra_cuts=flub_cuts) \
                if flub_cuts else [(0.0, dur)]
        else:
            silences = cc.detect_silence(clip)
            keeps = cc.compute_keeps(dur, silences, brand["min_silence"], brand["pad"], extra_cuts=flub_cuts)
        kept_sec = sum(b - a for a, b in keeps)
        total_kept += kept_sec
        print(f"      ตัดช่วงเงียบแล้ว เหลือ {kept_sec:.1f}s จาก {dur:.1f}s", flush=True)

        # ---- ต่อช่วงที่เหลือกลับเป็นไฟล์เสียงเดียว ----
        out_audio = os.path.join(out_dir, f"{base}_cleaned.mp3")
        cc.tighten_audio(clip, keeps, out_audio)

        # ---- เขียน SRT/transcript ของข้อความที่แก้แล้ว (correct_thai ใช้ corrections ที่สะสมมา) ----
        tmap = cc.make_timemap(keeps)
        captions = []
        for seg in transcript.get("segments", []):
            text = cc.correct_thai((seg.get("text") or "").strip(), brand["corrections"])
            if not text:
                continue
            s, e = tmap(seg["start"]), tmap(seg["end"])
            if e > s:
                captions.append((s, e, text))
        pe.write_srt(captions, os.path.join(out_dir, f"{base}.srt"))
        with open(os.path.join(out_dir, f"{base}_transcript.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(c[2] for c in captions))

        print(f"[{i + 1}/{len(files)}] เสร็จ -> {os.path.basename(out_audio)}", flush=True)

    # ลบไฟล์แคชชั่วคราว (ไม่ต้องอยู่ในแพ็กเกจดาวน์โหลด)
    for f in os.listdir(out_dir):
        if f.startswith("_words_"):
            try:
                os.remove(os.path.join(out_dir, f))
            except OSError:
                pass

    # บันทึกเวลาที่ประมวลผลแล้ว (หลังตัด) ไว้หักโควตาผู้ใช้ — คีย์เดียวกับ process_easycut.py
    import json as _json
    with open(os.path.join(out_dir, "processing_summary.json"), "w", encoding="utf-8") as f:
        _json.dump({"processed_duration_sec": round(total_kept, 3)}, f, ensure_ascii=False, indent=2)

    print("เสร็จสมบูรณ์", flush=True)


if __name__ == "__main__":
    main()
