# -*- coding: utf-8 -*-
"""
process_easycut.py — raw clips -> CapCut-ready package

Outputs:
  - CAPCUT_Easy_CUT_video.mp4
  - subtitles.srt (smart word/short phrase captions)
  - subtitles.vtt (smart word/short phrase captions)
  - subtitles_styled.ass (keyword highlight + side soft words)
  - subtitles_sentence.srt
  - subtitles_sentence.vtt
  - transcript.txt
  - processing_summary.json
  - CAPCUT_Easy_CUT_README.md
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capcut_core as cc

VIDEO_EXT = (".mp4", ".mov", ".mkv", ".webm", ".m4v")


def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def srt_time(sec):
    ms = max(0, int(round(sec * 1000)))
    h = ms // 3_600_000
    m = (ms % 3_600_000) // 60_000
    s = (ms % 60_000) // 1000
    milli = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"


def vtt_time(sec):
    return srt_time(sec).replace(",", ".")


def caption_text(caption):
    return caption[2]


def caption_style(caption):
    if len(caption) >= 4 and isinstance(caption[3], dict):
        return caption[3].get("style", "normal")
    return "normal"


def sanitize_captions(captions):
    """Prevent burned captions from overlapping or lingering on quiet video."""
    cleaned = sorted((cap for cap in captions if caption_text(cap).strip()), key=lambda cap: (cap[0], cap[1]))
    deduped = []
    for cap in cleaned:
        if deduped and cap[0] <= deduped[-1][0] + 0.06:
            left = re.sub(r"[\s.,!?ฯๆ]+", "", caption_text(deduped[-1])).lower()
            right = re.sub(r"[\s.,!?ฯๆ]+", "", caption_text(cap)).lower()
            if left and right and (left in right or right in left):
                if len(right) >= len(left):
                    deduped[-1] = cap
                continue
        deduped.append(cap)
    result = []
    for index, cap in enumerate(deduped):
        start, original_end = float(cap[0]), float(cap[1])
        chars = len(re.sub(r"\s+", "", caption_text(cap)))
        end = min(original_end, start + min(2.8, max(0.9, 0.60 + chars / 8.0)))
        if index + 1 < len(deduped) and end > deduped[index + 1][0]:
            end = deduped[index + 1][0] - 0.04
        if end >= start + 0.12:
            result.append((start, end, *cap[2:]))
    return result


def write_srt(captions, path):
    lines = []
    for i, cap in enumerate(captions, 1):
        start, end = cap[0], cap[1]
        lines.append(f"{i}\n{srt_time(start)} --> {srt_time(end)}\n{caption_text(cap)}\n")
    # utf-8-sig (มี BOM) กัน CapCut/โปรแกรมบน Windows อ่านเป็น ANSI แล้วภาษาไทยเพี้ยน
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write("\n".join(lines).strip() + "\n")


def write_vtt(captions, path):
    lines = ["WEBVTT\n"]
    for cap in captions:
        start, end = cap[0], cap[1]
        lines.append(f"{vtt_time(start)} --> {vtt_time(end)}\n{caption_text(cap)}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).strip() + "\n")


def ass_time(sec):
    cs = max(0, int(round(sec * 100)))
    h = cs // 360000
    m = (cs % 360000) // 6000
    s = (cs % 6000) // 100
    centi = cs % 100
    return f"{h}:{m:02d}:{s:02d}.{centi:02d}"


def ass_escape(text):
    return (text or "").replace("{", "").replace("}", "").replace("\n", "\\N")


# สไตล์อ้างอิงที่จูนไว้บน canvas 1080x1920 — ค่าที่สเกลได้จะถูกคูณตามความละเอียดจริงของ output
# (name, font, fontsize, primary, secondary, outline_col, back_col, bold, alignment, marginL, marginR, marginV, outline_w, shadow)
_ASS_STYLE_DEFS = [
    ("Keyword", "Leelawadee UI", 82, "&H0000E6FF", "&H000000FF", "&H00101624", "&H7A000000", -1, 2, 90, 90, 315, 5, 1),
    ("SoftLeft", "Leelawadee UI", 42, "&H00FFFFFF", "&H000000FF", "&H66101624", "&H66000000", 0, 1, 88, 90, 420, 3, 0),
    ("SoftRight", "Leelawadee UI", 42, "&H00FFFFFF", "&H000000FF", "&H66101624", "&H66000000", 0, 3, 90, 88, 420, 3, 0),
    ("Normal", "Leelawadee UI", 54, "&H00FFFFFF", "&H000000FF", "&H66101624", "&H66000000", 0, 2, 90, 90, 330, 4, 0),
]


def _num(x):
    """เลขจำนวนเต็มพิมพ์แบบไม่มี .0 (ให้เอาต์พุต portrait เท่าเดิมเป๊ะ) ไม่งั้นทศนิยม 1 ตำแหน่ง"""
    x = round(float(x), 1)
    return str(int(x)) if x == int(x) else str(x)


def _ass_styles(sx, sy):
    lines = []
    for (nm, fn, sz, pri, sec, ol, bk, bold, al, mL, mR, mV, ow, sh) in _ASS_STYLE_DEFS:
        # ฟอนต์/เส้นขอบ/ระยะขอบซ้ายขวา สเกลตามความกว้าง; ระยะขอบล่าง (MarginV) สเกลตามความสูง
        lines.append(
            f"Style: {nm},{fn},{max(1, round(sz * sx))},{pri},{sec},{ol},{bk},{bold},0,0,0,100,100,0,0,1,"
            f"{_num(ow * sx)},{_num(sh * sx)},{al},{round(mL * sx)},{round(mR * sx)},{round(mV * sy)},1"
        )
    return "\n".join(lines)


def write_ass(captions, path, out_w=1080, out_h=1920):
    sx = out_w / 1080.0
    sy = out_h / 1920.0
    header = f"""[Script Info]
