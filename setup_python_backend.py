#!/usr/bin/env python3
"""
🔧 Setup script for Privacy AI Assistant Python Backend
Installs dependencies and verifies the setup.
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors."""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"   Command: {command}")
        print(f"   Error: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is compatible."""
    print("🐍 Checking Python version...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 8:
        print(f"✅ Python {version.major}.{version.minor}.{version.micro} is compatible")
        return True
    else:
        print(f"❌ Python {version.major}.{version.minor}.{version.micro} is too old. Need Python 3.8+")
        return False

def install_dependencies():
    """Install Python dependencies."""
    print("📦 Installing Python dependencies...")
    
    # Check if requirements.txt exists
    if not Path("requirements.txt").exists():
        print("❌ requirements.txt not found")
        return False
    
    # Install dependencies
    return run_command(
        f"{sys.executable} -m pip install -r requirements.txt",
        "Installing dependencies from requirements.txt"
    )

def check_vosk_model():
    """Check if Vosk model is available."""
    print("🎤 Checking Vosk model...")
    
    model_path = Path("vosk-model-small-en-us-0.15")
    if model_path.exists():
        print(f"✅ Vosk model found: {model_path}")
        return True
    else:
        print(f"⚠️ Vosk model not found: {model_path}")
        print("   Please download a Vosk model from: https://alphacephei.com/vosk/models")
        print("   Recommended: vosk-model-small-en-us-0.15")
        return False

def check_ollama():
    """Check if Ollama is running."""
    print("🤖 Checking Ollama service...")
    
    try:
        import requests
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [model['name'] for model in models]
            print(f"✅ Ollama is running with models: {model_names}")
            
            # Check for Gemma models
            gemma_models = [name for name in model_names if 'gemma' in name.lower()]
            if gemma_models:
                print(f"✅ Found Gemma models: {gemma_models}")
            else:
                print("⚠️ No Gemma models found. Consider running: ollama pull gemma3n:latest")
            
            return True
        else:
            print(f"❌ Ollama returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to Ollama: {e}")
        print("   Please ensure Ollama is installed and running")
        print("   Install: https://ollama.ai/")
        print("   Start: ollama serve")
        return False

def test_backend():
    """Test the Python backend server."""
    print("🧪 Testing Python backend server...")
    
    # Start the server in background for testing
    import threading
    import time
    
    def start_server():
        try:
            subprocess.run([sys.executable, "python_backend_server.py"], check=True)
        except:
            pass
    
    # Start server in background
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Wait for server to start
    time.sleep(3)
    
    # Test health endpoint
    try:
        import requests
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            health = response.json()
            print(f"✅ Backend server is healthy: {health}")
            return True
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to backend server: {e}")
        return False

def main():
    """Main setup function."""
    print("🚀 Setting up Privacy AI Assistant Python Backend")
    print("=" * 50)
    
    success = True
    
    # Check Python version
    if not check_python_version():
        success = False
    
    # Install dependencies
    if not install_dependencies():
        success = False
    
    # Check Vosk model
    if not check_vosk_model():
        print("   ⚠️ STT functionality will be limited without Vosk model")
    
    # Check Ollama
    if not check_ollama():
        print("   ⚠️ LLM functionality will not work without Ollama")
    
    # Test backend (optional)
    print("\n🧪 Testing backend server (optional)...")
    test_backend()
    
    print("\n" + "=" * 50)
    if success:
        print("✅ Setup completed successfully!")
        print("\n🚀 To start the backend server:")
        print("   python python_backend_server.py")
        print("\n🎯 The backend will be available at:")
        print("   HTTP: http://127.0.0.1:8000")
        print("   WebSocket STT: ws://127.0.0.1:8000/stt/stream")
    else:
        print("❌ Setup completed with errors")
        print("   Please fix the issues above before running the backend")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
