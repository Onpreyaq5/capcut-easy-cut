@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo    CAPCUT Easy CUT — สร้างโปรเจกต์ CapCut อัตโนมัติ
echo    (รวมคลิป + ตัด dead air + ซับไทย + ทรานสิชัน)
echo ============================================
echo.

set "CLIPS=%~1"
if "%CLIPS%"=="" (
  echo ลากโฟลเดอร์ที่มีคลิป Flow มาวางในหน้าต่างนี้ แล้วกด Enter
  echo ^(หรือพิมพ์ที่อยู่โฟลเดอร์^)
  set /p "CLIPS=โฟลเดอร์คลิป: "
)
set "CLIPS=!CLIPS:"=!"
if not exist "!CLIPS!\" (
  echo [X] ไม่พบโฟลเดอร์: !CLIPS!
  pause & exit /b 1
)

for %%F in ("!CLIPS!") do set "BASENAME=%%~nxF"
set "NAME=CAPCUT_!BASENAME!"

echo.
echo โฟลเดอร์ : !CLIPS!
echo โปรเจกต์ : !NAME!
echo (ถ้ามีไฟล์ script.json ในโฟลเดอร์ จะใช้บทนั้นเป็นซับ; ไม่มีก็ถอดเสียงเอง)
echo.

python "%~dp0build_capcut.py" --clips "!CLIPS!" --name "!NAME!" --brand "%~dp0brand.json"

echo.
echo --------------------------------------------
echo เสร็จแล้ว! ปิด CapCut ให้สนิท แล้วเปิดใหม่
echo เลือกโปรเจกต์  "!NAME!"  (อยู่บนสุด) ทำต่อได้เลย
echo --------------------------------------------
pause
