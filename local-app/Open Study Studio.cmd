@echo off
set "STUDY_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe"
if exist "%STUDY_PYTHON%" (
  start "" "%STUDY_PYTHON%" "%~dp0server.py" --open
  exit /b
)
where pythonw >nul 2>nul
if %errorlevel% equ 0 (
  start "" pythonw "%~dp0server.py" --open
  exit /b
)
echo Python was not found. Open this app on the computer where Codex created it.
pause
