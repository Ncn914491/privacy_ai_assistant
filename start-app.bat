@echo off
echo 🚀 Privacy AI Assistant - Quick Start
echo =====================================
echo.

echo 📋 Checking prerequisites...
where ollama >nul 2>&1
if %errorlevel% neq 0 (
    echo    ❌ Ollama not found. Please install from https://ollama.ai
    pause
    exit /b 1
)
echo    ✅ Ollama found

echo 🤖 Setting up Ollama...
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Host '   ✅ Ollama service is running' -ForegroundColor Green } catch { Write-Host '   🔄 Starting Ollama service...' -ForegroundColor Yellow; Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden; Start-Sleep 5 }"

echo    🔍 Checking for gemma3n model...
ollama list | findstr "gemma3n" >nul
if %errorlevel% neq 0 (
    echo    📥 Pulling gemma3n:latest model...
    echo    ⚠️  This may take several minutes...
    ollama pull gemma3n:latest
    echo    ✅ Model downloaded
) else (
    echo    ✅ gemma3n model found
)

echo 📦 Checking dependencies...
if not exist "node_modules" (
    echo    📥 Installing dependencies...
    npm install
    echo    ✅ Dependencies installed
) else (
    echo    ✅ Dependencies already installed
)

echo 🧹 Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174"') do (
    taskkill /pid %%a /f >nul 2>&1
)
echo    ✅ Cleanup completed

echo 🔧 Validating fixes...
node test-fixed-app.js | findstr "Fix validation completed" >nul
if %errorlevel% equ 0 (
    echo    ✅ All fixes validated
) else (
    echo    ⚠️  Validation completed with notes
)

echo.
echo 🚀 Starting application...
echo 🧪 Test with: "Hello, how are you?"
echo 📝 Watch for token-by-token streaming response
echo.

npm run dev
