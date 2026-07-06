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

REM ---------- 1) ตรวจ Node.js ----------
where npm >nul 2>nul
if errorlevel 1 (
  echo [X] ยังไม่มี Node.js ในเครื่อง
  echo     โหลด Node.js LTS จาก https://nodejs.org แล้วเปิดไฟล์นี้อีกครั้ง
  echo.
  pause
  exit /b 1
)

REM ---------- 2) ตรวจ Python ----------
where python >nul 2>nul
if errorlevel 1 (
  echo [X] ยังไม่มี Python ในเครื่อง
  echo     โหลด Python จาก https://python.org ^(ติ๊ก "Add to PATH"^) แล้วเปิดไฟล์นี้อีกครั้ง
  echo.
  pause
  exit /b 1
)

REM ---------- 3) ตรวจ ffmpeg (หาอัตโนมัติถ้าไม่อยู่ใน PATH) ----------
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [!] ไม่พบ ffmpeg ใน PATH - กำลังค้นหาในเครื่อง...
  for /f "delims=" %%i in ('where /r "%LOCALAPPDATA%\Microsoft\WinGet\Packages" ffmpeg.exe 2^>nul') do (
    if not defined EASYCUT_FFMPEG (
      set "EASYCUT_FFMPEG=%%i"
      set "EASYCUT_FFPROBE=%%~dpiffprobe.exe"
    )
  )
  if defined EASYCUT_FFMPEG (
    echo     เจอแล้ว: !EASYCUT_FFMPEG!
  ) else (
    echo     [!] ยังไม่มี ffmpeg - ฟีเจอร์ตัด/ถอดเสียงจะยังไม่ทำงาน
    echo         ติดตั้งด้วยคำสั่ง:  winget install Gyan.FFmpeg
  )
  echo.
)

REM ---------- 4) ติดตั้งไลบรารี Python ครั้งแรก ----------
python -c "import faster_whisper, pythainlp, requests" >nul 2>nul
if errorlevel 1 (
  echo [1/3] ติดตั้งไลบรารี Python ครั้งแรก ^(faster-whisper, pythainlp, requests^)...
  python -m pip install -r "tools\capcut-auto\requirements.txt"
  echo.
)

REM ---------- 5) ติดตั้งแพ็กเกจเว็บครั้งแรก ----------
if not exist "node_modules\" (
  echo [2/3] ติดตั้งแพ็กเกจเว็บครั้งแรก ^(ใช้เวลาสักครู่^)...
  call npm install
  echo.
)

REM ---------- โมเดลถอดเสียง (medium=สมดุล / small=เร็วกว่า) ----------
if not defined EASYCUT_WHISPER_MODEL set "EASYCUT_WHISPER_MODEL=medium"

echo [3/3] กำลังเปิดเว็บที่ http://localhost:3000
echo.
echo   *** เปิดหน้าต่างสีดำนี้ค้างไว้ระหว่างใช้งาน ^(ปิด = เว็บหยุด^) ***
echo   *** ครั้งแรกที่ถอดเสียงจะโหลดโมเดล ~1.5GB ครั้งเดียว รอสักครู่ ***
echo.

start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"
call npm run dev

echo.
echo เว็บหยุดทำงานแล้ว กด Enter เพื่อปิดหน้าต่าง
pause >nul
