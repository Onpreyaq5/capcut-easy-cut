# -*- coding: utf-8 -*-
"""
capcut_core.py — เอนจินสร้างโปรเจกต์ CapCut อัตโนมัติ (CAPCUT Easy CUT)
รวมคลิปหลายไฟล์ + ตัด dead air + ซับไทยสวย (บทจากเว็บ + จับเวลา whisper) + สีคำ + pop + ทรานสิชันซูม
เขียนไฟล์ draft ของ CapCut ในเครื่องโดยตรง (ไม่ต้อง import เอง)

ต้องมี: ffmpeg, ffprobe, faster-whisper, pythainlp
หน่วยเวลาใน CapCut draft = ไมโครวินาที
"""
import json, os, io, sys, shutil, uuid, copy, time, re, subprocess, glob, hashlib, tempfile
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8")
    except Exception: pass

LOCALAPPDATA = os.environ.get("LOCALAPPDATA", "")
CAPCUT_BASE = os.path.join(LOCALAPPDATA, "CapCut")
DRAFT_ROOT = os.path.join(CAPCUT_BASE, "User Data", "Projects", "com.lveditor.draft")
HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(HERE, "template_draft")   # template สำเร็จรูปที่แจกไปกับแอป

# ffmpeg/ffprobe: ตั้ง env ให้ชี้ binary ที่ bundle มากับแอปได้ (ไม่งั้นใช้จาก PATH)
FFMPEG = os.environ.get("EASYCUT_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("EASYCUT_FFPROBE", "ffprobe")

# ปรับความเร็ว/คุณภาพการ encode — default เร่งให้เร็วขึ้นโดยกระทบคุณภาพน้อย
# (ไฟล์ที่ได้เป็นไฟล์ตั้งต้นเข้า CapCut ซึ่งจะ re-export ตัวจริงอีกที) ปรับผ่าน env ได้
ENCODE_PRESET = (os.environ.get("EASYCUT_PRESET", "faster").strip() or "faster")
ENCODE_CRF = (os.environ.get("EASYCUT_CRF", "20").strip() or "20")
# beam_size ของ whisper: 1 = greedy เร็วสุด (ไทยต่างจาก beam 5 เพียงเล็กน้อย) เพิ่มเป็น 5 ได้ถ้าต้องการแม่นสุด
try:
    WHISPER_BEAM = max(1, int(os.environ.get("EASYCUT_WHISPER_BEAM", "1") or "1"))
except ValueError:
    WHISPER_BEAM = 1

# ฟอนต์สำรอง (เรียงตามลำดับ) เผื่อเครื่อง user ไม่มีฟอนต์ที่ตั้งไว้
_FONT_FALLBACKS = [
    "C:/Windows/Fonts/LeelaUIb.ttf",   # Leelawadee UI Bold (มากับ Windows)
    "C:/Windows/Fonts/Leelawad.ttf",
    "C:/Windows/Fonts/tahomabd.ttf",   # Tahoma Bold
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def resolve_font(brand):
    """คืน font_path ที่มีจริงในเครื่อง — ถ้าที่ตั้งไว้ไม่มี ลอง fallback ทีละตัว"""
    want = (brand or {}).get("font_path") or ""
    if want and os.path.exists(want):
        return want.replace("\\", "/")
    for f in _FONT_FALLBACKS:
        if os.path.exists(f):
            if want:
                print(f"   !! ไม่พบฟอนต์ {want} — ใช้ {os.path.basename(f)} แทน", flush=True)
            return f.replace("\\", "/")
    return (want or _FONT_FALLBACKS[0]).replace("\\", "/")


def ensure_ffmpeg():
    """ตรวจว่าเรียก ffmpeg/ffprobe ได้ — ไม่ได้ให้ error ชัดเจนแทนที่จะพังกลางทาง"""
    for exe, name in ((FFMPEG, "ffmpeg"), (FFPROBE, "ffprobe")):
        try:
            r = subprocess.run([exe, "-version"], capture_output=True, text=True,
                               encoding="utf-8", errors="ignore")
            if r.returncode != 0:
                raise RuntimeError
        except Exception:
            raise SystemExit(
                f"เรียก {name} ไม่ได้ — ต้องติดตั้ง ffmpeg ก่อน (winget install Gyan.FFmpeg) "
                f"หรือแอปต้อง bundle ffmpeg มาด้วย (ตั้ง env EASYCUT_FFMPEG/EASYCUT_FFPROBE)")


def ensure_capcut():
    """ตรวจว่าเครื่อง user ติดตั้ง CapCut แล้ว + เตรียมโฟลเดอร์ draft"""
    if not LOCALAPPDATA or not os.path.isdir(CAPCUT_BASE):
        raise SystemExit("ไม่พบ CapCut ในเครื่อง — กรุณาติดตั้ง CapCut แล้วเปิดสัก 1 ครั้งก่อนใช้งาน")
    os.makedirs(DRAFT_ROOT, exist_ok=True)


# ---------- กันไฟล์ตกอยู่ในโฟลเดอร์ที่ซิงก์คลาวด์ (OneDrive/Dropbox/Google Drive ฯลฯ) ----------
# สาเหตุบั๊ก "เปิด CapCut แล้วคลิปขึ้นสีแดง/หาไฟล์ไม่เจอ": โปรแกรมซิงก์คลาวด์แปลงไฟล์ที่ไม่ได้ใช้งานนาน ๆ
# ให้เป็น "cloud-only placeholder" (ตัวไฟล์จริงไม่อยู่ในเครื่องแล้ว) ซึ่ง CapCut เปิดอ่านไม่ได้
# ทางแก้ที่ชัวร์ที่สุด: ห้ามให้ไฟล์ที่ CapCut อ้างอิง (combined.mp4) ไปอยู่ในโฟลเดอร์ที่ซิงก์คลาวด์เด็ดขาด
_CLOUD_ATTR_FLAGS = 0x400 | 0x1000 | 0x400000  # REPARSE_POINT | OFFLINE | RECALL_ON_DATA_ACCESS


def safe_work_dir(source_folder):
    """คืนโฟลเดอร์ทำงานที่รับประกันว่าไม่อยู่ในโฟลเดอร์ที่ซิงก์คลาวด์ — ใช้ %LOCALAPPDATA% เสมอ
    ไม่สนใจว่า source_folder (โฟลเดอร์คลิปที่ผู้ใช้ลากมา) จะอยู่ที่ไหน (แม้จะอยู่ใต้ OneDrive/Desktop ก็ตาม)
    คีย์ตาม hash ของ path จริงของ source_folder เพื่อให้รันซ้ำโฟลเดอร์เดิมได้ใช้แคช (words_XX.json) คืน"""
    base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
    key = hashlib.md5(os.path.abspath(source_folder).encode("utf-8")).hexdigest()[:16]
    work = os.path.join(base, "CAPCUT_Easy_CUT", "_capcut_work", key)
    os.makedirs(work, exist_ok=True)
    return work


def _file_attrs(path):
    try:
        import ctypes
        attrs = ctypes.windll.kernel32.GetFileAttributesW(str(path))
        return None if attrs == -1 else attrs
    except Exception:
        return None


def is_cloud_placeholder(path):
    """เช็คว่าไฟล์เป็น cloud-only placeholder ของ OneDrive/Dropbox/Google Drive ฯลฯ ไหม"""
    attrs = _file_attrs(path)
    return attrs is not None and bool(attrs & _CLOUD_ATTR_FLAGS)


def ensure_local_file(path):
    """ด่านสุดท้ายกันคลิปสีแดงใน CapCut: ถ้าไฟล์ที่จะให้ CapCut อ้างอิงดันเป็น cloud-only placeholder
    (เช่น ผู้ใช้ย้ายโฟลเดอร์งานไปไว้ใน OneDrive เอง) ลองบังคับอ่านทั้งไฟล์เพื่อดาวน์โหลดจริงมาก่อน
    ถ้ายังไม่สำเร็จ ให้ error ชัดเจนแทนที่จะปล่อยให้ไปพังตอนเปิด CapCut แบบเงียบ ๆ"""
    if not is_cloud_placeholder(path):
        return
    print("   !! ไฟล์วิดีโอถูกซิงก์เป็นไฟล์คลาวด์ (OneDrive/Dropbox ฯลฯ) — กำลังบังคับดาวน์โหลดไฟล์จริงมาไว้ในเครื่อง...", flush=True)
    try:
        with open(path, "rb") as f:
            while f.read(1 << 20):
                pass
    except Exception:
        pass
    if is_cloud_placeholder(path):
        raise SystemExit(
            f"ไฟล์วิดีโอ ({path}) เป็นไฟล์ cloud-only ของโปรแกรมซิงก์คลาวด์ และดาวน์โหลดไฟล์จริงอัตโนมัติไม่สำเร็จ\n"
            "CapCut จะเปิดไฟล์นี้ไม่ได้ (ขึ้นเป็นคลิปสีแดง) — วิธีแก้: เปิด File Explorer ไปที่ไฟล์นี้ "
            "คลิกขวา -> 'Always keep on this device' (หรือปุ่มเทียบเท่าของโปรแกรมซิงก์ที่ใช้) แล้วรันใหม่อีกครั้ง"
        )


def resolve_effect_cache(resource_id, fallback=""):
    """หา path cache จริงของ effect/animation จาก resource_id บนเครื่อง user
    โครง: <LOCALAPPDATA>/CapCut/User Data/Cache/effect/<resource_id>/<hash>
    ถ้า user เคยโหลด effect นี้ -> คืน path ตัวจริง | ถ้าไม่เคย -> คืน fallback (มัก "" ให้ CapCut โหลดเองด้วย resource_id)"""
    rid = str(resource_id or "").strip()
    if not rid:
        return fallback
    base = os.path.join(CAPCUT_BASE, "User Data", "Cache", "effect", rid)
    if os.path.isdir(base):
        subs = [os.path.join(base, d) for d in os.listdir(base)
                if os.path.isdir(os.path.join(base, d))]
        if subs:
            return max(subs, key=os.path.getmtime).replace("\\", "/")
        return base.replace("\\", "/")
    return fallback


def _substitute_tokens(folder):
    """แปลง placeholder ใน template ที่ก๊อปมาให้เป็น path จริงของเครื่อง user
    (__LOCALAPPDATA__ = โฟลเดอร์ cache/effect ของ CapCut, __DRAFT_ROOT__/__NAME__ = ที่เก็บ draft)"""
    local_fwd = LOCALAPPDATA.replace("\\", "/")
    root_fwd = DRAFT_ROOT.replace("\\", "/")
    name = os.path.basename(folder.rstrip("/\\"))
    repl = {"__LOCALAPPDATA__": local_fwd, "__DRAFT_ROOT__": root_fwd, "__NAME__": name}
    for root, _, files in os.walk(folder):
        for f in files:
            if not f.endswith(".json"):
                continue
            p = os.path.join(root, f)
            try:
                t = open(p, encoding="utf-8").read()
            except Exception:
                continue
            new = t
            for k, v in repl.items():
                new = new.replace(k, v)
            if new != t:
                open(p, "w", encoding="utf-8").write(new)

# ---- ค่าเริ่มต้น (แก้ได้ใน brand.json) ----
DEFAULTS = {
    "font_path": "C:/Windows/Fonts/LeelaUIb.ttf",      # Leelawadee UI Bold
    "font_size": 12.0,
    "line_chars": 15,
    "max_chars": 20,
    "min_silence": 0.40,
    "pad": 0.08,
    "y_pos": -0.42,                                     # ตำแหน่งซับ (~78% ล่างจอ)
    "white": [1.0, 1.0, 1.0],
    "soft_white": [0.86, 0.9, 0.96],
    "green": [0.2, 0.8196, 0.4784],                    # #33D17A แบรนด์
    "yellow": [1.0, 0.8941, 0.0],                      # #FFE400 ตัวเลข/โดส/ผล
    "keyword_y_pos": -0.42,
    "soft_y_pos": -0.26,
    "soft_left_x": -0.34,
    "soft_right_x": 0.34,
    # สไตล์ "คลิปตัวอย่าง": คำขึ้นทีละคำ/วลีสั้นกลางจอ + hook เขียวตัวใหญ่ล่างจอ
    "word_y_pos": -0.05,
    "word_max_chars": 12,
    "hook_y_pos": -0.34,
    "hook_dur": 5.5,
    "green_kw": ["CAPCUT", "Easy CUT", "CapCut", "แคปคัท", "ซับ", "ซับไตเติ้ล"],
    "yellow_kw": ["Dead air", "dead air", "วินาที", "นาที", "ชั่วโมง", "เปอร์เซ็นต์", "คลิป", "ไฟล์"],
    "corrections": {},                                  # dict แทนคำ เช่น {"อามิโน":"อะมิโน"}
    "pop_anim_on": True,                                # ปิดได้ถ้า pop animation มีปัญหาบางเครื่อง
    "pop_anim": {
        "resource_id": "7563492361758690577",
        "path": "",                                     # ปล่อยว่าง — resolve จาก cache ของ user ตอน build
    },
}
ENDERS = ("ครับ", "ค่ะ", "คะ", "จ้ะ", "ครับผม", "นะครับ", "นะคะ")


def load_brand(path=None):
    cfg = dict(DEFAULTS)
    p = path or os.path.join(HERE, "brand.json")
    if os.path.exists(p):
        try:
            user = json.load(open(p, encoding="utf-8"))
            cfg.update({k: v for k, v in user.items() if v is not None})
        except Exception as e:
            print("!! อ่าน brand.json ไม่ได้:", e)
    return cfg


def guid():
    return str(uuid.uuid4()).upper()


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")


def run_filter(input_args, fc, output_args):
    """รัน ffmpeg โดยส่ง filter graph ผ่านไฟล์ (-filter_complex_script) แทน inline
    หลบลิมิตความยาว command line ของ Windows (WinError 206) เมื่อ keep/clip segment เยอะ"""
    fd, fpath = tempfile.mkstemp(suffix=".ffscript.txt", text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(fc)
        return run([FFMPEG, "-y"] + input_args + ["-filter_complex_script", fpath] + output_args)
    finally:
        try:
            os.remove(fpath)
        except OSError:
            pass


# ---------- media probe ----------
def ffprobe_dur(path):
    r = run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def ffprobe_wh(path):
    r = run([FFPROBE, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0", path])
    try:
        w, h = r.stdout.strip().split(",")[:2]
        return int(w), int(h)
    except Exception:
        return 1080, 1920


# ---------- dead air ----------
def detect_silence(path, noise="-30dB", mind=0.30):
    r = run([FFMPEG, "-hide_banner", "-i", path, "-af",
             f"silencedetect=noise={noise}:d={mind}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start:\s*([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([\d.]+)", r.stderr)]
    return list(zip(starts, ends))


def compute_keeps(clip_dur, silences, min_sil, pad):
    cuts = []
    for ss, se in silences:
        if (se - ss) >= min_sil:
            cs, ce = ss + pad, se - pad
            if ce > cs:
                cuts.append((cs, ce))
    cuts.sort()
    keeps, cur = [], 0.0
    for cs, ce in cuts:
        if cs > cur:
            keeps.append((cur, cs))
        cur = max(cur, ce)
    if cur < clip_dur:
        keeps.append((cur, clip_dur))
    if not keeps:
        keeps = [(0.0, clip_dur)]
    return keeps


def tighten_clip(src, keeps, out):
    parts = []
    for i, (ks, ke) in enumerate(keeps):
        parts.append(f"[0:v]trim={ks:.3f}:{ke:.3f},setpts=PTS-STARTPTS[v{i}];")
        parts.append(f"[0:a]atrim={ks:.3f}:{ke:.3f},asetpts=PTS-STARTPTS[a{i}];")
    concat_in = "".join(f"[v{i}][a{i}]" for i in range(len(keeps)))
    fc = "".join(parts) + f"{concat_in}concat=n={len(keeps)}:v=1:a=1[v][a]"
    run_filter(["-i", src], fc,
               ["-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", ENCODE_PRESET, "-crf", ENCODE_CRF,
                "-c:a", "aac", "-b:a", "192k", "-ar", "48000", out])
    if not os.path.exists(out):
        raise SystemExit(f"ffmpeg tighten failed for {src}")


def make_timemap(keeps):
    spans, acc = [], 0.0
    for ks, ke in keeps:
        spans.append((ks, ke, acc)); acc += (ke - ks)

    def m(t):
        for ks, ke, off in spans:
            if t < ks:
                return off
            if t <= ke:
                return off + (t - ks)
        return acc
    return m


def concat_clips(clips, out, target_wh=None):
    """ต่อคลิปที่ตัด dead air แล้วเข้าด้วยกันเป็นไฟล์เดียว (re-encode ให้สเปกตรงกัน)
    canvas ยึดตามคลิปแรก (คงแนวนอน/แนวตั้งตามต้นฉบับ) ไม่บังคับเป็น 9:16 อีกต่อไป"""
    n = len(clips)
    if target_wh is None:
        target_wh = ffprobe_wh(clips[0])
    tw, th = target_wh
    tw -= tw % 2  # libx264 ต้องการขนาดเป็นเลขคู่
    th -= th % 2
    inputs = []
    for c in clips:
        inputs += ["-i", c]
    v = "".join(f"[{i}:v]scale={tw}:{th}:force_original_aspect_ratio=decrease,"
                f"pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{i}];" for i in range(n))
    a = "".join(f"[{i}:a]aresample=48000[a{i}];" for i in range(n))
    cat = "".join(f"[v{i}][a{i}]" for i in range(n))
    fc = v + a + f"{cat}concat=n={n}:v=1:a=1[v][a]"
    run_filter(inputs, fc,
               ["-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", ENCODE_PRESET, "-crf", ENCODE_CRF,
                "-c:a", "aac", "-b:a", "192k", out])
    if not os.path.exists(out):
        raise SystemExit("ffmpeg concat failed")


# ---------- transcribe ----------
_MODEL = None
def _load_whisper():
    """โหลดโมเดล whisper แบบยืดหยุ่น: มี GPU ใช้ GPU, ไม่มี fallback CPU
    ปรับได้ผ่าน env: EASYCUT_WHISPER_MODEL (เช่น small/medium/large-v3), EASYCUT_WHISPER_DEVICE"""
    from faster_whisper import WhisperModel
    model = os.environ.get("EASYCUT_WHISPER_MODEL", "medium").strip() or "medium"
    device = os.environ.get("EASYCUT_WHISPER_DEVICE", "auto").strip().lower() or "auto"
    tries = []
    if device in ("auto", "cuda"):
        tries.append(("cuda", "float16"))
    tries.append(("cpu", "int8"))
    last = None
    for dev, ct in tries:
        try:
            print(f"   โหลดโมเดล whisper {model} ({dev}/{ct}) — ครั้งแรกใช้เวลาดาวน์โหลด...", flush=True)
            m = WhisperModel(model, device=dev, compute_type=ct)
            if dev == "cuda":
                # CUDA สร้างสำเร็จได้ทั้งที่ cublas/cudnn ยังไม่โหลด — warm-up สั้นๆ ให้โหลด lib จริง
                # ถ้าเครื่องไม่มี CUDA runtime จะ error ตรงนี้ แล้ว fallback ไป CPU ได้ (ไม่พังตอนถอดเสียงจริง)
                import numpy as _np
                list(m.transcribe(_np.zeros(16000, dtype=_np.float32), language="th")[0])
            return m
        except Exception as e:
            last = e
            print(f"   !! {dev}/{ct} ใช้ไม่ได้ ({str(e)[:80]}) — ลองตัวถัดไป", flush=True)
    raise SystemExit(f"โหลดโมเดล whisper ไม่ได้: {last}")


def transcribe(path, cache_json=None):
    if cache_json and os.path.exists(cache_json):
        return json.load(open(cache_json, encoding="utf-8"))
    global _MODEL
    if _MODEL is None:
        _MODEL = _load_whisper()
    segs, info = _MODEL.transcribe(path, language="th", word_timestamps=True,
                                   vad_filter=True, beam_size=WHISPER_BEAM)
    total = float(getattr(info, "duration", 0) or 0)
    segments, words = [], []
    last_pct = -10
    for s in segs:
        segments.append({"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()})
        for w in (s.words or []):
            words.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word})
        if total > 0:
            pct = int(min(100, s.end / total * 100))
            if pct >= last_pct + 10:
                last_pct = pct
                print(f"   ถอดเสียง... {pct}%", flush=True)
    data = {"segments": segments, "words": words}
    if cache_json:
        json.dump(data, open(cache_json, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    return data


# ---------- ไทยถูกต้อง ----------
def correct_thai(text, corrections):
    if not text:
        return ""
    t = text
    for wrong, right in (corrections or {}).items():
        t = t.replace(wrong, right)
    t = t.replace("ํา", "ำ")          # "นิคหิต+า" ที่เพี้ยน -> สระอำ (น้ํา -> น้ำ)
    # ยุบคำซ้ำติดกัน -> ไม้ยมก (เพื่อนเพื่อน -> เพื่อนๆ)
    try:
        from pythainlp import word_tokenize
        out, prev = [], None
        for tk in word_tokenize(t, engine="newmm", keep_whitespace=True):
            s = tk.strip()
            if s and s == prev and len(s) >= 2 and re.match(r"^[฀-๿]+$", s):
                out.append("ๆ")
            else:
                out.append(tk)
                if s:
                    prev = s
        t = "".join(out)
    except Exception:
        pass
    t = re.sub(r"\s*ๆ", "ๆ", t)                       # ไม่เว้นวรรคหน้าไม้ยมก
    return re.sub(r"\s+", " ", t).strip()


# ---------- ตัดวลี / ตัดบรรทัด / สี ----------
def phrase_chunks(text, max_chars=20):
    from pythainlp import word_tokenize
    phrases = [p for p in text.strip().split() if p]
    units = []
    for ph in phrases:
        if len(ph) <= max_chars:
            units.append(ph); continue
        subs, cur = [], ""
        for tk in word_tokenize(ph, engine="newmm", keep_whitespace=False):
            if cur and len(cur + tk) > max_chars:
                subs.append(cur); cur = ""
            cur += tk
        if cur:
            subs.append(cur)
        if len(subs) >= 2 and len(subs[-1]) <= 10:
            subs[-2] += subs[-1]; subs.pop()
        units.extend(subs)
    out = []
    for u in units:
        if out and (len(out[-1]) + 1 + len(u) <= max_chars
                    or (len(u) <= 7 and len(out[-1]) + 1 + len(u) <= max_chars + 8)):
            out[-1] = out[-1] + " " + u
        else:
            out.append(u)
    return out


def thai_wrap(text, max_chars):
    from pythainlp import word_tokenize
    units = []
    for tok in text.replace("\n", " ").split():
        if len(tok) <= max_chars:
            units.append(tok); continue
        cur = ""
        for w in word_tokenize(tok, engine="newmm", keep_whitespace=False):
            if cur and len(cur + w) > max_chars:
                units.append(cur); cur = ""
            cur += w
        if cur:
            units.append(cur)
    lines, line = [], ""
    for u in units:
        cand = (line + " " + u).strip() if line else u
        if line and len(cand) > max_chars:
            lines.append(line); line = u
        else:
            line = cand
    if line:
        lines.append(line)
    return "\n".join(lines[:3])


def color_spans(text, brand):
    green_kw, yellow_kw = brand["green_kw"], brand["yellow_kw"]
    GREEN, YELLOW, WHITE = brand["green"], brand["yellow"], brand["white"]
    n = len(text); owner = [None] * n
    s2f = [i for i, ch in enumerate(text) if ch != "\n"]
    stripped = text.replace("\n", "")
    for phrase in sorted(green_kw + yellow_kw, key=lambda p: -len(p)):
        if not phrase:
            continue
        color = GREEN if phrase in green_kw else YELLOW
        s = 0
        while True:
            i = stripped.find(phrase, s)
            if i < 0:
                break
            fidx = [s2f[j] for j in range(i, i + len(phrase))]
            if all(owner[j] is None for j in fidx):
                for j in fidx:
                    owner[j] = color
            s = i + len(phrase)
    for mt in re.finditer(r"\d+", stripped):
        for j in range(mt.start(), mt.end()):
            if owner[s2f[j]] is None:
                owner[s2f[j]] = YELLOW
    spans, i = [], 0
    while i < n:
        c = owner[i]; j = i + 1
        while j < n and owner[j] == c:
            j += 1
        spans.append((i, j, c if c else WHITE)); i = j
    return spans


def styled_color_spans(text, brand, caption_style="normal"):
    spans = color_spans(text, brand)
    if caption_style == "keyword":
        return [(a, b, brand["yellow"]) for a, b, _ in spans]
    if caption_style.startswith("soft_"):
        soft = brand.get("soft_white", [0.86, 0.9, 0.96])
        return [(a, b, soft) for a, b, _ in spans]
    return spans


# ---------- captions ----------
_THAI_RE = re.compile(r"[\u0E00-\u0E7F]+")
_TOKEN_RE = re.compile(r"[\u0E00-\u0E7F]+|[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*")
_SOFT_WORDS = {
    "ก็", "จะ", "ยัง", "เลย", "แล้ว", "และ", "หรือ", "แต่", "ที่", "ใน", "ให้", "ได้",
    "ไป", "มา", "ของ", "กับ", "เป็น", "แบบ", "ว่า", "นี้", "นั้น", "นี่", "นะ", "ครับ",
    "ค่ะ", "คะ", "จ้ะ", "อ่ะ", "เอ่อ", "อืม", "คือ", "ถ้า", "จาก", "บน", "ลง", "เข้า",
}


def karaoke_units(text):
    """แตกข้อความเป็นคำ ไม่แตกพยางค์ เพื่อให้อ่านทัน เช่น ลงมือทำ -> ลงมือทำ"""
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if not cleaned:
        return []
    units = []
    for match in _TOKEN_RE.finditer(cleaned):
        token = match.group(0).strip()
        if not token:
            continue
        if _THAI_RE.fullmatch(token):
            try:
                from pythainlp import word_tokenize
                parts = [p.strip() for p in word_tokenize(token, engine="newmm", keep_whitespace=False) if p.strip()]
            except Exception:
                parts = [token]
            units.extend(parts or [token])
        else:
            units.append(token)
    return units


def _unit_score(unit, brand=None):
    u = (unit or "").strip()
    if not u:
        return -999
    low = u.lower()
    score = len(u)
    if re.search(r"\d", u):
        score += 8
    if re.search(r"[A-Za-z]", u):
        score += 3
    if u in _SOFT_WORDS or len(u) <= 1:
        score -= 8
    for kw in (brand or {}).get("green_kw", []) + (brand or {}).get("yellow_kw", []):
        if kw and kw.lower() in low:
            score += 12
    return score


def keyword_set_from_segments(segments, corrections, brand=None):
    keywords = set()
    for seg in segments or []:
        text = correct_thai((seg.get("text") or "").strip(), corrections)
        candidates = []
        for unit in karaoke_units(text):
            if unit in _SOFT_WORDS:
                continue
            score = _unit_score(unit, brand)
            if score >= 3:
                candidates.append((score, unit))
        candidates.sort(key=lambda x: (-x[0], -len(x[1]), x[1]))
        for _, unit in candidates[:2]:
            keywords.add(unit)
    return keywords


def _style_for_unit(unit, keyword_words, brand=None):
    score = _unit_score(unit, brand)
    if unit in keyword_words or score >= 8:
        return "keyword"
    return "soft"


def merge_words_to_tokens(words):
    """แก้คำ whisper ที่ถูกหั่นเป็นชิ้น BPE กลางพยางค์ไทย เช่น [ได][้][ล][อง]
    -> ต่อทุกชิ้นกลับเป็นสตริงเต็ม แล้วตัดคำใหม่ด้วย pythainlp (ได้คำไทยสมบูรณ์)
    เวลาเริ่ม/จบของแต่ละคำคิดจากเวลาของชิ้นเดิมแบบสัดส่วนต่อตัวอักษร"""
    chars = []
    for w in words or []:
        txt = w.get("word") or ""
        if not txt:
            continue
        try:
            st, en = float(w.get("start", 0.0)), float(w.get("end", 0.0))
        except Exception:
            st, en = 0.0, 0.0
        if en < st:
            en = st
        n = len(txt)
        for i, ch in enumerate(txt):
            chars.append((ch, st + (en - st) * i / n, st + (en - st) * (i + 1) / n))
    raw = "".join(c[0] for c in chars)
    if not raw.strip():
        return []
    try:
        from pythainlp import word_tokenize
        toks = word_tokenize(raw, engine="newmm", keep_whitespace=True)
    except Exception:
        toks = re.findall(r"\S+|\s+", raw)
    out, pos = [], 0
    for tk in toks:
        a, b = pos, pos + len(tk)
        pos = b
        s = tk.strip()
        if not s:
            continue
        out.append({"start": round(chars[a][1], 3), "end": round(chars[b - 1][2], 3), "word": s})
    return out


def captions_from_words(words, tmap, corrections, segments=None, brand=None, min_dur=0.22):
    """สร้างซับแบบ smart karaoke: คำสำคัญกลางจอ, คำประกอบเป็นวลีสั้นทางซ้าย/ขวา"""
    raw_items = []
    keyword_words = keyword_set_from_segments(segments, corrections, brand)
    prev_word = None
    for w in merge_words_to_tokens(words):
        unit = correct_thai(w["word"], corrections)
        if not unit:
            continue
        # คำซ้ำติดกัน -> ไม้ยมก (เพื่อน เพื่อน -> เพื่อน ๆ)
        is_repeat = prev_word is not None and unit == prev_word and len(unit) >= 2 and _THAI_RE.fullmatch(unit)
        prev_word = unit
        if is_repeat:
            unit = "ๆ"
        ns, ne = tmap(w["start"]), tmap(w["end"])
        if ne - ns < min_dur:
            ne = ns + min_dur
        raw_items.append((ns, ne, unit, _style_for_unit(unit, keyword_words, brand)))

    caps, soft_buf, side = [], [], "left"

    def flush_soft():
        nonlocal soft_buf, side
        if not soft_buf:
            return
        start = soft_buf[0][0]
        end = max(x[1] for x in soft_buf)
        text = " ".join(x[2] for x in soft_buf).strip()
        caps.append((start, end, text, {"style": f"soft_{side}"}))
        side = "right" if side == "left" else "left"
        soft_buf = []

    for item in raw_items:
        ns, ne, unit, style = item
        if style == "keyword":
            flush_soft()
            caps.append((ns, ne, unit, {"style": "keyword"}))
            continue

        soft_buf.append(item)
        soft_text = " ".join(x[2] for x in soft_buf)
        if len(soft_buf) >= 3 or len(soft_text) >= 18 or (soft_buf[-1][1] - soft_buf[0][0]) >= 1.05:
            flush_soft()

    flush_soft()
    return caps


def captions_phrases_highlight(words, tmap, corrections, segments=None, brand=None,
                               max_chars=18, max_gap=0.45, min_dur=0.30, style_name="normal"):
    """ซับสไตล์ครีเอเตอร์: วลีสั้น ตัวขาวคมชัด ไฮไลท์คำสำคัญสีเหลือง ขึ้นตามจังหวะพูดจริง
    style_name: "normal" = วลีล่างจอ | "word" = คำสั้นกลางจอ (แบบคลิปตัวอย่าง)
    meta {"style":..., "hl":[(a,b)..]}"""
    keyword_words = keyword_set_from_segments(segments, corrections, brand)
    items, prev = [], None
    for w in merge_words_to_tokens(words):
        unit = correct_thai(w["word"], corrections)
        if not unit:
            continue
        is_repeat = prev is not None and unit == prev and len(unit) >= 2 and _THAI_RE.fullmatch(unit)
        prev = unit
        if is_repeat:
            unit = "ๆ"
        is_kw = unit in keyword_words or _unit_score(unit, brand) >= 8
        items.append((w["start"], w["end"], unit, is_kw))

    caps, buf = [], []

    def flush():
        nonlocal buf
        if not buf:
            return
        st, en = buf[0][0], max(x[1] for x in buf)
        parts, hl, pos = [], [], 0
        for i, (_, _, txt, kw) in enumerate(buf):
            if i > 0:
                pos += 1  # ช่องว่างคั่นคำ
            if kw:
                hl.append((pos, pos + len(txt)))
            parts.append(txt)
            pos += len(txt)
        ns, ne = tmap(st), tmap(en)
        if ne - ns < min_dur:
            ne = ns + min_dur
        caps.append((ns, ne, " ".join(parts), {"style": style_name, "hl": hl}))
        buf = []

    for it in items:
        if buf and (it[0] - buf[-1][1] > max_gap
                    or len(" ".join(x[2] for x in buf)) + 1 + len(it[2]) > max_chars):
            flush()
        buf.append(it)
    flush()
    return caps


def spans_from_hl(text, hl, brand):
    """สีตามช่วง highlight: คำสำคัญเหลือง ที่เหลือขาว"""
    n = len(text)
    owner = [False] * n
    for a, b in hl or []:
        for j in range(max(0, a), min(n, b)):
            owner[j] = True
    spans, i = [], 0
    while i < n:
        c = owner[i]
        j = i + 1
        while j < n and owner[j] == c:
            j += 1
        spans.append((i, j, brand["yellow"] if c else brand["white"]))
        i = j
    return spans


def captions_from_segments(segments, tmap, max_chars, corrections):
    caps = []
    for s in segments:
        st, en = s["start"], s["end"]
        text = correct_thai((s.get("text") or "").strip(), corrections)
        if not text:
            continue
        chunks = phrase_chunks(text, max_chars)
        total = sum(len(x) for x in chunks) or 1
        cur = st
        for ch in chunks:
            d = (en - st) * (len(ch) / total)
            ns, ne = tmap(cur), tmap(cur + d)
            cur += d
            if ne - ns < 0.40:
                ne = ns + 0.55
            caps.append((ns, ne, ch))
    return caps


def captions_from_script(script_text, words, tmap, max_chars, corrections):
    """ข้อความจากบท (ถูกเป๊ะ) + เวลาจากช่วงพูดจริงของ whisper (จับเวลา)"""
    text = correct_thai(script_text.strip(), corrections)
    chunks = phrase_chunks(text, max_chars)
    if not chunks:
        return []
    if words:
        sp_start, sp_end = words[0]["start"], words[-1]["end"]
    else:
        sp_start, sp_end = 0.0, 3.0 * max(1, len(chunks))
    total = sum(len(c) for c in chunks) or 1
    caps, cur = [], sp_start
    for ch in chunks:
        d = (sp_end - sp_start) * (len(ch) / total)
        ns, ne = tmap(cur), tmap(cur + d)
        cur += d
        if ne - ns < 0.40:
            ne = ns + 0.55
        caps.append((ns, ne, ch))
    return caps


# ---------- AI ตรวจแก้ภาษาไทยในซับ ----------
def _http_check(r, name):
    if r.status_code != 200:
        raise RuntimeError(f"{name} {r.status_code}: {r.text[:300]}")


# ผู้ให้บริการที่ใช้ API มาตรฐาน OpenAI (chat/completions) — รวมเจ้าฟรี: Groq/Cerebras/OpenRouter
_OAI_COMPAT = {
    "openai": ("https://api.openai.com/v1", "OpenAI"),
    "groq": ("https://api.groq.com/openai/v1", "Groq"),
    "cerebras": ("https://api.cerebras.ai/v1", "Cerebras"),
    "openrouter": ("https://openrouter.ai/api/v1", "OpenRouter"),
}


def _llm_json(provider, api_key, model, system, user, base_url=None):
    """เรียก LLM แล้วดึง JSON ก้อนแรกจากคำตอบ
    รองรับ: gemini / anthropic / local(Ollama) / openai / groq / cerebras / openrouter"""
    import requests
    if provider == "gemini":
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{model}:generateContent?key={api_key}")
        body = {"systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"}}
        r = requests.post(url, json=body, timeout=120)
        _http_check(r, "Gemini")
        text = "".join(p.get("text", "") for p in r.json()["candidates"][0]["content"]["parts"])
    elif provider == "anthropic":
        r = requests.post("https://api.anthropic.com/v1/messages",
                          headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                          json={"model": model, "max_tokens": 2048, "temperature": 0.4,
                                "system": system,
                                "messages": [{"role": "user", "content": user}]},
                          timeout=120)
        _http_check(r, "Claude")
        text = "\n".join(b.get("text", "") for b in r.json()["content"])
    elif provider == "local" or provider in _OAI_COMPAT:
        if provider == "local":
            base = (base_url or "http://127.0.0.1:11434/v1").rstrip("/")
            headers = {"Authorization": "Bearer local"}
            label, timeout = "AI ในเครื่อง", 300
        else:
            base, label = _OAI_COMPAT[provider]
            headers = {"Authorization": f"Bearer {api_key}"}
            timeout = 120
        body = {"model": model, "temperature": 0.4, "stream": False,
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}]}
        if provider != "openrouter":  # รุ่นฟรีบางตัวใน OpenRouter ไม่รองรับ json mode
            body["response_format"] = {"type": "json_object"}
        r = requests.post(f"{base}/chat/completions", headers=headers, json=body, timeout=timeout)
        _http_check(r, label)
        text = r.json()["choices"][0]["message"]["content"]
    else:
        raise ValueError(f"ยังไม่รองรับ provider: {provider}")
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("LLM ไม่ตอบเป็น JSON")
    return json.loads(m.group(0))


# โมเดลสำรอง (รุ่นฟรี/ถูก) เผื่อโมเดลที่ผู้ใช้ตั้งไว้ใช้ไม่ได้ เช่น key ฟรีเรียกรุ่น pro
_FALLBACK_MODELS = {"gemini": ["gemini-2.0-flash", "gemini-1.5-flash"],
                    "openai": ["gpt-4o-mini"],
                    "anthropic": ["claude-haiku-4-5-20251001"],
                    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
                    "cerebras": ["llama-3.3-70b"],
                    "openrouter": ["meta-llama/llama-3.3-70b-instruct:free", "openai/gpt-oss-120b:free"]}

def llm_thai_corrections(all_texts, provider, api_key, model, base_url=None):
    """ขั้นตอนที่ 2 ของซับแม่นยำ: ให้ AI อ่านข้อความถอดเสียงทั้งหมด แล้วชี้เฉพาะ "คำที่ถอดผิด"
    พร้อมคำที่ถูกต้อง — คืน dict {"คำผิด": "คำถูก"} เอาไปรวมกับ corrections (ไม่กระทบจังหวะเวลา)"""
    joined = "\n".join(t for t in all_texts if t.strip())
    if not joined.strip():
        return {}
    system = (
        "คุณคือผู้ตรวจปรู๊ฟภาษาไทยของข้อความที่ถอดจากเสียงพูดด้วย AI "
        "หน้าที่: หาเฉพาะคำที่สะกดผิด/ถอดเสียงผิด แล้วให้คำที่ถูกต้อง "
        'ตอบเป็น JSON เท่านั้น: {"replacements": {"คำผิด": "คำถูก", ...}}'
    )
    user = (
        f"ข้อความถอดเสียง:\n{joined}\n\n"
        "กติกา:\n- ระบุเฉพาะคำที่ผิดจริง (ชื่อเฉพาะ คำทับศัพท์ คำสะกดผิด) ไม่เกิน 20 คู่\n"
        "- ห้ามเปลี่ยนคำที่ถูกอยู่แล้ว ห้ามเรียบเรียงประโยคใหม่\n"
        "- คีย์ต้องเป็นคำที่ปรากฏในข้อความเป๊ะๆ\n"
        '- ถ้าไม่มีคำผิดเลย ตอบ {"replacements": {}}'
    )
    chain = [model] + [m for m in _FALLBACK_MODELS.get(provider, []) if m != model]
    for m in chain:
        try:
            data = _llm_json(provider, api_key, m, system, user, base_url)
            reps = data.get("replacements", {})
            return {str(k): str(v) for k, v in reps.items()
                    if k and v and k != v and len(str(k)) >= 2}
        except Exception as e:
            print(f"   !! ตรวจภาษาไทยด้วย {m} ไม่ได้ ({str(e)[:120]})", flush=True)
    return {}


# ---------- keyframe transition (zoom punch) ----------
def zoom_keyframes(times_us, seg_dur_us, peak=1.15, lead=120000, tail=180000):
    def kf(t, v):
        return {"id": guid(), "curveType": "Line", "graphID": "",
                "left_control": {"x": 0.0, "y": 0.0}, "right_control": {"x": 0.0, "y": 0.0},
                "time_offset": int(max(0, min(seg_dur_us, t))), "values": [float(v)]}
    pts = [(0, 1.0)]
    for t in times_us:
        pts += [(t - lead, 1.0), (t, peak), (t + tail, 1.0)]
    pts = sorted({(int(max(0, min(seg_dur_us, a))), v) for a, v in pts})
    kx = {"id": guid(), "keyframe_list": [kf(a, v) for a, v in pts], "material_id": "", "property_type": "KFTypeScaleX"}
    ky = {"id": guid(), "keyframe_list": [kf(a, v) for a, v in pts], "material_id": "", "property_type": "KFTypeScaleY"}
    return [kx, ky]


# ---------- draft ----------
def _is_usable_template(d):
    dcp = os.path.join(d, "draft_content.json")
    if not os.path.isdir(d) or not os.path.exists(dcp):
        return False
    try:
        dc = json.load(open(dcp, encoding="utf-8"))
    except Exception:
        return False
    return bool(dc["materials"].get("videos")) and any(
        t["type"] == "text" and t["segments"] for t in dc["tracks"])


def _scan_capcut_template():
    """fallback: หา template จาก draft ที่มีอยู่ในเครื่อง (ใช้ตอน dev ที่ไม่มี bundled template)"""
    best, bestmt = None, -1
    for d in glob.glob(os.path.join(DRAFT_ROOT, "*")):
        if not _is_usable_template(d):
            continue
        base = os.path.basename(d)
        if base.startswith(("Claude_", "Thanyakij_", "CAPCUT_")):
            continue
        mt = os.path.getmtime(os.path.join(d, "draft_content.json"))
        if mt > bestmt:
            best, bestmt = d, mt
    return best


def pick_template():
    # 1) template ที่แจกมากับแอป (ทำงานได้บนเครื่อง user ทุกเครื่อง)
    if _is_usable_template(TEMPLATE_DIR):
        return TEMPLATE_DIR
    # 2) fallback: draft ในเครื่อง (dev)
    found = _scan_capcut_template()
    if found:
        return found
    raise SystemExit("ไม่พบ template draft — ไฟล์ template_draft ที่มากับแอปอาจหาย กรุณาติดตั้งแอปใหม่")


def _clear_readonly(path):
    """เอา read-only attribute ออกจากทุกไฟล์/โฟลเดอร์ใต้ path
    (Windows ห้ามลบโฟลเดอร์ที่ตั้ง read-only ไว้ — attribute นี้ติดมาจาก template_draft/ ตอน copytree)"""
    import stat
    try:
        os.chmod(path, stat.S_IWRITE)
    except Exception:
        pass
    for root, dirs, files in os.walk(path):
        for name in dirs + files:
            p = os.path.join(root, name)
            try:
                os.chmod(p, stat.S_IWRITE)
            except Exception:
                pass


def _rmtree_retry(path, tries=5, delay=0.3):
    """ลบโฟลเดอร์โปรเจกต์เดิมก่อนเขียนทับ — เคลียร์ read-only attribute ก่อน (สาเหตุหลักที่พบ: ติดมาจาก
    template_draft/ ตอน copytree) แล้วลองใหม่สั้น ๆ เผื่อโดนโปรแกรมสแกนไฟล์ล็อกชั่วคราว
    ถ้ายังไม่ได้จริง ๆ ค่อย error ที่บอกวิธีแก้ชัดเจนแทน traceback ดิบ"""
    _clear_readonly(path)
    last = None
    for _ in range(tries):
        try:
            shutil.rmtree(path)
            return
        except PermissionError as e:
            last = e
            _clear_readonly(path)
            time.sleep(delay)
    raise SystemExit(
        f"ลบโปรเจกต์เดิม \"{os.path.basename(path)}\" ไม่ได้ เพราะมีไฟล์ถูกล็อกอยู่ ({last})\n"
        "สาเหตุที่พบบ่อยที่สุด: เปิด CapCut ค้างไว้แล้วดูโปรเจกต์นี้อยู่พอดี\n"
        "วิธีแก้: ปิด CapCut ให้สนิท (เช็คใน Task Manager ว่าไม่มี CapCut เหลืออยู่) แล้วลองสร้างใหม่อีกครั้ง"
    )


def build_draft(clip, name, captions, clip_dur_us, scene_kf, brand):
    """สร้าง CapCut draft (video track 1 segment + text captions + pop + zoom)"""
    ensure_capcut()
    ensure_local_file(clip)   # กันคลิปสีแดง: ต้องไม่ใช่ไฟล์ cloud-only placeholder ก่อนให้ CapCut อ้างอิง
    clip_w, clip_h = ffprobe_wh(clip)
    template = pick_template()
    out_dir = os.path.join(DRAFT_ROOT, name)
    if os.path.exists(out_dir):
        _rmtree_retry(out_dir)
    shutil.copytree(template, out_dir)
    _clear_readonly(out_dir)   # กันโฟลเดอร์ใหม่ติด read-only มาจาก template (ลบไม่ได้ตอนสร้างซ้ำครั้งหน้า)
    _substitute_tokens(out_dir)   # แปลง __LOCALAPPDATA__/__DRAFT_ROOT__ ให้เป็น path จริงของ user
    for junk in ["draft_content.json.bak", "template-2.tmp", ".locked"]:
        p = os.path.join(out_dir, junk)
        if os.path.exists(p):
            try: os.remove(p)
            except Exception: pass

    dc = json.load(open(os.path.join(out_dir, "draft_content.json"), encoding="utf-8"))
    # ตั้ง canvas ของโปรเจกต์ให้ตรงกับความละเอียดจริงของวิดีโอ (คงแนวนอน/แนวตั้งตามต้นฉบับ)
    # ไม่งั้นคลิปแนวนอนจะถูกวางในกรอบ 9:16 ของ template แล้วขึ้นแถบดำ (letterbox) ใน CapCut
    cv = dc.setdefault("canvas_config", {})
    cv["width"], cv["height"] = clip_w, clip_h
    clip_fwd = clip.replace("\\", "/")
    fp = resolve_font(brand); fs = brand["font_size"]; lc = brand["line_chars"]

    vid = dc["materials"]["videos"][0]
    new_local = str(uuid.uuid4())
    vid.update({"path": clip_fwd, "material_name": os.path.basename(clip), "duration": clip_dur_us,
                "width": clip_w, "height": clip_h, "has_audio": True, "local_material_id": new_local})
    vtr = next(t for t in dc["tracks"] if t["type"] == "video")
    vtr["segments"][0]["source_timerange"] = {"start": 0, "duration": clip_dur_us}
    vtr["segments"][0]["target_timerange"] = {"start": 0, "duration": clip_dur_us}
    if scene_kf:
        vtr["segments"][0]["common_keyframes"] = zoom_keyframes(scene_kf, clip_dur_us)
        vtr["segments"][0]["uniform_scale"] = {"on": False, "value": 1.0}
    dc["duration"] = clip_dur_us

    ttr = next(t for t in dc["tracks"] if t["type"] == "text")
    tpl_seg = copy.deepcopy(ttr["segments"][0])
    tpl_mat = copy.deepcopy(dc["materials"]["texts"][0])
    base_style = json.loads(tpl_mat["content"])["styles"][0]
    base_style.setdefault("font", {}); base_style["font"]["path"] = fp; base_style["font"]["id"] = ""
    base_style["size"] = fs
    # resolve text-effect cache (effectStyle) ให้ตรงเครื่อง user — ไม่มีก็ปล่อยให้ CapCut โหลดเองด้วย id
    _es = base_style.get("effectStyle")
    if isinstance(_es, dict) and _es.get("id"):
        _es["path"] = resolve_effect_cache(_es.get("id"), "")
    y_pos = brand.get("y_pos", tpl_seg["clip"]["transform"]["y"])
    shared_refs = list(tpl_seg.get("extra_material_refs", []))[1:]
    pop_on = brand.get("pop_anim_on", True)
    pop = dict(brand.get("pop_anim") or {})
    pop["path"] = resolve_effect_cache(pop.get("resource_id", ""), pop.get("path", ""))

    texts, segs, anims, ri = [], [], [], 14001
    for cap in captions:
        ns, ne, raw = cap[0], cap[1], cap[2]
        cap_meta = cap[3] if len(cap) >= 4 and isinstance(cap[3], dict) else {}
        cap_style = cap_meta.get("style", "normal")
        start_us, dur_us = int(ns * 1_000_000), int(max(0.4, ne - ns) * 1_000_000)
        hl = cap_meta.get("hl")
        # วลี highlight สั้นอยู่แล้ว — ไม่ตัดบรรทัด เพื่อรักษาตำแหน่งช่วงสีให้ตรง
        txt = raw if hl is not None else thai_wrap(raw, lc)
        mid = guid()
        mat = copy.deepcopy(tpl_mat); mat["id"] = mid
        styles = []
        style_size = fs
        text_size = int(round(fs * 1.9))
        line_width = 0.90
        if cap_style == "keyword":
            style_size = fs * 1.55
            text_size = int(round(fs * 2.8))
            line_width = 0.96
        elif cap_style.startswith("soft_"):
            style_size = fs * 0.82
            text_size = int(round(fs * 1.45))
            line_width = 0.54
        elif cap_style == "word":
            style_size = fs * 1.15
            text_size = int(round(fs * 2.1))
            line_width = 0.92
        elif cap_style == "hook":
            style_size = fs * 1.5
            text_size = int(round(fs * 2.6))
            line_width = 0.92

        if cap_style == "hook":
            span_list = [(0, len(txt), brand["green"])]
        elif hl is not None:
            span_list = spans_from_hl(txt, hl, brand)
        else:
            span_list = styled_color_spans(txt, brand, cap_style)
        for (a, b, col) in span_list:
            so = copy.deepcopy(base_style)
            so["fill"] = {"content": {"render_type": "solid", "solid": {"color": col}}}
            so["size"] = style_size
            so["range"] = [a, b]; styles.append(so)
        mat["content"] = json.dumps({"text": txt, "styles": styles}, ensure_ascii=False)
        mat["font_path"] = fp; mat["text_color"] = "#FFFFFF"; mat["border_color"] = "#000000"
        mat["font_size"] = style_size; mat["text_size"] = text_size; mat["line_max_width"] = line_width
        texts.append(mat)

        if pop_on and pop.get("resource_id"):
            aid = guid()
            an = {"id": aid, "type": "sticker_animation",
                  "animations": [{"id": "", "type": "in", "start": 0, "duration": min(333333, dur_us),
                                  "path": pop["path"], "platform": "all", "resource_id": pop["resource_id"],
                                  "third_resource_id": "", "source_platform": 1, "name": "",
                                  "category_id": "", "category_name": "", "panel": "",
                                  "material_type": "sticker", "anim_adjust_params": None, "request_id": ""}],
                  "multi_language_current": "none"}
            anims.append(an)
            seg_refs = [aid] + shared_refs
        else:
            seg_refs = list(shared_refs)

        seg = copy.deepcopy(tpl_seg)
        seg["id"] = guid(); seg["material_id"] = mid; seg["source_timerange"] = None
        seg["target_timerange"] = {"start": start_us, "duration": dur_us}
        seg["clip"]["transform"]["y"] = y_pos
        if cap_style == "keyword":
            seg["clip"]["transform"]["x"] = 0.0
            seg["clip"]["transform"]["y"] = brand.get("keyword_y_pos", y_pos)
        elif cap_style == "soft_left":
            seg["clip"]["transform"]["x"] = brand.get("soft_left_x", -0.34)
            seg["clip"]["transform"]["y"] = brand.get("soft_y_pos", -0.26)
        elif cap_style == "soft_right":
            seg["clip"]["transform"]["x"] = brand.get("soft_right_x", 0.34)
            seg["clip"]["transform"]["y"] = brand.get("soft_y_pos", -0.26)
        elif cap_style == "word":
            seg["clip"]["transform"]["x"] = 0.0
            seg["clip"]["transform"]["y"] = brand.get("word_y_pos", -0.05)
        elif cap_style == "hook":
            seg["clip"]["transform"]["x"] = 0.0
            seg["clip"]["transform"]["y"] = brand.get("hook_y_pos", -0.34)
        seg["extra_material_refs"] = seg_refs
        seg["render_index"] = ri; ri += 1
        segs.append(seg)

    dc["materials"]["texts"] = texts
    dc["materials"]["material_animations"] = anims
    ttr["segments"] = segs
    json.dump(dc, open(os.path.join(out_dir, "draft_content.json"), "w", encoding="utf-8"), ensure_ascii=False)

    meta = json.load(open(os.path.join(out_dir, "draft_meta_info.json"), encoding="utf-8"))
    now = int(time.time() * 1_000_000)
    meta.update({"draft_id": guid(), "draft_name": name,
                 "draft_fold_path": meta["draft_root_path"].rstrip("/") + "/" + name,
                 "tm_draft_create": now, "tm_draft_modified": now, "tm_duration": clip_dur_us})
    for grp in meta.get("draft_materials", []):
        if grp.get("type") == 0:
            for it in grp.get("value", []):
                if it.get("metetype") == "video":
                    it.update({"file_Path": clip_fwd, "extra_info": os.path.basename(clip),
                               "width": clip_w, "height": clip_h, "duration": clip_dur_us,
                               "roughcut_time_range": {"duration": clip_dur_us, "start": 0}, "id": new_local})
        if grp.get("type") == 2:
            grp["value"] = []
    json.dump(meta, open(os.path.join(out_dir, "draft_meta_info.json"), "w", encoding="utf-8"), ensure_ascii=False)
    return out_dir, os.path.basename(template), (clip_w, clip_h)
