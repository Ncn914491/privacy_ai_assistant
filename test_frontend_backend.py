#!/usr/bin/env python3
"""
Test script to verify frontend-backend integration
"""

import requests
import json
import time
import threading
import subprocess
import sys
from pathlib import Path

def test_backend_health():
    """Test if backend is healthy"""
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend is healthy")
            return True
        else:
            print(f"❌ Backend returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend not accessible: {e}")
        return False

def test_llm_endpoint():
    """Test LLM generation endpoint"""
    try:
        data = {
            "prompt": "Hello, respond with just 'Hi there!'",
            "model": "llama3.1:8b"
        }
        response = requests.post("http://127.0.0.1:8000/llm/generate", json=data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ LLM endpoint working: {result.get('response', '')[:50]}...")
                return True
            else:
                print(f"❌ LLM endpoint failed: {result.get('error')}")
                return False
        else:
            print(f"❌ LLM endpoint returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ LLM endpoint error: {e}")
        return False

def test_chat_session_creation():
    """Test chat session creation"""
    try:
        data = {"title": "Test Chat Session"}
        response = requests.post("http://127.0.0.1:8000/chats/create", json=data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                chat_id = result.get('chat_id')
                print(f"✅ Chat session created: {chat_id}")
                return chat_id
            else:
                print(f"❌ Chat session creation failed: {result.get('error')}")
                return None
        else:
            print(f"❌ Chat session endpoint returned status {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Chat session creation error: {e}")
        return None

def test_hardware_detection():
    """Test hardware detection endpoint"""
    try:
        response = requests.get("http://127.0.0.1:8000/hardware/info", timeout=10)
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                data = result.get('data', {})
                print(f"✅ Hardware detection working: {data.get('cpu_cores', 'N/A')} cores, {data.get('ram_total_mb', 'N/A')}MB RAM")
                return True
            else:
                print(f"❌ Hardware detection failed: {result.get('error')}")
                return False
        else:
            print(f"❌ Hardware endpoint returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Hardware detection error: {e}")
        return False

def main():
    print("🚀 Testing Frontend-Backend Integration...\n")
    
    # Test backend components
    backend_healthy = test_backend_health()
    llm_working = test_llm_endpoint() if backend_healthy else False
    chat_id = test_chat_session_creation() if backend_healthy else None
    hardware_working = test_hardware_detection() if backend_healthy else False
    
    print(f"\n📊 Backend Test Results:")
    print(f"  Backend Health: {'✅' if backend_healthy else '❌'}")
    print(f"  LLM Generation: {'✅' if llm_working else '❌'}")
    print(f"  Chat Sessions: {'✅' if chat_id else '❌'}")
    print(f"  Hardware Detection: {'✅' if hardware_working else '❌'}")
    
    # Check if frontend files exist
    dist_path = Path("dist")
    index_html = dist_path / "index.html"
    assets_dir = dist_path / "assets"
    
    print(f"\n📁 Frontend Files:")
    print(f"  dist/index.html: {'✅' if index_html.exists() else '❌'}")
    print(f"  dist/assets/: {'✅' if assets_dir.exists() else '❌'}")
    
    if index_html.exists():
        with open(index_html, 'r') as f:
            content = f.read()
            has_js = 'index-' in content and '.js' in content
            has_css = 'index-' in content and '.css' in content
            print(f"  JavaScript bundle: {'✅' if has_js else '❌'}")
            print(f"  CSS bundle: {'✅' if has_css else '❌'}")
    
    # Overall assessment
    all_backend_working = backend_healthy and llm_working and chat_id and hardware_working
    frontend_built = index_html.exists() and assets_dir.exists()
    
    print(f"\n🎯 Overall Status:")
    print(f"  Backend Integration: {'✅ WORKING' if all_backend_working else '❌ ISSUES DETECTED'}")
    print(f"  Frontend Build: {'✅ WORKING' if frontend_built else '❌ ISSUES DETECTED'}")
    
    if all_backend_working and frontend_built:
        print(f"\n🎉 All systems are working! The blank screen issue is likely:")
        print(f"  1. Tauri environment detection issue")
        print(f"  2. Frontend-backend connection problem")
        print(f"  3. JavaScript runtime error in browser")
        print(f"\n💡 Next steps:")
        print(f"  - Check browser console for JavaScript errors")
        print(f"  - Verify Tauri development server is running properly")
        print(f"  - Test with 'npm run tauri:dev' command")
    else:
        print(f"\n⚠️ Issues detected that need to be resolved first")

if __name__ == "__main__":
    main()
