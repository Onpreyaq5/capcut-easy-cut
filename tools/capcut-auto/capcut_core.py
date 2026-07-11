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


def _font_family_name(ttf_path):
    """อ่านชื่อ family จริงจากไฟล์ฟอนต์ (ใช้ PIL) — เผื่อชื่อไฟล์ต่างจากชื่อ family"""
    try:
        from PIL import ImageFont
        fam, _style = ImageFont.truetype(ttf_path, 40).getname()
        return fam
    except Exception:
        return None


_INSTALLED_FONTS = set()   # กันติดตั้งซ้ำในรันเดียว


def install_font_user(ttf_path):
    """ติดตั้งฟอนต์แบบ per-user (ไม่ต้องสิทธิ์แอดมิน) เพื่อให้ CapCut มองเห็นและ render ได้จริง
    — สำคัญ: CapCut จะ render ฟอนต์ที่ 'ติดตั้งในเครื่อง' เท่านั้น ลำพัง font_path ในไฟล์ draft ไม่พอ
    คืน path ที่ติดตั้งแล้ว (ในโฟลเดอร์ฟอนต์ของ user) หรือ None ถ้าล้มเหลว"""
    if os.name != "nt" or not ttf_path or not os.path.exists(ttf_path):
        return None
    if ttf_path in _INSTALLED_FONTS:
        return None
    try:
        import shutil, ctypes, winreg
        fonts_dir = os.path.join(LOCALAPPDATA, "Microsoft", "Windows", "Fonts")
        os.makedirs(fonts_dir, exist_ok=True)
        base = os.path.basename(ttf_path)
        dest = os.path.join(fonts_dir, base)
        if not os.path.exists(dest):
            shutil.copy2(ttf_path, dest)
        fam = _font_family_name(ttf_path) or os.path.splitext(base)[0]
        # ลงทะเบียนใน HKCU (per-user ไม่ต้องแอดมิน)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER,
                              r"Software\Microsoft\Windows NT\CurrentVersion\Fonts") as key:
            winreg.SetValueEx(key, f"{fam} (TrueType)", 0, winreg.REG_SZ, dest)
        # โหลดฟอนต์เข้า session ปัจจุบัน + แจ้งระบบว่าฟอนต์เปลี่ยน (CapCut ที่เปิดใหม่จะเห็น)
        try:
            ctypes.windll.gdi32.AddFontResourceW(dest)
            ctypes.windll.user32.SendMessageTimeoutW(0xFFFF, 0x001D, 0, 0, 0, 1000, None)  # WM_FONTCHANGE
        except Exception:
            pass
        _INSTALLED_FONTS.add(ttf_path)
        print(f"   ติดตั้งฟอนต์ '{fam}' ให้ CapCut แล้ว", flush=True)
        return dest.replace("\\", "/")
    except Exception as e:
        print(f"   (ติดตั้งฟอนต์ไม่สำเร็จ ใช้ path ตรง ๆ แทน: {e})", flush=True)
        return None


def resolve_font(brand):
    """คืน font_path ที่มีจริงในเครื่อง — ถ้าที่ตั้งไว้ไม่มี ลอง fallback ทีละตัว
    ถ้าเป็นฟอนต์ที่ bundle มา (assets/fonts) จะติดตั้งเข้าเครื่องอัตโนมัติเพื่อให้ CapCut render ได้"""
    want = (brand or {}).get("font_path") or ""
    if want and os.path.exists(want):
        # ฟอนต์ bundle → ติดตั้งเข้าเครื่องก่อน แล้วชี้ font_path ไปตัวที่ติดตั้ง (เสถียร + CapCut เห็น)
        norm = os.path.normpath(want).replace("\\", "/")
        if "/assets/fonts/" in norm.lower():
            installed = install_font_user(want)
            if installed:
                return installed
        return want.replace("\\", "/")
    for f in _FONT_FALLBACKS:
        if os.path.exists(f):
            if want:
                print(f"   !! ไม่พบฟอนต์ {want} — ใช้ {os.path.basename(f)} แทน", flush=True)
            return f.replace("\\", "/")
    return (want or _FONT_FALLBACKS[0]).replace("\\", "/")


def _exe_ok(exe):
    try:
        r = subprocess.run([exe, "-version"], capture_output=True, text=True,
                           encoding="utf-8", errors="ignore")
        return r.returncode == 0
    except Exception:
        return False


def _discover_ffmpeg():
    """หา ffmpeg.exe ในตำแหน่งติดตั้งยอดนิยมบน Windows เผื่อไม่อยู่ใน PATH ของโปรเซสนี้
    (เช่น winget เพิ่งติดตั้งแล้ว PATH ยังไม่รีเฟรช หรือเว็บถูกเปิดจาก shell ที่ PATH ไม่ครบ)
    คืน (ffmpeg, ffprobe) หรือ (None, None)"""
    cand = []
    if LOCALAPPDATA:
        # 1) ตัวลิงก์ของ winget
        cand.append(os.path.join(LOCALAPPDATA, "Microsoft", "WinGet", "Links", "ffmpeg.exe"))
        # 2) โฟลเดอร์แพ็กเกจ Gyan.FFmpeg ของ winget
        cand += glob.glob(os.path.join(LOCALAPPDATA, "Microsoft", "WinGet", "Packages",
                                       "Gyan.FFmpeg*", "**", "ffmpeg.exe"), recursive=True)
        # 3) ตัวที่ตัวติดตั้งอัตโนมัติของแอป (ensure_deps.ps1) ดาวน์โหลดไว้
        cand += glob.glob(os.path.join(LOCALAPPDATA, "CAPCUT_Easy_CUT", "ffmpeg",
                                       "**", "ffmpeg.exe"), recursive=True)
    # 4) ตำแหน่งติดตั้งเองยอดนิยม
    cand += glob.glob(r"C:\ffmpeg\**\ffmpeg.exe", recursive=True)
    for c in cand:
        probe = os.path.join(os.path.dirname(c), "ffprobe.exe")
        if os.path.exists(c) and os.path.exists(probe) and _exe_ok(c) and _exe_ok(probe):
            return c, probe
    return None, None


def ensure_ffmpeg():
    """ตรวจว่าเรียก ffmpeg/ffprobe ได้ — ถ้าไม่อยู่ใน PATH จะค้นหาในเครื่องให้เองก่อน
    หาไม่เจอจริงๆ ค่อย error พร้อมวิธีแก้ที่ทำตามได้ทันที"""
    global FFMPEG, FFPROBE
    if _exe_ok(FFMPEG) and _exe_ok(FFPROBE):
        return
    f, p = _discover_ffmpeg()
    if f:
        FFMPEG, FFPROBE = f, p
        print(f"   ใช้ ffmpeg ที่พบในเครื่อง: {f}", flush=True)
        return
    raise SystemExit(
        "เรียก ffmpeg ไม่ได้ — วิธีแก้: ปิดหน้าต่างนี้ แล้วดับเบิลคลิกไฟล์ \"⚙️ ติดตั้งครั้งแรก.bat\" "
        "(อยู่ในโฟลเดอร์ tools\\capcut-auto) ระบบจะติดตั้ง ffmpeg ให้อัตโนมัติ เสร็จแล้วเปิดเว็บใหม่อีกครั้ง")


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


def capcut_is_running():
    """เช็คว่ามี CapCut เปิดค้างอยู่ไหม (Windows) — ถ้าเปิดค้างตอนสร้างโปรเจกต์
    CapCut จะล็อกโฟลเดอร์ + แสดง state เก่าใน memory ทำให้คลิปขึ้นสีแดง 'Media Not Found'
    แม้ไฟล์จริงจะถูกสร้างถูกต้องแล้วก็ตาม (ต้องปิด CapCut ให้สนิทก่อน แล้วเปิดใหม่)"""
    if os.name != "nt":
        return False
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq CapCut.exe", "/NH"],
                             capture_output=True, text=True, timeout=15).stdout
        return "CapCut.exe" in out
    except Exception:
        return False


