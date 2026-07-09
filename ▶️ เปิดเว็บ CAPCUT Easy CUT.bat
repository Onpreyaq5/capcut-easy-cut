@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title CAPCUT Easy CUT
cd /d "%~dp0"

echo ============================================
echo    CAPCUT Easy CUT
echo    ลากคลิป - ตัด Dead air - ซับไทยอัตโนมัติ
echo ============================================
echo.

REM ---------- 1) ตรวจ + ติดตั้งโปรแกรมที่จำเป็นให้อัตโนมัติ (Node.js, Python, ffmpeg) ----------
echo [1/4] ตรวจโปรแกรมที่จำเป็น ^(ถ้าขาดตัวไหนจะติดตั้งให้เองอัตโนมัติ^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\setup\ensure_deps.ps1"
if errorlevel 1 (
  echo.
  echo [X] ยังติดตั้งบางตัวไม่สำเร็จ - อ่านวิธีแก้ด้านบน แล้วเปิดไฟล์นี้ใหม่อีกครั้ง
  echo.
  pause
  exit /b 1
)
if exist "%LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd" call "%LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd"
echo.

REM ---------- 2) ติดตั้งไลบรารี Python ครั้งแรก ----------
python -c "import faster_whisper, pythainlp, requests" >nul 2>nul
if errorlevel 1 (
  echo [2/4] ติดตั้งไลบรารี Python ครั้งแรก ^(faster-whisper, pythainlp, requests^)...
  python -m pip install -r "tools\capcut-auto\requirements.txt"
  echo.
)

REM ---------- 3) ติดตั้งแพ็กเกจเว็บครั้งแรก ----------
if not exist "node_modules\" (
  echo [3/4] ติดตั้งแพ็กเกจเว็บครั้งแรก ^(ใช้เวลาสักครู่^)...
  call npm install
  echo.
)

REM ---------- โมเดลถอดเสียง (medium=สมดุล / small=เร็วกว่า) ----------
if not defined EASYCUT_WHISPER_MODEL set "EASYCUT_WHISPER_MODEL=medium"

echo [4/4] กำลังเปิดเว็บที่ http://localhost:3000
echo.
echo   *** เปิดหน้าต่างสีดำนี้ค้างไว้ระหว่างใช้งาน ^(ปิด = เว็บหยุด^) ***
echo   *** ครั้งแรกที่ถอดเสียงจะโหลดโมเดล ~1.5GB ครั้งเดียว รอสักครู่ ***
echo.

start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"
call npm run dev

echo.
echo เว็บหยุดทำงานแล้ว กด Enter เพื่อปิดหน้าต่าง
pause >nul