Title: CAPCUT Easy CUT Smart Karaoke
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
PlayResX: {out_w}
PlayResY: {out_h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{_ass_styles(sx, sy)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    style_map = {
        "keyword": "Keyword",
        "soft_left": "SoftLeft",
        "soft_right": "SoftRight",
    }
    lines = [header.rstrip()]
    for cap in captions:
        start, end = cap[0], cap[1]
        style = style_map.get(caption_style(cap), "Normal")
        text = ass_escape(caption_text(cap))
        if not text:
            continue
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}")
    # utf-8-sig (มี BOM) กันโปรแกรมบน Windows อ่านเป็น ANSI แล้วภาษาไทยเพี้ยน
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write("\n".join(lines).strip() + "\n")


def burn_ass_subtitles(video_path, ass_path, output_path):
    """Burn styled ASS subtitles into MP4 using relative paths for Windows safety."""
    out_dir = os.path.dirname(os.path.abspath(output_path))
    input_name = os.path.basename(video_path)
    ass_name = os.path.basename(ass_path)
    output_name = os.path.basename(output_path)
    cmd = [
        cc.FFMPEG, "-y", "-i", input_name,
        "-vf", f"subtitles={ass_name}",
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        output_name,
    ]
    result = subprocess.run(
        cmd, cwd=out_dir, capture_output=True, text=True,
        encoding="utf-8", errors="ignore",
    )
    if result.returncode != 0 or not os.path.exists(output_path):
        detail = (result.stderr or result.stdout or "unknown ffmpeg error")[-1200:]
        raise SystemExit(f"ffmpeg ฝังซับไม่สำเร็จ: {detail}")


def safe_name(name):
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", (name or "CAPCUT_Easy_CUT").strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned[:60] or "CAPCUT_Easy_CUT"


def read_clips(folder):
    return sorted(
        [
            os.path.join(folder, f)
            for f in os.listdir(folder)
            if os.path.splitext(f)[1].lower() in VIDEO_EXT
        ],
        key=lambda p: natkey(os.path.basename(p)),
    )


def make_readme(summary):
    return f"""# CAPCUT Easy CUT

ไฟล์นี้ประมวลผลมาให้พร้อมต่อใน CapCut แล้ว

## ไฟล์สำคัญ
- `CAPCUT_Easy_CUT_video.mp4` — คลิปรวมหลังตัดช่วงเงียบ พร้อมซับฝังในวิดีโอ
- `subtitles.srt` — ซับคำ/วลีสั้นที่อ่านทันสำหรับ Import เข้า CapCut
- `subtitles_styled.ass` — ซับแบบมีสไตล์: keyword ใหญ่ หนา สีเด่น / คำประกอบอยู่ซ้าย-ขวา
- `subtitles.vtt` — ซับสำรองสำหรับโปรแกรมอื่น
- `subtitles_sentence.srt` — ซับแบบวลี/ประโยคสำรอง
- `transcript.txt` — ข้อความถอดเสียง
- `processing_summary.json` — รายละเอียดเวลาและจำนวนซับ

## วิธีเอาเข้า CapCut
1. เปิด CapCut แล้วสร้างโปรเจกต์ใหม่
2. ลาก `CAPCUT_Easy_CUT_video.mp4` เข้า timeline
3. ไปที่ Captions / Subtitles แล้ว Import `subtitles.srt`
4. `subtitles.srt` จะอ่านง่ายกว่าแบบพยางค์ ไม่แตกเร็วเกินไป
5. ถ้าต้องการสไตล์ keyword เด่น ให้ลองใช้ `subtitles_styled.ass`
6. ตรวจซับเล็กน้อย แล้ว Export ได้เลย

## สรุปงาน
- คลิปต้นฉบับ: {summary["clip_count"]} ไฟล์
- เวลาก่อนตัด: {summary["original_duration_sec"]:.1f} วินาที
- เวลาหลังตัด: {summary["processed_duration_sec"]:.1f} วินาที
- ตัดช่วงเงียบออก: {summary["removed_duration_sec"]:.1f} วินาที
- จำนวนซับ: {summary["caption_count"]} ช่วง
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="CAPCUT_Easy_CUT")
    ap.add_argument("--brand", default="")
    ap.add_argument("--no-dead-air", action="store_true")
    ap.add_argument("--words", type=int, default=0, help="จำนวนคำต่อ 1 ซับ (0 = อัตโนมัติ)")
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
    work_dir = os.path.join(out_dir, "_work")
    tight_dir = os.path.join(out_dir, "tight_clips")
    os.makedirs(work_dir, exist_ok=True)
    os.makedirs(tight_dir, exist_ok=True)

    cc.ensure_ffmpeg()   # ZIP mode ต้องมี ffmpeg (ไม่ต้องมี CapCut)
    brand = cc.load_brand(args.brand or None)
    if args.words:
        brand["word_max_words"] = args.words
    clips = read_clips(clips_folder)
    if not clips:
        raise SystemExit(f"ไม่พบไฟล์วิดีโอในโฟลเดอร์: {clips_folder}")

    print(f"CAPCUT Easy CUT | พบคลิป {len(clips)} ไฟล์", flush=True)

    per_clip = []
    stats = []
    original_total = 0.0
    processed_total = 0.0

    for i, clip in enumerate(clips):
        print(f"[{i + 1}/{len(clips)}] วิเคราะห์เสียง: {os.path.basename(clip)}", flush=True)
        dur = cc.ffprobe_dur(clip)
        original_total += dur

        transcript = cc.transcribe(clip, cache_json=os.path.join(work_dir, f"words_{i:02d}.json"))
        # Optional second opinion from the configured LLM. It may only return
        # conservative word replacements, so timestamps and spoken meaning stay intact.
        if args.llm_provider and (args.llm_key or args.llm_provider == "local") and args.llm_model:
            try:
                texts = [s.get("text", "") for s in transcript.get("segments", [])]
                reps = cc.llm_thai_corrections(
                    texts, args.llm_provider, args.llm_key, args.llm_model, args.llm_base or None,
                )
                if reps:
                    brand["corrections"].update(reps)
                    shown = ", ".join(f"{k}→{v}" for k, v in list(reps.items())[:8])
                    print(f"[THAI] ตรวจซ้ำและแก้คำ {len(reps)} คำ ({shown})", flush=True)
                else:
                    print("[THAI] AI ตรวจซ้ำแล้ว ไม่พบคำที่แก้ได้อย่างปลอดภัย", flush=True)
            except Exception as e:
                print(f"[THAI] AI ตรวจซ้ำไม่สำเร็จ จึงใช้ผล Whisper ต่อ ({str(e)[:160]})", flush=True)
        # ---- เทียบผลถอดเสียง 2 โมเดล (คนละสายพันธุ์) เพื่อความแม่นยำสูงสุด (ไม่บังคับ, ต้องมี AI) ----
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

        if args.no_dead_air:
            silences = []
            keeps = cc.compute_keeps(dur, [], brand["min_silence"], brand["pad"], extra_cuts=flub_cuts) \
                if flub_cuts else [(0.0, dur)]
        else:
            silences = cc.detect_silence(clip)
            keeps = cc.compute_keeps(dur, silences, brand["min_silence"], brand["pad"], extra_cuts=flub_cuts)

        tight_path = os.path.join(tight_dir, f"{i + 1:02d}_tight.mp4")
        cc.tighten_clip(clip, keeps, tight_path)
        tight_dur = cc.ffprobe_dur(tight_path)
        processed_total += tight_dur

        time_map = cc.make_timemap(keeps)
        sentence_captions = cc.captions_from_segments(
            transcript["segments"],
            time_map,
            brand["max_chars"],
            brand["corrections"],
        )
        # สไตล์ครีเอเตอร์: วลีสั้นกลางจอ ขาว+ไฮไลท์เหลืองคำสำคัญ (แบบคลิปตัวอย่าง)
        karaoke_captions = cc.captions_phrases_highlight(
            transcript["words"],
            time_map,
            brand["corrections"],
            transcript["segments"],
            brand,
            max_words=brand.get("word_max_words", 0),
        )
        if not karaoke_captions:
            karaoke_captions = sentence_captions

        removed = max(0.0, dur - tight_dur)
        print(
            f"      ตัดช่วงเงียบ {removed:.1f}s -> เหลือ {tight_dur:.1f}s | "
            f"ซับ smart karaoke {len(karaoke_captions)} ช่วง",
            flush=True,
        )
        per_clip.append((tight_path, tight_dur, karaoke_captions, sentence_captions, transcript))
        stats.append(
            {
                "file": os.path.basename(clip),
                "original_duration_sec": round(dur, 3),
                "processed_duration_sec": round(tight_dur, 3),
                "removed_duration_sec": round(removed, 3),
                "silence_count": len(silences),
                "caption_count": len(karaoke_captions),
                "sentence_caption_count": len(sentence_captions),
            }
        )

    clean_combined = os.path.join(out_dir, "CAPCUT_Easy_CUT_video_clean.mp4")
    combined = os.path.join(out_dir, "CAPCUT_Easy_CUT_video.mp4")
    print("รวมคลิปหลังตัดเป็นไฟล์เดียว...", flush=True)
    if len(per_clip) == 1:
        shutil.copyfile(per_clip[0][0], clean_combined)
    else:
        cc.concat_clips([p[0] for p in per_clip], clean_combined)

    total_dur = cc.ffprobe_dur(clean_combined) or processed_total
    out_w, out_h = cc.ffprobe_wh(clean_combined)  # ความละเอียดจริงของ output -> ทำให้ซับ .ass สเกลถูกทั้งแนวตั้ง/แนวนอน
    all_captions = []
    all_sentence_captions = []
    transcript_lines = []
    offset = 0.0
    for i, (_, clip_dur, captions, sentence_captions, transcript) in enumerate(per_clip, 1):
        transcript_lines.append(f"## คลิป {i:02d}")
        for seg in transcript["segments"]:
            text = cc.correct_thai((seg.get("text") or "").strip(), brand["corrections"])
            if text:
                transcript_lines.append(text)
        transcript_lines.append("")
        for cap in captions:
            start, end = cap[0], cap[1]
            meta = cap[3] if len(cap) >= 4 and isinstance(cap[3], dict) else {}
            all_captions.append((start + offset, min(end + offset, total_dur), caption_text(cap), meta))
        for start, end, text in sentence_captions:
            all_sentence_captions.append((start + offset, min(end + offset, total_dur), text))
        offset += clip_dur

    all_captions = sanitize_captions(all_captions)
    all_sentence_captions = sanitize_captions(all_sentence_captions)
    write_srt(all_captions, os.path.join(out_dir, "subtitles.srt"))
    write_vtt(all_captions, os.path.join(out_dir, "subtitles.vtt"))
    ass_path = os.path.join(out_dir, "subtitles_styled.ass")
    write_ass(all_captions, ass_path, out_w, out_h)
    print("ฝังซับไตเติ้ลลงวิดีโอ...", flush=True)
    burn_ass_subtitles(clean_combined, ass_path, combined)
    os.remove(clean_combined)
    write_srt(all_sentence_captions, os.path.join(out_dir, "subtitles_sentence.srt"))
    write_vtt(all_sentence_captions, os.path.join(out_dir, "subtitles_sentence.vtt"))
    with open(os.path.join(out_dir, "transcript.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(transcript_lines).strip() + "\n")

    summary = {
        "name": safe_name(args.name),
        "clip_count": len(clips),
        "original_duration_sec": round(original_total, 3),
        "processed_duration_sec": round(total_dur, 3),
        "removed_duration_sec": round(max(0.0, original_total - total_dur), 3),
        "caption_count": len(all_captions),
        "sentence_caption_count": len(all_sentence_captions),
        "caption_mode": "smart_word_keyword",
        "clips": stats,
        "core_system": [
            "ลากคลิปดิบเข้ามา",
            "วิเคราะห์เสียงเพื่อหาช่วงเงียบและคำพูด",
            "ตัด dead air แล้วรวมคลิปเป็นไฟล์เดียว",
            "ถอดเสียงภาษาไทยและสร้างซับแบบคำ/วลี พร้อมไฟล์ styled keyword highlight",
            "ดาวน์โหลดแพ็กเกจไปเปิดต่อใน CapCut",
        ],
    }
    with open(os.path.join(out_dir, "processing_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_dir, "CAPCUT_Easy_CUT_README.md"), "w", encoding="utf-8") as f:
        f.write(make_readme(summary))

    shutil.rmtree(work_dir, ignore_errors=True)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
