@echo off
echo 🚀 Starting Privacy AI Assistant
echo ================================

echo 📋 Checking prerequisites...

echo 🔍 Checking Ollama...
tasklist | findstr ollama >nul
if %errorlevel% neq 0 (
    echo ❌ Ollama not running. Please start Ollama first.
    pause
    exit /b 1
)
echo ✅ Ollama is running

echo 🔍 Checking Python backend...
curl -s http://127.0.0.1:8000/health >nul
if %errorlevel% neq 0 (
    echo ❌ Python backend not running. Starting it now...
    start "Python Backend" cmd /k "python python_backend_server.py"
    echo ⏳ Waiting for backend to start...
    timeout /t 5 /nobreak >nul
) else (
    echo ✅ Python backend is running
)

echo 🔍 Testing Gemma3n model...
python test_gemma_model.py
if %errorlevel% neq 0 (
    echo ❌ Gemma3n model test failed
    pause
    exit /b 1
)

echo 🏗️ Building the app...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed
    pause
    exit /b 1
)

echo 🚀 Starting Tauri app...
call npm run tauri dev

pause
