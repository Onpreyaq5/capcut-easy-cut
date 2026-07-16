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

set "SETUP_DIR=%LOCALAPPDATA%\CAPCUT_Easy_CUT"
set "SETUP_MARKER=%SETUP_DIR%\setup-v3.ok"
if exist "%SETUP_DIR%\deps_env.cmd" call "%SETUP_DIR%\deps_env.cmd"
if exist "%SETUP_MARKER%" goto :ready

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
  python -m pip install --prefer-binary --disable-pip-version-check -r "tools\capcut-auto\requirements.txt"
  if errorlevel 1 (
    echo.
    echo [X] ติดตั้งไลบรารี Python ไม่สำเร็จ กรุณาลองเปิดใหม่อีกครั้ง
    pause
    exit /b 1
  )
  echo.
)

REM ---------- 3) ติดตั้งแพ็กเกจเว็บครั้งแรก ----------
set "NEED_NPM_INSTALL=0"
if not exist "node_modules\" set "NEED_NPM_INSTALL=1"
if "%NEED_NPM_INSTALL%"=="0" (
  node -e "const pkg=require('./package.json');function wanted(n){const r=(pkg.dependencies&&pkg.dependencies[n])||(pkg.devDependencies&&pkg.devDependencies[n])||'';const m=String(r).match(/\d+/);return m?m[0]:''}function got(n){try{return String(require('./node_modules/'+n+'/package.json').version).split('.')[0]}catch(e){return ''}}for(const n of ['next','eslint','eslint-config-next']){const w=wanted(n);if(w&&got(n)!==w)process.exit(1)}" >nul 2>nul
  if errorlevel 1 set "NEED_NPM_INSTALL=1"
)
if "%NEED_NPM_INSTALL%"=="1" (
  echo [3/4] ติดตั้งแพ็กเกจเว็บครั้งแรก ^(ใช้เวลาสักครู่^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo [X] ติดตั้งแพ็กเกจเว็บไม่สำเร็จ กรุณาลองเปิดใหม่อีกครั้ง
    pause
    exit /b 1
  )
  echo.
)

if not exist "%SETUP_DIR%" mkdir "%SETUP_DIR%"
>"%SETUP_MARKER%" echo ready

:ready
REM ---------- โมเดลถอดเสียง (medium=แม่นกว่า / small=เร็วกว่า) ----------
if not defined EASYCUT_WHISPER_MODEL set "EASYCUT_WHISPER_MODEL=large-v3-turbo"
if not defined EASYCUT_WHISPER_DEVICE set "EASYCUT_WHISPER_DEVICE=cpu"

REM ถ้า server เปิดอยู่แล้ว ให้เปิด browser โดยไม่สร้าง server ซ้ำ
curl.exe -fsS --max-time 2 http://localhost:3000 >nul 2>nul
if not errorlevel 1 (
  start "" http://localhost:3000
  exit /b 0
)

echo [4/4] กำลังเปิดเว็บที่ http://localhost:3000
echo.
echo   *** เปิดหน้าต่างสีดำนี้ค้างไว้ระหว่างใช้งาน ^(ปิด = เว็บหยุด^) ***
echo   *** ครั้งแรกที่ถอดเสียงจะโหลดโมเดล medium ครั้งเดียว รอสักครู่ ***
echo.

REM รอจน Next.js ตอบจริงก่อนเปิด browser (เครื่องที่ใช้ SWC/WASM อาจใช้เวลา 15-30 วินาที)
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='http://localhost:3000'; for($i=0;$i -lt 120;$i++){ try { Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2 | Out-Null; Start-Process $u; exit } catch {}; Start-Sleep -Seconds 1 }"
call npm run dev

echo.
echo เว็บหยุดทำงานแล้ว กด Enter เพื่อปิดหน้าต่าง
pause >nul
