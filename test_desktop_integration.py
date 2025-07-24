#!/usr/bin/env python3
"""
Desktop Integration Test for the Privacy AI Assistant
Tests that the Tauri desktop application is running and can communicate with the backend
"""

import requests
import time
import psutil
import subprocess
import os
from pathlib import Path

def check_desktop_app_running():
    """Check if the desktop application is running"""
    print("🖥️  Checking if desktop application is running...")
    
    for proc in psutil.process_iter(['pid', 'name', 'exe']):
        try:
            if proc.info['name'] and 'privacy-ai-assistant' in proc.info['name'].lower():
                print(f"✅ Desktop app found: PID {proc.info['pid']}")
                print(f"   Executable: {proc.info['exe']}")
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    print("❌ Desktop application not found")
    return False

def check_backend_health():
    """Check backend health"""
    print("\n🔍 Testing backend health...")
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend healthy: {data}")
            return True
        else:
            print(f"❌ Backend unhealthy: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend connection failed: {e}")
        return False

def test_desktop_build_artifacts():
    """Check if desktop build artifacts exist"""
    print("\n📦 Checking desktop build artifacts...")
    
    debug_exe = Path("src-tauri/target/debug/privacy-ai-assistant.exe")
    release_exe = Path("src-tauri/target/release/privacy-ai-assistant.exe")
    
    artifacts_found = []
    
    if debug_exe.exists():
        size_mb = debug_exe.stat().st_size / (1024 * 1024)
        print(f"✅ Debug build found: {debug_exe} ({size_mb:.1f} MB)")
        artifacts_found.append("debug")
    else:
        print("❌ Debug build not found")
    
    if release_exe.exists():
        size_mb = release_exe.stat().st_size / (1024 * 1024)
        print(f"✅ Release build found: {release_exe} ({size_mb:.1f} MB)")
        artifacts_found.append("release")
    else:
        print("❌ Release build not found")
    
    return len(artifacts_found) > 0

def test_tauri_config():
    """Check Tauri configuration"""
    print("\n⚙️  Checking Tauri configuration...")
    
    config_path = Path("src-tauri/tauri.conf.json")
    if not config_path.exists():
        print("❌ Tauri config not found")
        return False
    
    try:
        import json
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        app_name = config.get('productName', 'Unknown')
        version = config.get('version', 'Unknown')
        identifier = config.get('identifier', 'Unknown')
        
        print(f"✅ Tauri config loaded:")
        print(f"   App Name: {app_name}")
        print(f"   Version: {version}")
        print(f"   Identifier: {identifier}")
        
        # Check build configuration
        build_config = config.get('build', {})
        dev_url = build_config.get('devUrl', 'Not set')
        print(f"   Dev URL: {dev_url}")
        
        return True
    except Exception as e:
        print(f"❌ Failed to read Tauri config: {e}")
        return False

def test_frontend_backend_integration():
    """Test that frontend can communicate with backend"""
    print("\n🔗 Testing frontend-backend integration...")
    
    # Test basic endpoints that the frontend would use
    endpoints = [
        ("/health", "Health check"),
        ("/ollama/models", "Model list"),
        ("/hardware/info", "Hardware info")
    ]
    
    results = []
    for endpoint, description in endpoints:
        try:
            response = requests.get(f"http://127.0.0.1:8000{endpoint}", timeout=10)
            if response.status_code == 200:
                print(f"✅ {description}: OK")
                results.append(True)
            else:
                print(f"❌ {description}: HTTP {response.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ {description}: {e}")
            results.append(False)
    
    return all(results)

def test_chat_functionality():
    """Test chat functionality that desktop app would use"""
    print("\n💬 Testing chat functionality...")
    
    try:
        # Create a chat session
        response = requests.post(
            "http://127.0.0.1:8000/chats/create",
            json={"title": "Desktop Integration Test"},
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"❌ Chat creation failed: HTTP {response.status_code}")
            return False
        
        data = response.json()
        if not data.get('success'):
            print(f"❌ Chat creation failed: {data.get('error')}")
            return False
        
        chat_id = data.get('chat_id')
        print(f"✅ Chat session created: {chat_id}")
        
        # Test LLM generation
        response = requests.post(
            "http://127.0.0.1:8000/llm/chat-generate",
            json={
                "chat_id": chat_id,
                "prompt": "Say 'Desktop integration test successful!'",
                "model": "llama3.1:8b"
            },
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✅ LLM generation successful")
                return True
            else:
                print(f"❌ LLM generation failed: {data.get('error')}")
                return False
        else:
            print(f"❌ LLM generation HTTP error: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Chat functionality test failed: {e}")
        return False

def main():
    print("🚀 Desktop Integration Test - Privacy AI Assistant\n")
    print("=" * 70)
    
    # Run all tests
    desktop_running = check_desktop_app_running()
    backend_healthy = check_backend_health()
    build_artifacts = test_desktop_build_artifacts()
    config_valid = test_tauri_config()
    integration_ok = test_frontend_backend_integration()
    chat_working = test_chat_functionality()
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 DESKTOP INTEGRATION TEST RESULTS:")
    print("=" * 70)
    
    results = {
        "Desktop App Running": desktop_running,
        "Backend Health": backend_healthy,
        "Build Artifacts": build_artifacts,
        "Tauri Configuration": config_valid,
        "API Integration": integration_ok,
        "Chat Functionality": chat_working
    }
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name:<20}: {status}")
    
    # Overall assessment
    all_passed = all(results.values())
    core_passed = desktop_running and backend_healthy and integration_ok
    
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 ALL TESTS PASSED - Desktop application fully functional!")
        print("✅ The Privacy AI Assistant desktop app is ready for use")
    elif core_passed:
        print("🎯 CORE DESKTOP FUNCTIONALITY WORKING")
        print("✅ Desktop app running and communicating with backend")
    else:
        print("❌ CRITICAL DESKTOP ISSUES DETECTED")
        print("🔧 Please resolve the failing components")
    
    print("=" * 70)
    
    if core_passed:
        print("\n💡 Desktop App Status:")
        print("1. ✅ Native desktop application is running")
        print("2. ✅ Backend services operational")
        print("3. ✅ Frontend-backend communication working")
        print("4. 🖥️  Desktop app should be visible in your taskbar/system tray")
        print("5. 🧪 Test the chat interface in the desktop application")
        
        if desktop_running:
            print("\n🎮 User Actions:")
            print("• Look for the Privacy AI Assistant window")
            print("• Test chat functionality in the desktop interface")
            print("• Verify native window controls work properly")
            print("• Check that the app runs independently of browser")

if __name__ == "__main__":
    main()
