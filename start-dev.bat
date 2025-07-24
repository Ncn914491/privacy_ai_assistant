@echo off
echo Starting Privacy AI Assistant Development Server...
echo.

echo Killing any existing processes...
taskkill /F /IM "privacy-ai-assistant.exe" 2>nul
taskkill /F /IM "node.exe" 2>nul

echo.
echo Starting Tauri development server...
npm run tauri:dev

pause