def ensure_capcut_closed():
    """fail เร็วพร้อมข้อความชัดเจน ถ้า CapCut เปิดค้างอยู่ — กันเคส 'คลิปสีแดง' ที่พบบ่อยที่สุด
    (เรียกก่อนเริ่มงานหนัก เช่น ถอดเสียง จะได้ไม่ต้องรอ 10 นาทีแล้วค่อยรู้ว่าต้องปิด CapCut)"""
    if capcut_is_running():
        raise SystemExit(
            "พบว่า CapCut กำลังเปิดอยู่ — ต้องปิด CapCut ให้สนิทก่อนสร้างโปรเจกต์\n"
            "ถ้าสร้างขณะ CapCut เปิดค้าง คลิปจะขึ้นเป็นสีแดง 'Media Not Found' "
            "เพราะ CapCut ล็อกโฟลเดอร์และค้างสถานะเดิมไว้\n"
            "วิธีแก้: ปิดหน้าต่าง CapCut ทุกบาน (เช็คใน Task Manager ว่าไม่มี CapCut.exe เหลือ) "
            "แล้วกดสร้างใหม่ พอเสร็จค่อยเปิด CapCut — โปรเจกต์จะอยู่บนสุด เปิดได้เลยไม่แดง"
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


def compute_keeps(clip_dur, silences, min_sil, pad, extra_cuts=None):
    """คำนวณช่วงที่จะ "เก็บไว้" (keeps) หลังตัดช่วงเงียบออก
    extra_cuts: ช่วงเวลาเพิ่มเติมที่ต้องตัดทิ้งเสมอ (เช่น คำพูดติดขัด/พูดผิด) — ตัดเป๊ะตามช่วง"""
    cuts = []
    for ss, se in silences:
        if (se - ss) >= min_sil:
            cs, ce = ss + pad, se - pad
            if ce > cs:
                cuts.append((cs, ce))
    for cs, ce in (extra_cuts or []):
        cs, ce = max(0.0, float(cs)), min(float(clip_dur), float(ce))
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
# บริบทช่วยให้ whisper เดาเป็นภาษาไทย ลดการหลอนเป็นอังกฤษ/ภาษาอื่นช่วงต้นคลิป
_TH_INIT_PROMPT = "ต่อไปนี้เป็นคลิปวิดีโอที่พูดเป็นภาษาไทยทั้งหมด"
# สระอำแบบแยกชิ้น (นิคหิต+สระอา) ที่ whisper มักถอดออกมา -> รวมเป็นสระอำตัวเดียว (ทํา -> ทำ, คํา -> คำ)
_SARA_AM_FIX = re.compile("ํา")


def _normalize_thai(text):
    """ซ่อมข้อความไทยจาก whisper: รวมสระอำที่ถูกแยกชิ้น (ทํา->ทำ) — ปลอดภัย ไม่เปลี่ยนความหมาย"""
    return _SARA_AM_FIX.sub("ำ", text or "")


_MODEL = None
def _load_whisper():
    """โหลดโมเดล whisper แบบยืดหยุ่น: มี GPU ใช้ GPU, ไม่มี fallback CPU
    ปรับได้ผ่าน env: EASYCUT_WHISPER_MODEL (เช่น small/medium/large-v3), EASYCUT_WHISPER_DEVICE"""
    from faster_whisper import WhisperModel
    # default large-v3 = แม่นสุดสำหรับไทย (ลดการหลอนเป็นภาษาต่างประเทศ) — ตั้ง env เป็น medium/small ได้ถ้าต้องการเร็ว
    model = os.environ.get("EASYCUT_WHISPER_MODEL", "large-v3").strip() or "large-v3"
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
    segs, info = _MODEL.transcribe(
        path, language="th", word_timestamps=True, vad_filter=True,
        beam_size=max(WHISPER_BEAM, 5), best_of=5, temperature=0.0,
        condition_on_previous_text=False,   # กันหลอนสะสม (ประโยคก่อนผิดแล้วลากผิดต่อ)
        no_speech_threshold=0.6,
        initial_prompt=_TH_INIT_PROMPT,     # บริบทไทย ลดการถอดเป็นภาษาต่างประเทศ
    )
    total = float(getattr(info, "duration", 0) or 0)
    segments, words = [], []
    last_pct = -10
    for s in segs:
        segments.append({"start": round(s.start, 3), "end": round(s.end, 3),
                         "text": _normalize_thai(s.text.strip())})
        for w in (s.words or []):
            words.append({"start": round(w.start, 3), "end": round(w.end, 3),
                          "word": _normalize_thai(w.word)})
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
                               max_chars=18, max_gap=0.45, min_dur=0.30, style_name="normal",
                               max_words=0):
    """ซับสไตล์ครีเอเตอร์: วลีสั้น ตัวขาวคมชัด ไฮไลท์คำสำคัญสีเหลือง ขึ้นตามจังหวะพูดจริง
    style_name: "normal" = วลีล่างจอ | "word" = คำสั้นกลางจอ (แบบคลิปตัวอย่าง)
    max_words: จำนวนคำสูงสุดต่อ 1 ซับ (0 = อัตโนมัติตามจำนวนตัวอักษร max_chars)
    meta {"style":..., "hl":[(a,b)..]}"""
    # ถ้าผู้ใช้กำหนดจำนวนคำ ให้จำนวนคำเป็นตัวควบคุมหลัก (ขยายเพดานตัวอักษรไม่ให้ตัดก่อนครบคำ)
    if max_words:
        max_chars = max(max_chars, max_words * 30)
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
        over_words = bool(max_words) and len(buf) >= max_words
        if buf and (over_words
                    or it[0] - buf[-1][1] > max_gap
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
        "หน้าที่: หาเฉพาะ 'คำเดี่ยว' ที่สะกดผิด/ถอดเสียงผิด แล้วให้คำที่ถูกต้อง "
        'ตอบเป็น JSON เท่านั้น: {"replacements": {"คำผิด": "คำถูก", ...}}'
    )
    user = (
        f"ข้อความถอดเสียง:\n{joined}\n\n"
        "กติกาเข้มงวด (ผิดกติกา = ทิ้งทั้งคู่):\n"
        "- แก้ได้เฉพาะ 'คำเดี่ยว' เท่านั้น ห้ามมีช่องว่างในคีย์หรือค่า (ห้ามแก้ทั้งวลี/ทั้งประโยค)\n"
        "- ห้ามเรียบเรียงประโยคใหม่ ห้ามเปลี่ยนความหมาย ห้ามเปลี่ยนตัวเลข/เปอร์เซ็นต์\n"
        "- ห้ามเปลี่ยนคำที่ถูกอยู่แล้ว (เช่น แคปคัท, ChatGPT ถือว่าถูก อย่าแตะ)\n"
        "- คีย์ต้องเป็นคำที่ปรากฏในข้อความเป๊ะๆ ยาวไม่เกิน 15 ตัวอักษร ไม่เกิน 20 คู่\n"
        '- ถ้าไม่มีคำผิดชัดเจน ตอบ {"replacements": {}}'
    )
    chain = [model] + [m for m in _FALLBACK_MODELS.get(provider, []) if m != model]
    for m in chain:
        try:
            data = _llm_json(provider, api_key, m, system, user, base_url)
            reps = data.get("replacements", {})
            return {str(k): str(v) for k, v in reps.items()
                    if _is_safe_correction(k, v)}
        except Exception as e:
            print(f"   !! ตรวจภาษาไทยด้วย {m} ไม่ได้ ({str(e)[:120]})", flush=True)
    return {}


def _is_safe_correction(k, v):
    """กรองคำแก้จาก AI ให้เหลือเฉพาะที่ปลอดภัย — กัน AI เขียนประโยคใหม่/เปลี่ยนตัวเลข/แก้มั่ว
    (เจอบ่อยกับโมเดลเล็ก เช่น qwen 7b ที่ชอบ rewrite ทั้งประโยค)"""
    k, v = str(k or "").strip(), str(v or "").strip()
    if not k or not v or k == v:
        return False
    if len(k) < 2 or len(k) > 15:            # คำเดี่ยวเท่านั้น (คีย์ยาว = มักเป็นประโยค)
        return False
    if " " in k or " " in v:                  # มีช่องว่าง = วลี/ประโยค -> ทิ้ง
        return False
    if len(v) > len(k) + 6:                    # ค่ายาวกว่าคีย์มาก = มักขยายความ/rewrite
        return False
    if any(c.isdigit() for c in k + v):        # แตะตัวเลข = อันตราย (เปลี่ยนจำนวน/เปอร์เซ็นต์)
        return False
    # ต้องเป็นการ 'แก้สะกด' (คล้ายคำเดิม) ไม่ใช่ 'เปลี่ยนคำ/เขียนใหม่'
    # ภาษาไทยไม่มีเว้นวรรค -> เช็คความยาวอย่างเดียวไม่พอ ต้องดูความคล้ายด้วย
    import difflib
    if difflib.SequenceMatcher(None, k, v).ratio() < 0.5:
        return False
    return True


