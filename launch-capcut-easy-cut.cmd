@echo off
setlocal
for %%F in ("%~dp0*CAPCUT Easy CUT.bat") do (
  call "%%~fF"
  exit /b %errorlevel%
)
echo Could not find the CAPCUT Easy CUT launcher.
pause
exit /b 1
