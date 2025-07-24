#!/usr/bin/env python3
"""
Simple test script to verify backend functionality
"""

import requests
import json
import time

def test_ollama_connection():
    """Test direct Ollama connection"""
    print("🔍 Testing Ollama connection...")
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            print(f"✅ Ollama connected. Found {len(models)} models:")
            for model in models:
                print(f"  - {model['name']}")
            return True
        else:
            print(f"❌ Ollama API returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Failed to connect to Ollama: {e}")
        return False

def test_llm_generation():
    """Test LLM generation"""
    print("\n🤖 Testing LLM generation...")
    try:
        data = {
            "model": "llama3.1:8b",
            "prompt": "Say hello in one sentence.",
            "stream": False
        }
        response = requests.post("http://localhost:11434/api/generate", json=data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            llm_response = result.get('response', '').strip()
            print(f"✅ LLM response: {llm_response}")
            return True
        else:
            print(f"❌ LLM API returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ LLM generation failed: {e}")
        return False

def test_backend_server():
    """Test if backend server is running"""
    print("\n🌐 Testing backend server...")
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            health_data = response.json()
            print(f"✅ Backend server is healthy: {health_data}")
            return True
        else:
            print(f"❌ Backend server returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend server not accessible: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting backend integration tests...\n")
    
    # Test Ollama
    ollama_ok = test_ollama_connection()
    
    # Test LLM generation
    llm_ok = test_llm_generation() if ollama_ok else False
    
    # Test backend server
    backend_ok = test_backend_server()
    
    print(f"\n📊 Test Results:")
    print(f"  Ollama Connection: {'✅' if ollama_ok else '❌'}")
    print(f"  LLM Generation: {'✅' if llm_ok else '❌'}")
    print(f"  Backend Server: {'✅' if backend_ok else '❌'}")
    
    if ollama_ok and llm_ok:
        print("\n🎉 Core LLM functionality is working!")
    else:
        print("\n⚠️ Some issues detected with LLM functionality")
