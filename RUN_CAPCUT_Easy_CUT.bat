@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title CAPCUT Easy CUT

set "APP_ROOT=%~dp0"
set "WEB_DIR=%APP_ROOT%web"

if not exist "%WEB_DIR%\package.json" if exist "%APP_ROOT%package.json" set "WEB_DIR=%APP_ROOT%"

if not exist "%WEB_DIR%\package.json" (
  echo [X] ไม่พบโฟลเดอร์ web หรือไฟล์ package.json
  echo กรุณาแตกไฟล์ ZIP ให้ครบก่อนเปิดใช้งาน
  echo.
  pause
  exit /b 1
)

cd /d "%WEB_DIR%"

echo ============================================
echo    CAPCUT Easy CUT
echo    ลากคลิป - ตัด Dead air - ซับไทยอัตโนมัติ
echo ============================================
echo.

echo [1/4] ตรวจโปรแกรมที่จำเป็น ^(ถ้าขาดจะติดตั้งให้อัตโนมัติ^)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%WEB_DIR%\tools\setup\ensure_deps.ps1"
if errorlevel 1 (
  echo.
  echo [X] ยังติดตั้งบางตัวไม่สำเร็จ - อ่านข้อความด้านบน แล้วเปิดไฟล์นี้ใหม่อีกครั้ง
  echo.
  pause
  exit /b 1
)
if exist "%LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd" call "%LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd"
echo.

python -c "import faster_whisper, pythainlp, requests" >nul 2>nul
if errorlevel 1 (
  echo [2/4] ติดตั้งไลบรารี Python ครั้งแรก ^(ใช้เวลาสักครู่^)...
  python -m pip install -r "%WEB_DIR%\tools\capcut-auto\requirements.txt"
  echo.
)

if not exist "%WEB_DIR%\node_modules\" (
  echo [3/4] ติดตั้งแพ็กเกจเว็บครั้งแรก ^(ใช้เวลาสักครู่^)...
  call npm install
  echo.
) else (
  echo [3/4] พบแพ็กเกจเว็บแล้ว
)

if not defined EASYCUT_WHISPER_MODEL set "EASYCUT_WHISPER_MODEL=medium"

echo [4/4] เปิดเว็บที่ http://localhost:3000
echo.
echo   เปิดหน้าต่างนี้ค้างไว้ระหว่างใช้งาน
echo   ปิดหน้าต่างนี้ = เว็บหยุดทำงาน
echo   ครั้งแรกที่ถอดเสียงจะดาวน์โหลดโมเดลประมาณ 1.5GB ครั้งเดียว
echo.

start "" cmd /c "timeout /t 5 >nul & start http://localhost:3000"
call npm run dev

echo.
echo เว็บหยุดทำงานแล้ว กด Enter เพื่อปิดหน้าต่าง
pause >nul
