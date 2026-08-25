@echo off
title SNAP Research - AI Research Assistant
echo.
echo  ===============================================
echo   SNAP Research - AI Assistant
echo  ===============================================
echo   Starting server on http://localhost:5001
echo  ===============================================
echo.

:: Kill anything on port 5001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5001 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

:: Start the Flask app using the venv Python
"C:\Users\Monish Prakash\Desktop\geld-finance-assistant\.venv\Scripts\python.exe" "%~dp0app.py"

pause
