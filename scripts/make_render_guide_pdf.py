# -*- coding: utf-8 -*-
"""สร้าง PDF คู่มือ deploy CAPCUT Easy CUT บน Render (ทีละคลิก ภาษาไทย)"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                 ListFlowable, ListItem, HRFlowable)
from reportlab.lib.styles import ParagraphStyle

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "tools", "capcut-auto", "assets", "fonts")
pdfmetrics.registerFont(TTFont("Body", os.path.join(FONTS, "Sarabun.ttf")))
pdfmetrics.registerFont(TTFont("Head", os.path.join(FONTS, "Kanit.ttf")))

INK = colors.HexColor("#0e1220"); SOFT = colors.HexColor("#3f4457"); MUTE = colors.HexColor("#6b7186")
BRAND = colors.HexColor("#3b82f6"); BRANDSOFT = colors.HexColor("#e8f0ff")
GREEN = colors.HexColor("#1f9d63"); WARN = colors.HexColor("#c23b3b"); WARNSOFT = colors.HexColor("#fbeceb")
CODE_BG = colors.HexColor("#0d1019"); CODE_FG = colors.HexColor("#e8eaf2"); LINE = colors.HexColor("#e2e5ec")


def S(name, **kw):
    kw.setdefault("fontName", "Body"); kw.setdefault("wordWrap", "CJK")
    return ParagraphStyle(name, **kw)

h1 = S("h1", fontName="Head", fontSize=21, textColor=INK, leading=27, spaceAfter=3)
sub = S("sub", fontSize=11, textColor=MUTE, leading=16)
h2 = S("h2", fontName="Head", fontSize=15, textColor=BRAND, leading=20, spaceBefore=4, spaceAfter=5)
body = S("body", fontSize=10.5, textColor=SOFT, leading=17)
small = S("small", fontSize=9, textColor=MUTE, leading=13)
stp = S("stp", fontSize=10.5, textColor=INK, leading=17)
code = ParagraphStyle("code", fontName="Courier", fontSize=8.6, textColor=CODE_FG, leading=13)


def code_box(lines):
    txt = "<br/>".join(l.replace("&", "&amp;").replace("<", "&lt;") for l in lines)
    t = Table([[Paragraph(txt, code)]], colWidths=[165 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def callout(text, kind="brand"):
    bg = BRANDSOFT if kind == "brand" else WARNSOFT
    bar = BRAND if kind == "brand" else WARN
    ic = "💡 " if kind == "brand" else "⚠️ "
    t = Table([[Paragraph(ic + text, S("co", fontSize=10, textColor=INK, leading=16))]], colWidths=[165 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
                           ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                           ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    return t


def steps(items):
    return ListFlowable([ListItem(Paragraph(t, stp), value=i + 1, leftIndent=18) for i, t in enumerate(items)],
                        bulletType="1", bulletFontName="Head", bulletFontSize=10.5, bulletColor=BRAND,
                        leftIndent=8, spaceBefore=2, spaceAfter=2)


E = []
E.append(Paragraph('<font color="#3b82f6">CAPCUT EASY CUT</font>', S("eb", fontName="Head", fontSize=11, textColor=BRAND, spaceAfter=2)))
E.append(Paragraph("คู่มือเอาเว็บขึ้นออนไลน์บน Render (ทีละคลิก)", h1))
E.append(Paragraph("Docker + ffmpeg + ถอดเสียง Groq + ฐานข้อมูล Supabase — ทำตามได้เลยแม้ไม่เคยเขียนโค้ด", sub))
E.append(Spacer(1, 6)); E.append(HRFlowable(width="100%", color=LINE)); E.append(Spacer(1, 8))
E.append(callout("โค้ดพร้อม deploy แล้ว (มี Dockerfile + render.yaml ใน repo) — เหลือแค่ทำ 3 ส่วนนี้ตามลำดับ ~15 นาที", "brand"))

# Part 1 Groq
E.append(Spacer(1, 12))
E.append(Paragraph("ส่วนที่ 1 — Groq (ถอดเสียง) · ~3 นาที", h2))
E.append(Paragraph("เซิร์ฟเวอร์รัน whisper เองไม่ไหว จึงใช้ Groq ถอดเสียงบนคลาวด์ (ฟรี)", body))
E.append(steps([
    "เปิด <b>console.groq.com</b> → Sign in ด้วย Google",
    "เมนูซ้าย <b>API Keys</b> → ปุ่ม <b>Create API Key</b> → ตั้งชื่อ (เช่น capcut) → Submit",
    "<b>คัดลอกคีย์</b> (ขึ้นต้น gsk_...) เก็บไว้ — ขึ้นครั้งเดียว! เดี๋ยวเอาไปวางใน Render",
]))

# Part 2 Supabase
E.append(Spacer(1, 10))
E.append(Paragraph("ส่วนที่ 2 — Supabase (ฐานข้อมูลสมาชิก) · ~5 นาที", h2))
E.append(steps([
    "เปิด <b>supabase.com</b> → Start your project → Sign in ด้วย GitHub/Google",
    "<b>New project</b> → ตั้งชื่อ capcut → ตั้ง Database Password (จดไว้) → Region <b>Southeast Asia (Singapore)</b> → Create (รอ ~2 นาที)",
    "เมนู <b>SQL Editor</b> → New query → เปิดไฟล์ <b>supabase/schema.sql</b> ในโปรเจกต์ คัดลอกมาวาง → <b>Run</b> (ต้องขึ้น Success)",
    "เมนู <b>Project Settings → API</b> → คัดลอก <b>Project URL</b> และ <b>service_role</b> key (กด Reveal) เก็บไว้",
]))
E.append(callout("service_role key = กุญแจแอดมินฐานข้อมูล เก็บเป็นความลับ อย่าเปิดเผย", "warn"))

# Part 3 Render
E.append(Spacer(1, 10))
E.append(Paragraph("ส่วนที่ 3 — Render (โฮสต์เว็บ) · ~5 นาที + รอ build", h2))
E.append(steps([
    "เปิด <b>dashboard.render.com</b> → ปุ่ม <b>New</b> (ขวาบน) → <b>Blueprint</b>",
    "เชื่อม GitHub → เลือก repo <b>Onpreyaq5/capcut-easy-cut</b> (ถ้าไม่เห็น กด Configure GitHub ให้สิทธิ์ repo นี้) → <b>Connect</b>",
    "Render อ่าน render.yaml เอง → กด <b>Apply</b> → มันจะสร้าง service ชื่อ capcut-easy-cut + เริ่ม build (Docker ~5-10 นาที ครั้งแรก)",
    "ระหว่างรอ: เข้า service → แท็บ <b>Environment</b> → ใส่ค่าคีย์ลับ (กด Add):",
]))
E.append(code_box([
    "GROQ_API_KEY          = gsk_....... (จากส่วน 1)",
    "SUPABASE_URL          = https://xxxx.supabase.co (จากส่วน 2)",
    "SUPABASE_SERVICE_KEY  = eyJhbGciOi... (service_role)",
    "EASYCUT_PROMPTPAY_ID  = 0652387451",
    "EASYCUT_PROMPTPAY_NAME= นายณัฐฤกษ์ ขอคตสำโรง",
]))
E.append(steps([
    "กด <b>Save Changes</b> → Render จะ redeploy อัตโนมัติ",
    "เสร็จแล้วกดลิงก์ด้านบน (เช่น <b>capcut-easy-cut.onrender.com</b>) → เปิดเว็บออนไลน์จริง!",
    "สมัครบัญชีแรกในเว็บ = เจ้าของเว็บ (เข้าหลังบ้านได้)",
]))

# note plan
E.append(Spacer(1, 8))
E.append(callout("แผน Free ของ Render (512MB) อาจช้า/หน่วงตอนเรนเดอร์วิดีโอ + หลับเมื่อไม่มีคนใช้ — ถ้าจะใช้จริงจังแนะนำ Starter ($7/เดือน) ปรับได้ที่ Settings ของ service", "brand"))

E.append(Spacer(1, 10))
E.append(Paragraph("เช็กลิสต์", h2))
E.append(steps([
    "Groq: มี GROQ_API_KEY (gsk_...)",
    "Supabase: รัน schema.sql สำเร็จ + มี Project URL และ service_role key",
    "Render: Blueprint Apply + ใส่ Environment ครบ + Deploy สำเร็จ (ขึ้น Live)",
    "เปิดลิงก์เว็บ → สมัคร-ยืนยันอีเมล-ใช้งานได้",
]))
E.append(Spacer(1, 8)); E.append(HRFlowable(width="100%", color=LINE)); E.append(Spacer(1, 4))
E.append(Paragraph("ถ้าติดตรงไหน ส่งภาพหน้าจอมาให้ทีมพัฒนา (เคลาด์) ช่วยได้ทันที · หรือให้ช่วยกดผ่าน Chrome (Claude extension) แบบสด ๆ ก็ได้", small))

out = os.path.join(HERE, "..", "docs", "CAPCUT-Render-Deploy-Guide-TH.pdf")
SimpleDocTemplate(out, pagesize=A4, topMargin=15 * mm, bottomMargin=13 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
                  title="คู่มือ deploy CAPCUT Easy CUT บน Render").build(E)
print("PDF:", os.path.abspath(out), "|", os.path.getsize(out), "bytes")
