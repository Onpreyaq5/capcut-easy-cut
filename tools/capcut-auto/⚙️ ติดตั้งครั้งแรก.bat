@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   ติดตั้งเครื่องมือ Auto-CapCut (ครั้งเดียว)
echo ============================================
echo.
echo ตรวจ Python...
python --version || ( echo [X] ไม่พบ Python — ติดตั้งจาก https://python.org ก่อน & pause & exit /b 1 )
echo.
echo ตรวจ ffmpeg...
ffmpeg -version >nul 2>&1 || echo [!] ไม่พบ ffmpeg ใน PATH — ติดตั้งด้วย: winget install Gyan.FFmpeg
echo.
echo ติดตั้งไลบรารี Python (faster-whisper, pythainlp, requests)...
python -m pip install -r "%~dp0requirements.txt"
echo.
echo เสร็จแล้ว! ต่อไปใช้ไฟล์  "🎬 สร้างซับ CapCut.bat"  ได้เลย
pause
