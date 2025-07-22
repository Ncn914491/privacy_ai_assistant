@echo off
cd /d "%~dp0"
echo Starting Privacy AI Assistant Python Backend...
python -m uvicorn python_backend_server:app --host 127.0.0.1 --port 8000 --reload
pause
