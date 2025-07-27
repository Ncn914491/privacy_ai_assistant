#!/usr/bin/env python3
"""
Simple test script to verify Ollama API is working
"""
import requests
import json

def test_ollama():
    url = "http://localhost:11434/api/generate"
    
    payload = {
        "model": "gemma3n:latest",
        "prompt": "Hello",
        "stream": False
    }
    
    try:
        print("🧪 Testing Ollama API...")
        print(f"📡 URL: {url}")
        print(f"📝 Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=30)
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Ollama API is working!")
            print(f"📄 Response: {result.get('response', 'No response field')}")
            return True
        else:
            print(f"❌ Ollama API error: {response.status_code}")
            print(f"📄 Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Connection error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    test_ollama()