# ============================================================
#  เอเจนต์ตัดคำพูดติดขัด / พูดผิด (disfluency · outtake · blooper · flub · slip)
#  หลักการ 2 ชั้น:
#   ชั้น 1 (ฮิวริสติก · ฟรี · เปิดตลอด): ตัดคำเติม (เอ่อ อ่า um) + พูดคำเดิมซ้ำติดกัน (false start / ติดอ่าง)
#   ชั้น 2 (AI · ไม่บังคับ): ผู้เชี่ยวชาญตัดต่อ อ่าน transcript แล้วชี้ประโยคที่พูดผิดแล้วพูดใหม่ (retake)
#                            หรือหลุด/ออกนอกเรื่อง (outtake/blooper) ให้ตัดทั้งประโยค เก็บเทคที่ดีที่สุด
# ============================================================

# คำเติม/คำลังเลภาษาไทย + สากล (normalize แล้วเทียบ)
_TH_FILLERS = {"เอ่อ", "เอ้อ", "เออ", "เอ๋อ", "อ่า", "อ้า", "อาา", "เอิ่ม", "อึม", "อืม",
               "อึ", "หืม", "เอ", "แอ่ม", "เอ่อๆ", "แบบว่า", "คือแบบ", "ประมาณว่า", "อ่าา", "เออๆ"}
_EN_FILLERS = {"uh", "um", "umm", "uhh", "uhm", "er", "err", "erm", "hmm", "hmmm", "mmm", "eh"}


def _norm_unit(s):
    """ตัดช่องว่าง/เครื่องหมาย/ไม้ยมก ออก แล้วทำตัวพิมพ์เล็ก เพื่อเทียบคำ"""
    return re.sub(r"[\s\.\,\!\?ฯๆ]+", "", str(s or "")).strip().lower()


