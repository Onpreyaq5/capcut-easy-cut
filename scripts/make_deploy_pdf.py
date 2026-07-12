# -*- coding: utf-8 -*-
"""สร้าง PDF คู่มือขึ้นเว็บ CAPCUT Easy CUT (Supabase + Groq + Vercel) ภาษาไทย"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                 ListFlowable, ListItem, HRFlowable, KeepTogether)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

FONTS = r"C:\Users\onpre\OneDrive\เดสก์ท็อป\โปรเจคตัดอัตโนมัติ\CAPCUT AUTO SUB\tools\capcut-auto\assets\fonts"
pdfmetrics.registerFont(TTFont("Body", os.path.join(FONTS, "Sarabun.ttf")))
pdfmetrics.registerFont(TTFont("Head", os.path.join(FONTS, "Kanit.ttf")))

# สี
INK = colors.HexColor("#16151f"); SOFT = colors.HexColor("#4a4860"); MUTE = colors.HexColor("#6d6b84")
BRAND = colors.HexColor("#5b53e0"); BRANDSOFT = colors.HexColor("#edebfb")
GREEN = colors.HexColor("#1f9d63"); WARN = colors.HexColor("#c23b3b"); WARNSOFT = colors.HexColor("#fbeceb")
CODE_BG = colors.HexColor("#1c1b25"); CODE_FG = colors.HexColor("#e8e8f0"); LINE = colors.HexColor("#e4e1dc")

styles = getSampleStyleSheet()
def S(name, **kw):
    kw.setdefault("fontName", "Body")
    kw.setdefault("wordWrap", "CJK")
    return ParagraphStyle(name, **kw)

h1 = S("h1", fontName="Head", fontSize=22, textColor=INK, leading=28, spaceAfter=4)
sub = S("sub", fontSize=11, textColor=MUTE, leading=16, spaceAfter=2)
h2 = S("h2", fontName="Head", fontSize=15, textColor=BRAND, leading=20, spaceBefore=6, spaceAfter=6)
body = S("body", fontSize=10.5, textColor=SOFT, leading=17)
bodyc = S("bodyc", fontSize=10.5, textColor=SOFT, leading=17, alignment=TA_CENTER)
small = S("small", fontSize=9, textColor=MUTE, leading=13)
step = S("step", fontSize=10.5, textColor=INK, leading=17)
code = ParagraphStyle("code", fontName="Courier", fontSize=9, textColor=CODE_FG, leading=13, wordWrap=None)

def code_box(lines):
    txt = "<br/>".join(l.replace("&", "&amp;").replace("<", "&lt;") for l in lines)
    t = Table([[Paragraph(txt, code)]], colWidths=[165*mm])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), CODE_BG),
                           ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),
                           ("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8),
                           ("ROUNDEDCORNERS",[6,6,6,6])]))
    return t

def callout(text, kind="brand"):
    bg = BRANDSOFT if kind=="brand" else WARNSOFT
    bar = BRAND if kind=="brand" else WARN
    ic = "💡 " if kind=="brand" else "⚠️ "
    t = Table([[Paragraph(ic+text, S("co", fontSize=10, textColor=INK, leading=16))]], colWidths=[165*mm])
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),("LINEBEFORE",(0,0),(0,-1),3,bar),
                           ("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),
                           ("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
    return t

def steps(items):
    return ListFlowable(
        [ListItem(Paragraph(t, step), value=i+1, leftIndent=18) for i, t in enumerate(items)],
        bulletType="1", bulletFontName="Head", bulletFontSize=10.5, bulletColor=BRAND, leftIndent=8, spaceBefore=2, spaceAfter=2)

def chip(label, color=GREEN):
    return Paragraph(f'<font color="#ffffff" backColor="{color.hexval()[2:]}"> {label} </font>', small)

E = []
# ---------- ปก ----------
E.append(Spacer(1, 8))
E.append(Paragraph('<font color="#5b53e0">CAPCUT EASY CUT</font>', S("eb", fontName="Head", fontSize=11, textColor=BRAND, spaceAfter=2)))
E.append(Paragraph("คู่มือเอาเว็บขึ้นออนไลน์ (ทีละขั้น)", h1))
E.append(Paragraph("เชื่อมฐานข้อมูล Supabase + ถอดเสียง Groq + ขึ้นโฮสต์ Vercel — ทำตามได้เลยแม้ไม่เคยเขียนโค้ด", sub))
E.append(Spacer(1, 6))
E.append(HRFlowable(width="100%", color=LINE))
E.append(Spacer(1, 8))
E.append(Paragraph("ต้องเปิด 3 บัญชี (ฟรีทั้งหมด) — ทำตามลำดับ", h2))
tbl = Table([
    [Paragraph("<b>บัญชี</b>", small), Paragraph("<b>ใช้ทำอะไร</b>", small), Paragraph("<b>ค่าใช้จ่าย</b>", small)],
    [Paragraph("Supabase", body), Paragraph("เก็บสมาชิก/โควตา (ฐานข้อมูลจริง)", body), Paragraph("ฟรี", body)],
    [Paragraph("Groq", body), Paragraph("ถอดเสียงทำซับบนคลาวด์", body), Paragraph("ฟรี", body)],
    [Paragraph("Vercel", body), Paragraph("โฮสต์หน้าเว็บให้คนเข้าได้", body), Paragraph("ฟรี", body)],
    [Paragraph("โดเมน (ไม่บังคับ)", body), Paragraph("ชื่อเว็บสวย ๆ เช่น ferissub.com", body), Paragraph("~฿350/ปี", body)],
], colWidths=[42*mm, 90*mm, 33*mm])
tbl.setStyle(TableStyle([
    ("FONTNAME",(0,0),(-1,-1),"Body"),("BACKGROUND",(0,0),(-1,0),BRANDSOFT),
    ("TEXTCOLOR",(0,0),(-1,0),BRAND),("LINEBELOW",(0,0),(-1,-1),0.5,LINE),
    ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
    ("LEFTPADDING",(0,0),(-1,-1),10),("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
E.append(tbl)
E.append(Spacer(1, 8))
E.append(callout("ทำ Supabase + Groq ก่อน (หน้าเว็บ+สมาชิก+ถอดเสียงจะทำงานบนคลาวด์) ส่วนการเรนเดอร์วิดีโอต้องมี worker แยก — อธิบายในหน้าท้าย", "brand"))

# ---------- ส่วน A: Supabase ----------
E.append(Spacer(1, 12))
E.append(Paragraph("ส่วนที่ 1 — Supabase (ฐานข้อมูล)", h2))
E.append(Paragraph("ทำไมต้องมี: บน Vercel ไฟล์ในเครื่องจะหายทุกครั้งที่อัปเดตเว็บ ต้องย้ายข้อมูลสมาชิกมาไว้ฐานข้อมูลจริง", body))
E.append(Spacer(1, 4))
E.append(steps([
    'เข้า <b>supabase.com</b> กด <b>Start your project</b> แล้วสมัครด้วย GitHub หรือ Google',
    'กด <b>New project</b> → ตั้งชื่อ (เช่น capcut-easy-cut) → ตั้ง Database Password (จดไว้) → เลือก Region <b>Southeast Asia (Singapore)</b> → Create',
    'รอสร้างเสร็จ ~2 นาที',
    'เมนูซ้าย <b>SQL Editor</b> → New query → เปิดไฟล์ <b>supabase/schema.sql</b> (อยู่ในโปรเจกต์) คัดลอกทั้งหมดมาวาง → กด <b>Run</b> (ต้องขึ้น Success)',
    'เมนู <b>Project Settings → API</b> → คัดลอก 2 อย่าง: <b>Project URL</b> และ <b>service_role</b> key (อยู่ใต้ Project API keys — กด Reveal)',
]))
E.append(Spacer(1, 4))
E.append(Paragraph("นำ 2 ค่ามาวางในไฟล์ <b>.env.local</b> (อยู่ในโฟลเดอร์เว็บ):", body))
E.append(code_box(["SUPABASE_URL=https://xxxxxxxx.supabase.co",
                   "SUPABASE_SERVICE_KEY=eyJhbGciOi... (service_role key)"]))
E.append(Spacer(1, 4))
E.append(callout("service_role key คือกุญแจแอดมินของฐานข้อมูล — เก็บเป็นความลับ ห้ามส่งให้ใคร ห้ามใส่ในโค้ดฝั่งหน้าเว็บ", "warn"))

# ---------- ส่วน B: Groq ----------
E.append(Spacer(1, 12))
E.append(Paragraph("ส่วนที่ 2 — Groq (ถอดเสียงบนคลาวด์)", h2))
E.append(Paragraph("ทำไมต้องมี: การถอดเสียงเดิมใช้ Python ในเครื่อง บนคลาวด์ต้องเปลี่ยนมาใช้ Groq (เร็ว ฟรี)", body))
E.append(Spacer(1, 4))
E.append(steps([
    'เข้า <b>console.groq.com</b> สมัคร/เข้าสู่ระบบ',
    'เมนู <b>API Keys</b> → <b>Create API Key</b> → ตั้งชื่อ → คัดลอกคีย์ (ขึ้นครั้งเดียว เก็บไว้ให้ดี)',
    'วางในไฟล์ .env.local:',
]))
E.append(code_box(["GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx"]))
E.append(Paragraph("เมื่อใส่คีย์แล้ว เว็บจะถอดเสียงผ่าน Groq อัตโนมัติ (ถ้าไม่ใส่ จะใช้ Python ในเครื่องเหมือนเดิม)", small))

# ---------- ส่วน C: Vercel ----------
E.append(Spacer(1, 12))
E.append(Paragraph("ส่วนที่ 3 — ขึ้นโฮสต์ Vercel", h2))
E.append(steps([
    'เข้า <b>vercel.com</b> → Sign up ด้วย <b>GitHub</b>',
    'กด <b>Add New… → Project</b> → เลือก repo <b>capcut-easy-cut</b> → Import',
    'ก่อนกด Deploy เปิดหัวข้อ <b>Environment Variables</b> ใส่ให้ครบ:',
]))
E.append(code_box(["SUPABASE_URL          = https://xxxx.supabase.co",
                   "SUPABASE_SERVICE_KEY  = eyJhbGciOi...",
                   "GROQ_API_KEY          = gsk_xxxx",
                   "EASYCUT_SMTP_HOST     = smtp.gmail.com   (ถ้าจะส่งอีเมลจริง)",
                   "EASYCUT_SMTP_USER     = you@gmail.com",
                   "EASYCUT_SMTP_PASS     = (App Password 16 หลัก)"]))
E.append(steps([
    'กด <b>Deploy</b> → รอ ~2 นาที → ได้ลิงก์เว็บ (เช่น capcut-easy-cut.vercel.app)',
    'เปิดลิงก์ → สมัครบัญชีแรก = เจ้าของเว็บ (เข้าหลังบ้านได้)',
]))

# ---------- หมายเหตุการเรนเดอร์ ----------
E.append(Spacer(1, 10))
E.append(Paragraph("สำคัญ — เรื่องการเรนเดอร์วิดีโอ", h2))
E.append(Paragraph("บน Vercel จะทำงานได้: หน้าเว็บ, สมาชิก (Supabase), ถอดเสียง (Groq), ตัวแก้ซับ, พรีวิว, ดาวน์โหลด SRT", body))
E.append(Paragraph('แต่ปุ่ม <b>“ดาวน์โหลดวิดีโอ (ฝังซับ)”</b> ต้องใช้ ffmpeg ซึ่ง Vercel ไม่มี — ต้องแยกไปรันบน <b>worker</b> (เช่น Railway หรือ Render ที่ลง ffmpeg+Python ได้) แล้วให้เว็บเรียกไปที่ worker นั้น', body))
E.append(Spacer(1, 4))
E.append(callout("ขั้นนี้เป็นงานเฟสถัดไป — ให้เปิด Supabase+Groq+Vercel ก่อน (เว็บใช้งานได้เกือบครบ) แล้วค่อยต่อ worker เรนเดอร์ทีหลัง บอกทีมพัฒนา (เคลาด์) ให้ช่วยต่อได้", "brand"))

# ---------- เช็กลิสต์ ----------
E.append(Spacer(1, 10))
E.append(Paragraph("เช็กลิสต์", h2))
E.append(steps([
    'Supabase: รัน schema.sql สำเร็จ + คัดลอก URL/service_role key แล้ว',
    'Groq: มี GROQ_API_KEY แล้ว',
    'Vercel: import repo + ใส่ Environment Variables ครบ + Deploy สำเร็จ',
    'ทดสอบ: เปิดลิงก์เว็บ สมัคร-ยืนยันอีเมล-เข้าใช้งานได้',
]))
E.append(Spacer(1, 8))
E.append(HRFlowable(width="100%", color=LINE))
E.append(Spacer(1, 4))
E.append(Paragraph("จัดทำให้เฟริส์ · เก็บไฟล์นี้ไว้อ้างอิงตอนตั้งค่า — ถ้าติดตรงไหน ส่งภาพหน้าจอให้ทีมพัฒนาช่วยได้", small))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "CAPCUT-Deploy-Guide-TH.pdf")
doc = SimpleDocTemplate(out, pagesize=A4, topMargin=16*mm, bottomMargin=14*mm, leftMargin=18*mm, rightMargin=18*mm,
                        title="คู่มือขึ้นเว็บ CAPCUT Easy CUT")
doc.build(E)
print("สร้าง PDF แล้ว:", out, "|", os.path.getsize(out), "bytes")
