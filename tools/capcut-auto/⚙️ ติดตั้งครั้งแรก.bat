@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   ติดตั้งเครื่องมือ CAPCUT Easy CUT (ครั้งเดียว)
echo ============================================
echo.
echo ตรวจ + ติดตั้งโปรแกรมที่จำเป็น ^(Python, ffmpeg^) ให้อัตโนมัติ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\setup\ensure_deps.ps1" -SkipNode
if errorlevel 1 (
  echo.
  echo [X] ยังติดตั้งบางตัวไม่สำเร็จ - อ่านวิธีแก้ด้านบน แล้วเปิดไฟล์นี้ใหม่อีกครั้ง
  pause
  exit /b 1
)
if exist "%LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd" call "%LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd"
echo.
echo ติดตั้งไลบรารี Python (faster-whisper, pythainlp, requests)...
python -m pip install -r "%~dp0requirements.txt"
echo.
echo เสร็จแล้ว! ต่อไปใช้ไฟล์  "🎬 สร้างซับ CapCut.bat"  หรือเปิดเว็บได้เลย
pause
