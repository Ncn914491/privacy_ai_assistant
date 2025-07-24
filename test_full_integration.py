#!/usr/bin/env python3
"""
Full integration test for the offline AI assistant
Tests backend, frontend accessibility, and end-to-end functionality
"""

import requests
import time
import json
from urllib.parse import urljoin

def test_backend_health():
    """Test backend health endpoint"""
    print("🔍 Testing backend health...")
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

def test_frontend_accessibility():
    """Test if frontend is accessible"""
    print("\n🌐 Testing frontend accessibility...")
    try:
        response = requests.get("http://localhost:5174", timeout=5)
        if response.status_code == 200:
            content = response.text
            if "Privacy AI Assistant" in content or "<!DOCTYPE html>" in content:
                print("✅ Frontend accessible and serving content")
                return True
            else:
                print("❌ Frontend serving unexpected content")
                return False
        else:
            print(f"❌ Frontend not accessible: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Frontend connection failed: {e}")
        return False

def test_chat_session_creation():
    """Test chat session creation"""
    print("\n💬 Testing chat session creation...")
    try:
        response = requests.post(
            "http://127.0.0.1:8000/chats/create",
            json={"title": "Integration Test Chat"},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                chat_id = data.get('chat_id')
                print(f"✅ Chat session created: {chat_id}")
                return chat_id
            else:
                print(f"❌ Chat creation failed: {data.get('error')}")
                return None
        else:
            print(f"❌ Chat creation HTTP error: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Chat creation failed: {e}")
        return None

def test_llm_generation(chat_id=None):
    """Test LLM generation"""
    print("\n🤖 Testing LLM generation...")
    try:
        if chat_id:
            # Test chat-aware generation
            response = requests.post(
                "http://127.0.0.1:8000/llm/chat-generate",
                json={
                    "chat_id": chat_id,
                    "prompt": "Hello! Please respond with exactly: 'Integration test successful!'",
                    "model": "llama3.1:8b"
                },
                timeout=60
            )
        else:
            # Test basic generation
            response = requests.post(
                "http://127.0.0.1:8000/llm/generate",
                json={
                    "prompt": "Hello! Please respond with exactly: 'Integration test successful!'",
                    "model": "llama3.1:8b"
                },
                timeout=60
            )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                llm_response = data.get('response', '').strip()
                print(f"✅ LLM generation successful")
                print(f"📝 Response: {llm_response[:100]}...")
                return True
            else:
                print(f"❌ LLM generation failed: {data.get('error')}")
                return False
        else:
            print(f"❌ LLM generation HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ LLM generation failed: {e}")
        return False

def test_hardware_detection():
    """Test hardware detection"""
    print("\n🔧 Testing hardware detection...")
    try:
        response = requests.get("http://127.0.0.1:8000/hardware/info", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                hardware = data.get('data', {}).get('hardware', {})
                runtime = data.get('data', {}).get('runtime', {})
                print(f"✅ Hardware detection working")
                print(f"   CPU Cores: {hardware.get('cpu_cores')}")
                print(f"   RAM: {hardware.get('ram_total_mb')}MB")
                print(f"   Runtime Mode: {runtime.get('mode')}")
                return True
            else:
                print(f"❌ Hardware detection failed: {data.get('error')}")
                return False
        else:
            print(f"❌ Hardware detection HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Hardware detection failed: {e}")
        return False

def test_ollama_models():
    """Test Ollama model availability"""
    print("\n🧠 Testing Ollama models...")
    try:
        response = requests.get("http://127.0.0.1:8000/ollama/models", timeout=10)
        if response.status_code == 200:
            data = response.json()
            # The endpoint returns raw Ollama response, not wrapped
            models = data.get('models', [])
            if models:
                print(f"✅ Ollama models available: {len(models)} models")
                for model in models[:3]:  # Show first 3
                    print(f"   - {model.get('name', 'Unknown')}")
                return True
            else:
                print(f"❌ No Ollama models found")
                return False
        else:
            print(f"❌ Ollama models HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Ollama models failed: {e}")
        return False

def main():
    print("🚀 Full Integration Test - Offline AI Assistant\n")
    print("=" * 60)
    
    # Test all components
    backend_ok = test_backend_health()
    frontend_ok = test_frontend_accessibility()
    models_ok = test_ollama_models()
    hardware_ok = test_hardware_detection()
    
    # Test chat functionality
    chat_id = test_chat_session_creation() if backend_ok else None
    llm_ok = test_llm_generation(chat_id) if backend_ok and models_ok else False
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 INTEGRATION TEST RESULTS:")
    print("=" * 60)
    
    results = {
        "Backend Health": backend_ok,
        "Frontend Accessibility": frontend_ok,
        "Ollama Models": models_ok,
        "Hardware Detection": hardware_ok,
        "Chat Sessions": bool(chat_id),
        "LLM Generation": llm_ok
    }
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name:<20}: {status}")
    
    # Overall assessment
    all_passed = all(results.values())
    core_passed = backend_ok and models_ok and llm_ok
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 ALL TESTS PASSED - Full integration working!")
        print("✅ The offline AI assistant is ready for use")
    elif core_passed:
        print("🎯 CORE FUNCTIONALITY WORKING")
        print("✅ Backend, LLM, and chat functionality operational")
        if not frontend_ok:
            print("⚠️  Frontend accessibility issue - check Vite server")
    else:
        print("❌ CRITICAL ISSUES DETECTED")
        print("🔧 Please resolve the failing components before proceeding")
    
    print("=" * 60)
    
    if core_passed:
        print("\n💡 Next Steps:")
        print("1. ✅ Backend is fully operational")
        print("2. ✅ LLM integration working")
        if frontend_ok:
            print("3. ✅ Frontend accessible at http://localhost:5174")
            print("4. 🚀 Try launching Tauri desktop app with: npm run tauri:dev")
        else:
            print("3. ⚠️  Check frontend server status")
        print("5. 🧪 Test chat functionality in the browser/desktop app")

if __name__ == "__main__":
    main()
