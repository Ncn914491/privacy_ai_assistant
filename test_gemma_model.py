#!/usr/bin/env python3
"""
Test script to verify Gemma3n model is working correctly
"""

import requests
import json
import time

def test_ollama_direct():
    """Test Ollama directly"""
    print("🧪 Testing Ollama directly...")
    
    try:
        payload = {
            "model": "gemma3n:latest",
            "prompt": "Respond with 'ok'",
            "stream": False
        }
        
        response = requests.post(
            "http://localhost:11434/api/generate",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Ollama direct test: SUCCESS")
            print(f"   Response: {data.get('response', 'No response')[:50]}...")
            return True
        else:
            print(f"❌ Ollama direct test: FAILED (HTTP {response.status_code})")
            return False
            
    except Exception as e:
        print(f"❌ Ollama direct test: ERROR - {e}")
        return False

def test_python_backend():
    """Test through Python backend"""
    print("🧪 Testing through Python backend...")
    
    try:
        payload = {
            "prompt": "Respond with 'ok'",
            "model": "gemma3n:latest",
            "stream": False
        }
        
        response = requests.post(
            "http://127.0.0.1:8000/llm/generate",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Python backend test: SUCCESS")
            print(f"   Response: {data.get('response', 'No response')[:50]}...")
            return True
        else:
            print(f"❌ Python backend test: FAILED (HTTP {response.status_code})")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Python backend test: ERROR - {e}")
        return False

def test_backend_health():
    """Test backend health"""
    print("🧪 Testing backend health...")
    
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend health: SUCCESS")
            print(f"   Status: {data.get('status')}")
            print(f"   Vosk initialized: {data.get('vosk_initialized')}")
            return True
        else:
            print(f"❌ Backend health: FAILED (HTTP {response.status_code})")
            return False
            
    except Exception as e:
        print(f"❌ Backend health: ERROR - {e}")
        return False

def test_ollama_models():
    """Test Ollama models list"""
    print("🧪 Testing Ollama models list...")
    
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            models = data.get('models', [])
            model_names = [model['name'] for model in models]
            print(f"✅ Ollama models: SUCCESS")
            print(f"   Available models: {model_names}")
            
            if any('gemma3n' in name for name in model_names):
                print(f"✅ Gemma3n model found in list")
                return True
            else:
                print(f"❌ Gemma3n model NOT found in list")
                return False
        else:
            print(f"❌ Ollama models: FAILED (HTTP {response.status_code})")
            return False
            
    except Exception as e:
        print(f"❌ Ollama models: ERROR - {e}")
        return False

def main():
    print("🎯 Gemma3n Model Diagnostic Test")
    print("=" * 50)
    
    tests = [
        ("Backend Health", test_backend_health),
        ("Ollama Models List", test_ollama_models),
        ("Ollama Direct", test_ollama_direct),
        ("Python Backend", test_python_backend),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🔍 Running: {test_name}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name}: CRASHED - {e}")
            results.append((test_name, False))
        
        time.sleep(1)  # Brief pause between tests
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{len(results)} tests passed")
    
    if passed == len(results):
        print("🎉 All tests passed! Gemma3n model is working correctly.")
        print("\nIf the app diagnosis still shows issues, it might be:")
        print("1. A timing issue during app startup")
        print("2. The model needs to be 'warmed up' first")
        print("3. The Tauri command timeout is too short")
        
        print("\n💡 Recommendations:")
        print("- Try running the app again")
        print("- The model should work correctly once loaded")
        print("- Consider increasing timeout in diagnostic checks")
    else:
        print("⚠️ Some tests failed. Please check the issues above.")
    
    return passed == len(results)

if __name__ == "__main__":
    main()