def merge_spans(spans, join_gap=0.12):
    """รวมช่วงเวลาที่ทับ/ชิดกัน (ภายใน join_gap วินาที) ให้เป็นช่วงเดียว; คืนที่เรียงแล้ว"""
    clean = sorted((float(a), float(b)) for a, b in spans if b is not None and float(b) > float(a))
    out = []
    for a, b in clean:
        if out and a - out[-1][1] <= join_gap:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def detect_disfluencies(words, fillers=True, repeats=True, max_repeat_gap=0.9):
    """ฮิวริสติก: หา span เวลา (คลิปต้นฉบับ) ของคำพูดติดขัดที่ควรตัดออก — ฟรี ไม่ง้อ AI
    - filler: เอ่อ/อ่า/เอิ่ม/um/uh ฯลฯ -> ตัดทิ้ง
    - false start / ติดอ่าง: พูดคำเดิมซ้ำติดกัน -> ตัด "ตัวก่อนหน้า" เก็บตัวหลัง (มักพูดชัดกว่า)
    คืน list[dict] {start,end,reason}"""
    toks = merge_words_to_tokens(words)
    hits, fill = [], (_TH_FILLERS | _EN_FILLERS)
    if fillers:
        for w in toks:
            if _norm_unit(w["word"]) in fill:
                hits.append({"start": w["start"], "end": w["end"], "reason": "filler"})
    if repeats:
        i = 0
        while i < len(toks) - 1:
            a = _norm_unit(toks[i]["word"])
            if len(a) >= 2:
                j = i + 1
                # ข้ามคำเติมที่คั่นกลาง เช่น "ผม เอ่อ ผม"
                while j < len(toks) and _norm_unit(toks[j]["word"]) in fill:
                    j += 1
                if (j < len(toks) and _norm_unit(toks[j]["word"]) == a
                        and toks[j]["start"] - toks[i]["end"] <= max_repeat_gap):
                    hits.append({"start": toks[i]["start"], "end": toks[j]["start"], "reason": "repeat"})
                    i = j
                    continue
            i += 1
        # retake ระดับวลี: พูดวลี/ประโยคเดิมซ้ำติดกัน (แก้คำพูด 2-3 รอบ) -> ตัดรอบก่อนหน้า เก็บรอบสุดท้าย
        # เดิมจับได้แค่คำเดียวซ้ำ ทำให้ "พูดแก้ทั้งประโยค 3 รอบ" หลุดขึ้นซับครบทุกรอบ
        norm = [_norm_unit(t["word"]) for t in toks]
        i = 0
        while i < len(toks):
            matched = False
            for n in range(min(8, (len(toks) - i) // 2), 1, -1):
                seq_a, seq_b = norm[i:i + n], norm[i + n:i + 2 * n]
                if (seq_a == seq_b and all(seq_a)
                        and sum(len(x) for x in seq_a) >= 4     # วลีสั้นเกิน (เช่น "ๆ ๆ") ไม่นับ กัน false positive
                        and toks[i + n]["start"] - toks[i + n - 1]["end"] <= 1.2):
                    hits.append({"start": toks[i]["start"], "end": toks[i + n]["start"], "reason": "retake"})
                    i += n   # ขยับไปเทคถัดไป — ถ้าซ้ำอีก (พูด 3 รอบ) จะตัดรอบกลางต่อ เหลือรอบสุดท้าย
                    matched = True
                    break
            if not matched:
                i += 1
    return hits


def llm_find_flubs(segments, provider, api_key, model, base_url=None):
    """เอเจนต์ผู้เชี่ยวชาญตัดต่อระดับโลก: อ่าน transcript ระดับประโยคพร้อมเวลา
    แล้วชี้ประโยคที่ควรตัดทิ้ง — พูดผิดแล้วพูดใหม่ (retake), หลุด/บลูปเปอร์, ออกนอกเรื่อง (outtake),
    ประโยคที่ไม่จบความแล้วเริ่มใหม่ (false start ระดับประโยค)
    คืน list[dict] {start,end,reason} (เวลาอ้างอิงคลิปต้นฉบับ)"""
    segs = [s for s in (segments or []) if (s.get("text") or "").strip()]
    if len(segs) < 2:
        return []
    lines = [f"[{i}] ({s['start']:.2f}-{s['end']:.2f}) {s['text'].strip()}" for i, s in enumerate(segs)]
    system = (
        "คุณคือบรรณาธิการตัดต่อวิดีโอระดับโลก เชี่ยวชาญการตัด outtake, blooper, flub, "
        "false start, slip of the tongue และเทคที่พูดผิดแล้วพูดใหม่ (retake) ออกจากคลิปพูดคนเดียว "
        "หน้าที่: อ่าน transcript ที่แบ่งเป็นประโยค (มีเลขบรรทัดและเวลา) แล้วเลือกเฉพาะบรรทัดที่ควร 'ตัดทิ้ง' "
        'ตอบเป็น JSON เท่านั้น: {"remove": [{"line": <เลขบรรทัด>, "reason": "retake|blooper|outtake|false_start|filler"}]}'
    )
    user = (
        "transcript:\n" + "\n".join(lines) + "\n\n"
        "กติกาสำคัญ:\n"
        "- ถ้าผู้พูดพูดประโยคหนึ่งแล้วพูดซ้ำอีกครั้งให้ดีขึ้น/แก้คำผิด ให้ตัด 'เทคก่อนหน้า' ที่พลาด เก็บเทคหลังที่สมบูรณ์\n"
        "- ตัดบรรทัดที่เป็นการหลุด พูดพลาด ออกนอกเรื่อง คำพูดค้างไม่จบความแล้วขึ้นประโยคใหม่\n"
        "- อย่าตัดเนื้อหาที่ดีอยู่แล้ว ถ้าไม่แน่ใจให้ 'เก็บไว้' (ตัดเฉพาะที่มั่นใจว่าเสีย)\n"
        "- ห้ามตัดจนใจความขาดหาย เป้าหมายคือคลิปลื่นไหลเป็นธรรมชาติ\n"
        '- ถ้าไม่มีบรรทัดไหนต้องตัดเลย ตอบ {"remove": []}'
    )
    chain = [model] + [m for m in _FALLBACK_MODELS.get(provider, []) if m != model]
    for m in chain:
        try:
            data = _llm_json(provider, api_key, m, system, user, base_url)
            out = []
            for it in data.get("remove", []):
                try:
                    idx = int(it.get("line"))
                except Exception:
                    continue
                if 0 <= idx < len(segs):
                    out.append({"start": float(segs[idx]["start"]), "end": float(segs[idx]["end"]),
                                "reason": str(it.get("reason", "flub"))})
            return out
        except Exception as e:
            print(f"   !! เอเจนต์ตัดคำพูดผิดด้วย {m} ไม่ได้ ({str(e)[:120]})", flush=True)
    return []


def strip_words_in_cuts(data, cuts, overlap=0.5):
    """เอาคำ/ประโยคที่อยู่ในช่วงที่ถูกตัด (cuts) ออกจากผลถอดเสียง เพื่อไม่ให้ขึ้นเป็นซับค้าง
    overlap: สัดส่วนของคำที่ทับกับช่วงตัดเกินเท่านี้ถือว่าถูกตัด (0.5 = เกินครึ่ง)"""
    spans = merge_spans([(c["start"], c["end"]) if isinstance(c, dict) else (c[0], c[1]) for c in cuts])
    if not spans:
        return data

    def _mid_removed(st, en):
        mid = (st + en) / 2.0
        return any(a <= mid <= b for a, b in spans)

    def _removed(st, en):
        st, en = float(st), float(en)
        dur = max(1e-6, en - st)
        ov = 0.0
        for a, b in spans:
            ov += max(0.0, min(en, b) - max(st, a))
        return ov / dur >= overlap or _mid_removed(st, en)

    nd = dict(data)
    nd["words"] = [w for w in data.get("words", []) if not _removed(w["start"], w["end"])]
    nd["segments"] = [s for s in data.get("segments", []) if not _mid_removed(s["start"], s["end"])]
    return nd


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


def _json_dump(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def _timeline_draft_content_paths(folder):
    """คืน draft_content.json ทุกตัวในโปรเจกต์ CapCut
    CapCut รุ่นใหม่มีทั้ง root draft_content.json และ Timelines/<id>/draft_content.json
    ถ้าอัปเดตแค่ root แต่ timeline ยังชี้ media เก่า จะเปิดโปรเจกต์แล้วขึ้น Media Not Found."""
    root_draft = os.path.abspath(os.path.join(folder, "draft_content.json"))
    paths = [root_draft] if os.path.exists(root_draft) else []
    timelines = os.path.join(folder, "Timelines")
    if os.path.isdir(timelines):
        for root, _, files in os.walk(timelines):
            if "draft_content.json" in files:
                p = os.path.abspath(os.path.join(root, "draft_content.json"))
                if p not in paths:
                    paths.append(p)
    return paths


def _sync_timeline_drafts(folder, draft_content):
    """เขียน draft_content ที่สร้างใหม่ทับทุก timeline content เพื่อไม่ให้ template path เก่าหลุด."""
    for p in _timeline_draft_content_paths(folder):
        _json_dump(p, draft_content)


def _draft_media_errors(folder):
    """ตรวจ media references ที่ทำให้ CapCut เปิดแล้วแดง/หาไฟล์ไม่เจอ."""
    errors = []
    stale_markers = ("Users/USER", r"Users\USER", "hero_clean.mp4")
    for p in _timeline_draft_content_paths(folder):
        rel = os.path.relpath(p, folder)
        try:
            dc = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            errors.append(f"{rel}: อ่าน JSON ไม่ได้ ({e})")
            continue
        videos = dc.get("materials", {}).get("videos", [])
        if not videos:
            errors.append(f"{rel}: ไม่มี materials.videos")
        video_ids = set()
        for i, v in enumerate(videos):
            vid = v.get("id")
            if vid:
                video_ids.add(vid)
            media_path = str(v.get("path") or "")
            label = f"{rel}: materials.videos[{i}]"
            if not media_path:
                errors.append(f"{label} path ว่าง")
                continue
            if any(m in media_path for m in stale_markers):
                errors.append(f"{label} ยังชี้ path template เก่า: {media_path}")
                continue
            if not os.path.exists(media_path):
                errors.append(f"{label} ไฟล์ไม่มีอยู่จริง: {media_path}")
        for ti, t in enumerate(dc.get("tracks", [])):
            if t.get("type") != "video":
                continue
            for si, seg in enumerate(t.get("segments", [])):
                mid = seg.get("material_id")
                if mid not in video_ids:
                    errors.append(f"{rel}: video track {ti} segment {si} material_id ไม่ตรงกับ videos: {mid}")

    meta_path = os.path.join(folder, "draft_meta_info.json")
    if os.path.exists(meta_path):
        try:
            meta = json.load(open(meta_path, encoding="utf-8"))
            for grp in meta.get("draft_materials", []):
                if grp.get("type") != 0:
                    continue
                for i, it in enumerate(grp.get("value", [])):
                    if it.get("metetype") != "video":
                        continue
                    media_path = str(it.get("file_Path") or "")
                    label = f"draft_meta_info.json: draft_materials[type=0][{i}]"
                    if not media_path:
                        errors.append(f"{label} file_Path ว่าง")
                    elif any(m in media_path for m in stale_markers):
                        errors.append(f"{label} ยังชี้ path template เก่า: {media_path}")
                    elif not os.path.exists(media_path):
                        errors.append(f"{label} ไฟล์ไม่มีอยู่จริง: {media_path}")
        except Exception as e:
            errors.append(f"draft_meta_info.json: อ่าน JSON ไม่ได้ ({e})")
    return errors


def _assert_draft_media_ok(folder):
    errors = _draft_media_errors(folder)
    if errors:
        msg = "\n".join(" - " + e for e in errors[:12])
        raise SystemExit("ตรวจ draft ไม่ผ่าน: media reference จะทำให้ CapCut ขึ้นสีแดง\n" + msg)


# ============================================================
#  ใส่เสียง / ซาวด์เอฟเฟกต์ลง CapCut draft (audio track)
#  เพลงประกอบ + วูชตรงรอยต่อ + SFX เปิดคลิป + เสียงเน้นคำสำคัญ
#  โครงสร้างอ้างอิงจากโปรเจกต์ CapCut จริง: audio material + companion 5 ตัว + audio track
# ============================================================
def _audio_companions(dc):
    """สร้าง companion materials 5 ตัวที่ audio segment ต้องอ้างอิง (speed/beats/sound_channel/vocal/placeholder)
    เพิ่มเข้า dc['materials'] แล้วคืน list ของ id ไว้ใส่ extra_material_refs"""
    m = dc["materials"]
    sp = {"id": guid(), "type": "speed", "mode": 0, "speed": 1.0, "curve_speed": None}
    bt = {"id": guid(), "type": "beats", "enable_ai_beats": False, "gear": 404, "gear_count": 0,
          "mode": 404, "user_beats": [], "user_delete_ai_beats": None,
          "ai_beats": {"melody_url": "", "melody_path": "", "beats_url": "", "beats_path": "",
                       "beats_path_new": "", "melody_percents": [], "beat_speed_infos": []}}
    scm = {"id": guid(), "type": "none", "audio_channel_mapping": 0, "is_config_open": False}
    vs = {"id": guid(), "type": "vocal_separation", "choice": 0, "removed_sounds": [],
          "time_range": None, "production_path": "", "final_algorithm": "", "enter_from": ""}
    ph = {"id": guid(), "type": "placeholder_info", "meta_type": "none", "res_path": "",
          "res_text": "", "error_path": "", "error_text": ""}
    m.setdefault("speeds", []).append(sp)
    m.setdefault("beats", []).append(bt)
    m.setdefault("sound_channel_mappings", []).append(scm)
    m.setdefault("vocal_separations", []).append(vs)
    m.setdefault("placeholder_infos", []).append(ph)
    # ลำดับตามที่ CapCut ใช้จริง: speed, placeholder, beats, sound_channel_mapping, vocal_separation
    return [sp["id"], ph["id"], bt["id"], scm["id"], vs["id"]]


def _audio_material(path, dur_us, name, kind="sound"):
    """สร้าง audio material (kind: 'sound'=SFX, 'music'=เพลงประกอบ)"""
    return {"id": guid(), "type": kind, "path": path.replace("\\", "/"), "name": name,
            "duration": int(dur_us), "unique_id": "", "wave_points": [], "music_id": "",
            "app_id": 0, "category_id": "", "category_name": "local", "check_flag": 1,
            "effect_id": "", "resource_id": "", "source_platform": 0, "local_material_id": "",
            "copyright_limit_type": "none", "music_source": "undefine", "intensifies_path": "",
            "formula_id": "", "request_id": "", "team_id": "", "video_id": "", "text_id": ""}


def _audio_segment(mat_id, refs, start_us, dur_us, src_start_us, src_dur_us, volume, render_index):
    """สร้าง audio track segment ชี้ material + companion refs"""
    return {"id": guid(),
            "material_id": mat_id, "extra_material_refs": list(refs),
            "source_timerange": {"start": int(src_start_us), "duration": int(src_dur_us)},
            "target_timerange": {"start": int(start_us), "duration": int(dur_us)},
            "render_timerange": {"start": 0, "duration": 0},
            "speed": 1.0, "volume": float(volume), "last_nonzero_volume": float(volume),
            "desc": "", "state": 0, "is_loop": False, "is_tone_modify": False, "reverse": False,
            "intensifies_audio": False, "cartoon": False, "clip": None, "uniform_scale": None,
            "render_index": int(render_index), "track_render_index": 1, "keyframe_refs": [],
            "visible": True, "group_id": "", "common_keyframes": [], "caption_info": None,
            "source": "segmentsourcenormal", "is_placeholder": False, "template_id": "",
            "template_scene": "default", "hdr_settings": None, "raw_segment_id": "",
            "responsive_layout": {"enable": False, "target_follow": "", "size_layout": 0,
                                  "horizontal_pos_layout": 0, "vertical_pos_layout": 0}}


def _audio_track(segments, render_index):
    return {"id": guid(), "type": "audio", "flag": 0, "attribute": 0, "name": "",
            "is_default_name": True, "segments": segments}


def separate_vocals(src, out_path, method="auto"):
    """เอเจนต์ตัดเสียงร้องออก เหลือแต่ดนตรี — ทำ BGM จากเพลงที่มีเนื้อร้อง (เช่นโหลดจาก YouTube)
    method:
      'auto'   = ใช้ demucs (AI คุณภาพสูง) ถ้าติดตั้งไว้ ไม่งั้น fallback ffmpeg karaoke
      'demucs' = บังคับใช้ demucs (ต้อง pip install demucs — คุณภาพดีสุด)
      'ffmpeg' = ตัดเสียงกลาง (เร็ว ไม่ต้องลงอะไร แต่หยาบกว่า)
    คืนชื่อวิธีที่ใช้จริง ('demucs'/'ffmpeg')"""
    method = (method or "auto").lower()
    if method in ("auto", "demucs"):
        try:
            import demucs.separate  # noqa: F401
            import tempfile, shutil as _sh
            tmp = tempfile.mkdtemp(prefix="demucs_")
            # --two-stems vocals -> ได้ vocals + no_vocals (ดนตรีล้วน)
            # --mp3 = เซฟผ่าน lameenc เลี่ยง torchaudio/torchcodec ที่มีปัญหาบน Windows
            r = run([sys.executable, "-m", "demucs", "-n", "htdemucs",
                     "--two-stems", "vocals", "--mp3", "--mp3-bitrate", "256",
                     "-o", tmp, src])
            base = os.path.splitext(os.path.basename(src))[0]
            nov = os.path.join(tmp, "htdemucs", base, "no_vocals.mp3")
            if os.path.exists(nov):
                run([FFMPEG, "-y", "-i", nov, "-c:a", "aac", "-b:a", "192k", out_path])
                _sh.rmtree(tmp, ignore_errors=True)
                if os.path.exists(out_path):
                    return "demucs"
            _sh.rmtree(tmp, ignore_errors=True)
            if method == "demucs":
                raise SystemExit("demucs รันไม่สำเร็จ: " + (r.stderr or "")[-400:])
        except ImportError:
            if method == "demucs":
                raise SystemExit("ยังไม่ได้ติดตั้ง demucs — ติดตั้งด้วย: pip install demucs")
    # ---- fallback: ตัดเสียงกลาง (vocals มัก pan กลาง) ด้วย ffmpeg ----
    # หลักการ: L-R หักล้างเสียงที่อยู่กลาง (เสียงร้อง) เหลือเครื่องดนตรีที่ pan ซ้าย/ขวา
    run([FFMPEG, "-y", "-i", src, "-af",
         "pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0",
         "-c:a", "aac", "-b:a", "192k", out_path])
    if not os.path.exists(out_path):
        raise SystemExit(f"แยกเสียงร้องไม่สำเร็จ: {src}")
    return "ffmpeg"


def add_sfx(dc, out_dir, total_dur_us, scene_kf, captions, sfx):
    """ใส่เสียงลง draft: sfx = dict อาจมีคีย์ bgm/whoosh/intro/ding (แต่ละอันมี path[, volume])
      - bgm   : เพลงประกอบ วางต่อกันจนเต็มคลิป เสียงเบา
      - whoosh: SFX ตรงรอยต่อฉาก (จาก scene_kf ซึ่งเป็นเวลา µs)
      - intro : SFX ตอนเปิดคลิป (t=0)
      - ding  : เสียงเน้นตอนซับคำสำคัญ (caption ที่ meta มี hl)
    คัดลอกไฟล์เสียงเข้าโฟลเดอร์โปรเจกต์ (self-contained) — กัน Media Not Found เหมือนวิดีโอ"""
    if not sfx:
        return 0
    media_dir = os.path.join(out_dir, "local_media")
    os.makedirs(media_dir, exist_ok=True)
    ri = [300]
    dur_cache = {}

    def prep(path):
        """คัดลอกไฟล์เข้าโปรเจกต์ + คืน (path_ในโปรเจกต์, duration_us)"""
        if path in dur_cache:
            return dur_cache[path]
        dst = os.path.join(media_dir, os.path.basename(path))
        if os.path.abspath(path) != os.path.abspath(dst):
            shutil.copy2(path, dst)
        _clear_readonly(dst)
        du = int(ffprobe_dur(dst) * 1_000_000)
        dur_cache[path] = (dst, du)
        return dur_cache[path]

    def one_shot(path, at_us, volume, kind="sound", max_dur_us=None):
        dst, fdur = prep(path)
        if fdur <= 0:
            return None
        dur = min(fdur, max(0, total_dur_us - at_us))
        if max_dur_us:                       # จำกัดความยาว (กัน SFX หางยาวซ้อนกัน เช่น ding 2 วิ)
            dur = min(dur, int(max_dur_us))
        if dur <= 0:
            return None
        mat = _audio_material(dst, fdur, os.path.basename(dst), kind)
        dc["materials"]["audios"].append(mat)
        ri[0] += 1
        return _audio_segment(mat["id"], _audio_companions(dc), at_us, dur, 0, dur, volume, ri[0])

    tracks_added = 0

    # ----- เพลงประกอบ (ต่อกันจนเต็มคลิป) -----
    bgm = sfx.get("bgm")
    if bgm and bgm.get("path"):
        bgm_src = bgm["path"]
        # ตัดเสียงร้องออกก่อน (ถ้าเปิด) — เหลือแต่ดนตรีทำ BGM
        if bgm.get("remove_vocals"):
            inst = os.path.join(media_dir, "bgm_instrumental.m4a")
            used = separate_vocals(bgm_src, inst, method=bgm.get("vocal_method", "auto"))
            print(f"      ตัดเสียงร้องออกจากเพลง BGM (วิธี: {used})", flush=True)
            bgm_src = inst
        dst, fdur = prep(bgm_src)
        vol = float(bgm.get("volume", 0.15))
        segs, pos = [], 0
        while pos < total_dur_us and fdur > 0:
            dur = min(fdur, total_dur_us - pos)
            mat = _audio_material(dst, fdur, os.path.basename(dst), "music")
            dc["materials"]["audios"].append(mat)
            ri[0] += 1
            segs.append(_audio_segment(mat["id"], _audio_companions(dc), pos, dur, 0, dur, vol, ri[0]))
            pos += dur
        if segs:
            dc["tracks"].append(_audio_track(segs, 0)); tracks_added += 1

    # ----- SFX วูชตรงรอยต่อ + intro (แทร็กเดียว จุดไม่ทับกัน) -----
    sfx_segs = []
    intro = sfx.get("intro")
    if intro and intro.get("path"):
        s = one_shot(intro["path"], 0, float(intro.get("volume", 0.9)))
        if s: sfx_segs.append(s)
    whoosh = sfx.get("whoosh")
    if whoosh and whoosh.get("path") and scene_kf:
        for t in scene_kf:
            s = one_shot(whoosh["path"], int(t), float(whoosh.get("volume", 0.8)))
            if s: sfx_segs.append(s)
    if sfx_segs:
        dc["tracks"].append(_audio_track(sfx_segs, 0)); tracks_added += 1

    # ----- เสียงเน้นคำสำคัญ (ding) แทร็กแยก (กันทับกับวูช) -----
    ding = sfx.get("ding")
    if ding and captions:
        # รองรับหลายเสียง (สลับวนไปเรื่อยๆ กันน่าเบื่อ) ผ่าน 'paths' หรือเสียงเดียวผ่าน 'path'
        paths = list(ding.get("paths") or ([] if not ding.get("path") else [ding["path"]]))
        if paths:
            min_gap = float(ding.get("min_gap", 3.5))            # ห่างขึ้น = ไม่ถี่/รก
            cap_us = int(float(ding.get("max_dur", 0.5)) * 1e6)  # ตัดหางเสียงไม่ให้ยาวซ้อนกัน
            ding_segs, last, idx = [], -99.0, 0
            for cap in captions:
                meta = cap[3] if len(cap) >= 4 and isinstance(cap[3], dict) else {}
                if meta.get("hl"):                   # เฉพาะแคปชันที่มีคำไฮไลท์ (คำสำคัญ)
                    if cap[0] - last < min_gap:
                        continue
                    last = cap[0]
                    pth = paths[idx % len(paths)]    # สลับเสียงวน
                    idx += 1
                    s = one_shot(pth, int(cap[0] * 1e6),
                                 float(ding.get("volume", 0.45)), max_dur_us=cap_us)
                    if s: ding_segs.append(s)
        if ding_segs:
            dc["tracks"].append(_audio_track(ding_segs, 0)); tracks_added += 1

    return tracks_added


# ---------- Hook แบบครีเอเตอร์: โลโก้ในกล่องขาว overlay มุมบน + ซูม (บนคลิปคนพูดจริง) ----------
def make_logo_box(logo_path, out_path, box=460, pad=70, radius=90):
    """ประกอบโลโก้ใส่กล่องขาวมุมมน (แบบในคลิปครีเอเตอร์) ด้วย PIL -> PNG โปร่งใสมุมกล่อง"""
    from PIL import Image, ImageDraw
    W = box
    canvas = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([0, 0, W - 1, W - 1], radius=radius, fill=(255, 255, 255, 255))
    logo = Image.open(logo_path).convert("RGBA")
    # ถ้าโลโก้พื้นขาวทึบ (ไม่โปร่ง) ให้ครอปพื้นขาวออกโดยประมาณ = วางเต็มกล่องพอดี
    inner = W - pad * 2
    lw, lh = logo.size
    s = min(inner / lw, inner / lh)
    logo = logo.resize((max(1, int(lw * s)), max(1, int(lh * s))), Image.LANCZOS)
    ox, oy = (W - logo.width) // 2, (W - logo.height) // 2
    canvas.paste(logo, (ox, oy), logo)
    canvas.save(out_path)
    return out_path


def make_text_image(text, out_path, font_path=None, size=200, stroke=16,
                    fill=(255, 255, 255, 255), stroke_fill=(0, 0, 0, 255), pad=40):
    """เรนเดอร์ข้อความใหญ่ ขาว ขอบดำหนา (แบบ hook ครีเอเตอร์) เป็น PNG โปร่งใส"""
    from PIL import Image, ImageDraw, ImageFont
    fp = font_path or "C:/Windows/Fonts/LeelaUIb.ttf"
    try:
        font = ImageFont.truetype(fp, size)
    except Exception:
        font = ImageFont.truetype("C:/Windows/Fonts/tahomabd.ttf", size)
    tmp = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    box = tmp.textbbox((0, 0), text, font=font, stroke_width=stroke)
    w, h = box[2] - box[0] + pad * 2, box[3] - box[1] + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((pad - box[0], pad - box[1]), text, font=font, fill=fill,
           stroke_width=stroke, stroke_fill=stroke_fill)
    img.save(out_path)
    return out_path


def bake_hook(video_in, video_out, logo_paths, title, dur_sec, canvas_wh, work_dir):
    """ฝังโลโก้ (กล่องขาว) + ข้อความ 'ตัดต่อ' ลงช่วงเปิดคลิป dur_sec วินาที (สไลด์เด้งเข้า) ด้วย ffmpeg
    logo_paths: list ไฟล์โลโก้ (1-2 อัน วางมุมซ้าย-ขวา) ; title: ข้อความใหญ่บนสุด (เว้นว่างได้)
    คืน path วิดีโอที่ฝังแล้ว (พิกเซลเป๊ะ)"""
    from PIL import Image
    W, H = canvas_wh
    W -= W % 2; H -= H % 2
    hookdir = os.path.join(work_dir, "_hook"); os.makedirs(hookdir, exist_ok=True)
    LOGO = int(W * 0.42)                       # โลโก้กว้าง ~42%
    layers = []                                # (path, w, h, x, y)
    if title and title.strip():
        timg = make_text_image(title.strip(), os.path.join(hookdir, "txt_top.png"), size=200, stroke=18)
        tw0, th0 = Image.open(timg).size
        TW = int(W * 0.62); TH = int(TW * th0 / tw0)
        layers.append((timg, TW, TH, (W - TW) // 2, 70))
    boxes = [make_logo_box(lp, os.path.join(hookdir, f"box{i}.png"), box=480, pad=40, radius=70)
             for i, lp in enumerate(logo_paths[:2]) if lp and os.path.exists(lp)]
    if len(boxes) == 1:
        layers.append((boxes[0], LOGO, LOGO, (W - LOGO) // 2, 250))
    elif len(boxes) >= 2:
        layers.append((boxes[0], LOGO, LOGO, 24, 250))
        layers.append((boxes[1], LOGO, LOGO, W - 24 - LOGO, 250))
    if not layers:
        return video_in

    en = f"enable=lt(t\\,{dur_sec})"
    def sy(t):  # สไลด์เด้งเข้าจากบน 0.4วิ (escape comma ทุกตัว)
        return f"if(lt(t\\,0.4)\\,{t}-280*pow(1-t/0.4\\,2)\\,{t})"
    inputs = ["-i", video_in]
    for path, *_ in layers:
        inputs += ["-i", path]
    scale_parts = [f"[{i+1}]scale={w}:{h}[s{i}]" for i, (_, w, h, _, _) in enumerate(layers)]
    over_parts, cur = [], "0"
    for i, (_, _, _, x, y) in enumerate(layers):
        out = "v" if i == len(layers) - 1 else f"t{i}"
        over_parts.append(f"[{cur}][s{i}]overlay=x={x}:y={sy(y)}:{en}[{out}]")
        cur = out
    fc = ";".join(scale_parts + over_parts)
    r = run([FFMPEG, "-y"] + inputs + ["-filter_complex", fc, "-map", "[v]", "-map", "0:a",
             "-c:v", "libx264", "-preset", ENCODE_PRESET, "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "copy", video_out])
    if not os.path.exists(video_out):
        print(f"      !! ฝัง hook ไม่สำเร็จ ใช้คลิปเดิม ({(r.stderr or '')[-200:]})", flush=True)
        return video_in
    return video_out


def _photo_material_from(base_video_mat, path, wh, dur_us=10800000000):
    """สร้าง photo material โดยยืมโครงจาก video material เดิม (กันฟิลด์ขาด) แล้วสลับเป็นรูป"""
    m = copy.deepcopy(base_video_mat)
    w, h = wh
    m.update({"id": guid(), "type": "photo", "path": path.replace("\\", "/"),
              "material_name": os.path.basename(path), "width": w, "height": h,
              "duration": int(dur_us), "has_audio": False, "category_name": "local",
              "local_material_id": str(uuid.uuid4()),
              "crop": {"upper_left_x": 0.0, "upper_left_y": 0.0, "upper_right_x": 1.0, "upper_right_y": 0.0,
                       "lower_left_x": 0.0, "lower_left_y": 1.0, "lower_right_x": 1.0, "lower_right_y": 1.0},
              "crop_scale": 1.0, "crop_ratio": "free"})
    return m


def _pop_scale_keyframes(dur_us, hold_out=False):
    """คีย์เฟรมเด้งเข้า — ค่าเป็น 'ตัวคูณ' ของ clip.scale (CapCut คูณกับ scale ฐาน)
    เล็ก 0.15 -> พุ่งเกิน 1.18 -> เด้งกลับ 1.0 (bounce) ; hold_out=หุบออกท้าย"""
    pop = min(200000, int(dur_us * 0.22))
    pts = [(0, 0.2), (pop, 1.10), (int(pop * 1.6), 0.97), (int(pop * 2.1), 1.0)]
    if hold_out:
        pts += [(max(int(pop * 2.1) + 1, dur_us - 140000), 1.0), (dur_us, 0.2)]
    else:
        pts += [(dur_us, 1.0)]

    def kf(t, v):
        return {"id": guid(), "curveType": "Line", "graphID": "",
                "left_control": {"x": 0.0, "y": 0.0}, "right_control": {"x": 0.0, "y": 0.0},
                "time_offset": int(max(0, min(dur_us, t))), "values": [float(v)]}
    kx = {"id": guid(), "keyframe_list": [kf(t, v) for t, v in pts], "material_id": "", "property_type": "KFTypeScaleX"}
    ky = {"id": guid(), "keyframe_list": [kf(t, v) for t, v in pts], "material_id": "", "property_type": "KFTypeScaleY"}
    return [kx, ky]


def add_hook_overlays(dc, out_dir, overlays, dur_us):
    """วาง overlay รูป (โลโก้ในกล่องขาว) มุมบนช่วงเปิดคลิป — แบบครีเอเตอร์ (ไม่ใช่การ์ดนิ่ง)
    overlays: list[{path, x, y, scale}] (x,y = -1..1, y+ = บน) ; แต่ละอันขึ้นแทร็ก overlay ของตัวเอง เด้งเข้า-ออก"""
    media_dir = os.path.join(out_dir, "local_media")
    os.makedirs(media_dir, exist_ok=True)
    base_seg = copy.deepcopy(next(t for t in dc["tracks"] if t["type"] == "video")["segments"][0])
    base_vid = dc["materials"]["videos"][0]
    base_refs = base_seg.get("extra_material_refs", [])

    def clone_companions():
        id2b = {}
        for bucket, items in dc["materials"].items():
            if isinstance(items, list):
                for it in items:
                    if isinstance(it, dict) and it.get("id") in base_refs:
                        id2b[it["id"]] = bucket
        refs = []
        for rid in base_refs:
            b = id2b.get(rid)
            if not b:
                continue
            src = next(x for x in dc["materials"][b] if x.get("id") == rid)
            c = copy.deepcopy(src); c["id"] = guid()
            dc["materials"][b].append(c); refs.append(c["id"])
        return refs

    n = 0
    for ov in overlays:
        dst = os.path.join(media_dir, os.path.basename(ov["path"]))
        if os.path.abspath(ov["path"]) != os.path.abspath(dst):
            shutil.copy2(ov["path"], dst)
        _clear_readonly(dst)
        w, h = ffprobe_wh(dst) if dst.lower().endswith((".mp4", ".mov")) else (ov.get("w", 460), ov.get("h", 460))
        mat = _photo_material_from(base_vid, dst, (w, h))
        dc["materials"]["videos"].append(mat)
        seg = copy.deepcopy(base_seg)
        sc = float(ov.get("scale", 0.3))
        seg.update({"id": guid(), "material_id": mat["id"], "extra_material_refs": clone_companions(),
                    "source_timerange": {"start": 0, "duration": int(dur_us)},
                    "target_timerange": {"start": 0, "duration": int(dur_us)},
                    "render_index": 15000 + n, "uniform_scale": {"on": True, "value": 1.0},
                    "common_keyframes": _pop_scale_keyframes(dur_us) if ov.get("pop") else []})
        seg["clip"] = {"scale": {"x": sc, "y": sc}, "rotation": 0.0,
                       "transform": {"x": float(ov.get("x", 0.0)), "y": float(ov.get("y", 0.5))},
                       "flip": {"vertical": False, "horizontal": False}, "alpha": 1.0}
        dc["tracks"].append({"id": guid(), "type": "video", "flag": 0, "attribute": 0,
                             "name": "", "is_default_name": True, "segments": [seg]})
        n += 1
    return n


# ---------- Hook เปิดคลิป (คลิป/ภาพ intro + ซูมเข้า-ออก + SFX) ----------
def _hook_zoom_keyframes(dur_us, peak=1.20):
    """คีย์เฟรมซูมเข้า-ออกสำหรับภาพ Hook: เริ่ม 1.0 -> ซูมเข้า peak กลางคลิป -> ออก 1.0 (ตามจังหวะ SFX)"""
    pts = [(0, 1.0), (int(dur_us * 0.45), peak), (int(dur_us * 0.8), 1.06), (dur_us, 1.0)]
    def kf(t, v):
        return {"id": guid(), "curveType": "Line", "graphID": "",
                "left_control": {"x": 0.0, "y": 0.0}, "right_control": {"x": 0.0, "y": 0.0},
                "time_offset": int(max(0, min(dur_us, t))), "values": [float(v)]}
    kx = {"id": guid(), "keyframe_list": [kf(t, v) for t, v in pts], "material_id": "", "property_type": "KFTypeScaleX"}
    ky = {"id": guid(), "keyframe_list": [kf(t, v) for t, v in pts], "material_id": "", "property_type": "KFTypeScaleY"}
    return [kx, ky]


def _prepare_hook_clip(hook_src, media_dir, dur_us, canvas_wh):
    """ทำไฟล์ hook เป็นวิดีโอสั้น พอดี canvas (รูป -> วิดีโอนิ่ง dur วินาที; วิดีโอ -> ตัด dur วินาทีแรก)"""
    w, h = canvas_wh
    w -= w % 2; h -= h % 2
    dsec = dur_us / 1_000_000
    dst = os.path.join(media_dir, "hook.mp4")
    vf = (f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30")
    ext = os.path.splitext(hook_src)[1].lower()
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
        run([FFMPEG, "-y", "-loop", "1", "-i", hook_src, "-t", f"{dsec:.3f}",
             "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-preset", ENCODE_PRESET, "-crf", ENCODE_CRF, dst])
    else:
        run([FFMPEG, "-y", "-i", hook_src, "-t", f"{dsec:.3f}", "-vf", vf, "-an",
             "-c:v", "libx264", "-pix_fmt", "yuv420p",
             "-preset", ENCODE_PRESET, "-crf", ENCODE_CRF, dst])
    if not os.path.exists(dst):
        raise SystemExit(f"ทำไฟล์ hook ไม่สำเร็จ: {hook_src}")
    return dst


def prepend_hook(dc, out_dir, hook_src, hook_dur_us, canvas_wh, open_sfx=None):
    """แทรกคลิป Hook เปิดหน้าสุด: เลื่อนทุก segment ไปข้างหลัง hook_dur, ใส่คลิป hook ที่ [0,hook_dur]
    พร้อมซูมเข้า-ออก + SFX เปิด (open_sfx = {path[,volume]}) — ทำหลัง build_draft (มี dc พร้อมแล้ว)"""
    media_dir = os.path.join(out_dir, "local_media")
    os.makedirs(media_dir, exist_ok=True)
    hook_clip = _prepare_hook_clip(hook_src, media_dir, hook_dur_us, canvas_wh)
    ensure_local_file(hook_clip)

    vtr = next(t for t in dc["tracks"] if t["type"] == "video")
    base_seg = copy.deepcopy(vtr["segments"][0])   # เก็บโครงเดิมก่อนเลื่อน
    base_vid = copy.deepcopy(dc["materials"]["videos"][0])

    # 1) เลื่อนทุก segment ที่มีอยู่ไปข้างหลัง hook_dur
    for t in dc["tracks"]:
        for s in t.get("segments", []):
            s["target_timerange"]["start"] = int(s["target_timerange"]["start"]) + hook_dur_us

    # 2) clone companion materials ของ video segment (กันใช้ id ซ้ำกับ segment เดิม)
    base_refs = base_seg.get("extra_material_refs", [])
    id2mat = {}
    for bucket, items in dc["materials"].items():
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict) and it.get("id") in base_refs:
                    id2mat[it["id"]] = bucket
    new_refs = []
    for rid in base_refs:
        bucket = id2mat.get(rid)
        if not bucket:
            continue
        src = next(x for x in dc["materials"][bucket] if x.get("id") == rid)
        c = copy.deepcopy(src); c["id"] = guid()
        dc["materials"][bucket].append(c); new_refs.append(c["id"])

    # 3) hook video material (clone โครง video เดิม แล้วสลับ path/id/ขนาด/ความยาว)
    hv = base_vid
    hv["id"] = guid(); hv["local_material_id"] = str(uuid.uuid4())
    hv["path"] = hook_clip.replace("\\", "/"); hv["material_name"] = os.path.basename(hook_clip)
    hv["duration"] = int(hook_dur_us); hv["width"], hv["height"] = canvas_wh
    hv["has_audio"] = False
    dc["materials"]["videos"].append(hv)

    # 4) hook segment (clone โครง segment เดิม + ซูมเข้า-ออก) แทรกหน้าสุด
    hs = base_seg
    hs["id"] = guid(); hs["material_id"] = hv["id"]; hs["extra_material_refs"] = new_refs
    hs["source_timerange"] = {"start": 0, "duration": int(hook_dur_us)}
    hs["target_timerange"] = {"start": 0, "duration": int(hook_dur_us)}
    hs["common_keyframes"] = _hook_zoom_keyframes(hook_dur_us)
    hs["uniform_scale"] = {"on": False, "value": 1.0}
    hs["speed"] = 1.0
    vtr["segments"].insert(0, hs)

    # 5) SFX เปิดคลิป (บนแทร็กเสียงใหม่ ที่เวลา 0)
    if open_sfx and open_sfx.get("path"):
        dst = os.path.join(media_dir, os.path.basename(open_sfx["path"]))
        if os.path.abspath(open_sfx["path"]) != os.path.abspath(dst):
            shutil.copy2(open_sfx["path"], dst)
        _clear_readonly(dst)
        fdur = int(ffprobe_dur(dst) * 1_000_000)
        if fdur > 0:
            mat = _audio_material(dst, fdur, os.path.basename(dst), "sound")
            dc["materials"]["audios"].append(mat)
            seg = _audio_segment(mat["id"], _audio_companions(dc), 0,
                                 min(fdur, hook_dur_us + 500000), 0, min(fdur, hook_dur_us + 500000),
                                 float(open_sfx.get("volume", 0.9)), 500)
            dc["tracks"].append(_audio_track([seg], 0))

    # 6) ยืดความยาวรวม
    dc["duration"] = int(dc.get("duration", 0)) + hook_dur_us
    return hook_clip


def build_draft(clip, name, captions, clip_dur_us, scene_kf, brand, sfx=None):
    """สร้าง CapCut draft (video track 1 segment + text captions + pop + zoom [+ audio/SFX])
    sfx: dict อาจมีคีย์ bgm/whoosh/intro/ding (ดู add_sfx) — ใส่เพลง+ซาวด์เอฟเฟกต์"""
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
    # คัดลอกไฟล์วิดีโอเข้าไปเก็บใน "โฟลเดอร์โปรเจกต์" เลย (self-contained) — แก้ "Media Not Found" ถาวร
    # เดิมชี้ไฟล์ที่อยู่นอกโปรเจกต์ (_capcut_work/<hash>) ซึ่งถูกลบ/ย้าย/regenerate hash ใหม่แล้วหลุดได้
    # ตอนนี้ media อยู่คู่กับ draft: ตราบใดที่โปรเจกต์ยังอยู่ ไฟล์ก็อยู่ CapCut หาเจอเสมอ
    media_dir = os.path.join(out_dir, "local_media")
    os.makedirs(media_dir, exist_ok=True)
    internal_clip = os.path.join(media_dir, os.path.basename(clip))
    shutil.copy2(clip, internal_clip)
    _clear_readonly(internal_clip)
    ensure_local_file(internal_clip)
    clip_fwd = internal_clip.replace("\\", "/")
    fp = resolve_font(brand); fs = brand["font_size"]; lc = brand["line_chars"]

    vid = dc["materials"]["videos"][0]
    new_local = str(uuid.uuid4())
    vid.update({"path": clip_fwd, "material_name": os.path.basename(clip), "duration": clip_dur_us,
                "width": clip_w, "height": clip_h, "has_audio": True, "local_material_id": new_local})
    dc["materials"]["videos"] = [vid]  # กัน template มี media เก่าค้างมากกว่าหนึ่งตัว
    video_tracks = [t for t in dc["tracks"] if t["type"] == "video"]
    vtr = video_tracks[0]
    vseg = vtr["segments"][0]
    vseg["material_id"] = vid["id"]
    vseg["source_timerange"] = {"start": 0, "duration": clip_dur_us}
    vseg["target_timerange"] = {"start": 0, "duration": clip_dur_us}
    vtr["segments"] = [vseg]
    for extra_vtr in video_tracks[1:]:
        extra_vtr["segments"] = []
    if scene_kf:
        vseg["common_keyframes"] = zoom_keyframes(scene_kf, clip_dur_us)
        vseg["uniform_scale"] = {"on": False, "value": 1.0}
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

    # ---- กันซับซ้อนกัน (สำคัญ): ยืดเวลาขั้นต่ำก่อน แล้ว clamp ไม่ให้ทับซับตัวถัดไป "ในสไตล์เดียวกัน" ----
    # เดิมยืดทุกตัวเป็น >=0.4s โดยไม่เช็คตัวถัดไป -> พูดเร็ว (ห่าง <0.4s) = ข้อความ 2 ชุดทับกันบนจอ
    # (สไตล์ต่างกัน เช่น word กับ hook อยู่คนละตำแหน่ง ตั้งใจให้ขึ้นพร้อมกันได้ จึง clamp เฉพาะสไตล์เดียวกัน)
    eff_times = []
    for cap in captions:
        _ns, _ne = float(cap[0]), float(cap[1])
        _meta = cap[3] if len(cap) >= 4 and isinstance(cap[3], dict) else {}
        _md = float(_meta.get("min_dur", 0.4))
        eff_times.append([_ns, max(_ne, _ns + _md), _meta.get("style", "normal")])
    by_style = {}
    for _i, (_ns, _ne, _st) in enumerate(eff_times):
        by_style.setdefault(_st, []).append(_i)
    for _st, _idxs in by_style.items():
        _idxs.sort(key=lambda k: eff_times[k][0])
        for _a, _b in zip(_idxs, _idxs[1:]):
            if eff_times[_a][1] > eff_times[_b][0]:
                # ตัดท้ายซับก่อนหน้าให้จบตรงที่ตัวถัดไปเริ่ม (เหลืออย่างน้อย 0.05s กัน duration ติดลบ)
                eff_times[_a][1] = max(eff_times[_b][0], eff_times[_a][0] + 0.05)

    texts, segs, anims, ri = [], [], [], 14001
    for cap_i, cap in enumerate(captions):
        ns, ne, raw = eff_times[cap_i][0], eff_times[cap_i][1], cap[2]
        cap_meta = cap[3] if len(cap) >= 4 and isinstance(cap[3], dict) else {}
        cap_style = cap_meta.get("style", "normal")
        start_us, dur_us = int(ns * 1_000_000), int(max(0.05, ne - ns) * 1_000_000)
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
            style_size = fs * brand.get("word_size_mul", 1.9)      # ใหญ่แบบครีเอเตอร์
            text_size = int(round(fs * brand.get("word_textsize_mul", 3.6)))
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
        mat["border_width"] = brand.get("border_width", 0.16)   # ขอบดำหนา (แบบครีเอเตอร์)
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

    # ---- ใส่เสียง/ซาวด์เอฟเฟกต์ (เพลงประกอบ + วูชรอยต่อ + intro + เน้นคำสำคัญ) ----
    if sfx:
        try:
            n = add_sfx(dc, out_dir, clip_dur_us, scene_kf, captions, sfx)
            if n:
                print(f"      ใส่เสียง {n} แทร็ก (เพลง/ซาวด์เอฟเฟกต์)", flush=True)
        except Exception as e:
            print(f"      !! ใส่เสียงไม่สำเร็จ (ข้าม): {str(e)[:160]}", flush=True)

    _sync_timeline_drafts(out_dir, dc)

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
    _json_dump(os.path.join(out_dir, "draft_meta_info.json"), meta)
    _assert_draft_media_ok(out_dir)
    return out_dir, os.path.basename(template), (clip_w, clip_h)
