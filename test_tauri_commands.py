#!/usr/bin/env python3
"""
Test script for Tauri IPC commands via HTTP requests to backend
Since we can't directly test Tauri commands from Python, we'll test the backend endpoints
that the Tauri commands call.
"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_endpoint(method, endpoint, data=None, description=""):
    """Test a backend endpoint."""
    print(f"\n🧪 Testing: {description}")
    print(f"📡 {method} {endpoint}")
    
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
        elif method == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", json=data, timeout=10)
        elif method == "PUT":
            response = requests.put(f"{BASE_URL}{endpoint}", json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(f"{BASE_URL}{endpoint}", timeout=10)
        
        print(f"✅ Status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                result = response.json()
                print(f"📄 Response: {json.dumps(result, indent=2)[:500]}...")
                return True, result
            except:
                print(f"📄 Response: {response.text[:200]}...")
                return True, response.text
        else:
            print(f"❌ Error: {response.text}")
            return False, None
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False, None

def run_comprehensive_tests():
    """Run comprehensive tests of all backend endpoints."""
    
    print("🚀 Privacy AI Assistant - Comprehensive Backend Testing")
    print("=" * 60)
    
    test_results = []
    
    # 1. Health Check
    success, _ = test_endpoint("GET", "/health", description="Health Check")
    test_results.append(("Health Check", success))
    
    # 2. Hardware Detection
    success, hw_data = test_endpoint("GET", "/hardware/info", description="Hardware Detection")
    test_results.append(("Hardware Detection", success))
    
    success, _ = test_endpoint("GET", "/hardware/runtime-config", description="Runtime Configuration")
    test_results.append(("Runtime Config", success))
    
    # 3. Chat Session Management
    success, create_result = test_endpoint("POST", "/chats/create", 
                                         {"title": "Test Chat Session"}, 
                                         "Create Chat Session")
    test_results.append(("Create Chat", success))
    
    chat_id = None
    if success and create_result:
        chat_id = create_result.get('chat_id')
        print(f"📝 Created chat ID: {chat_id}")
    
    success, _ = test_endpoint("GET", "/chats/list", description="List Chat Sessions")
    test_results.append(("List Chats", success))
    
    if chat_id:
        success, _ = test_endpoint("GET", f"/chats/{chat_id}", description="Get Specific Chat")
        test_results.append(("Get Chat", success))
        
        success, _ = test_endpoint("POST", f"/chats/{chat_id}/messages", 
                                 {"chat_id": chat_id, "content": "Hello, test message!", "role": "user"},
                                 "Add Message to Chat")
        test_results.append(("Add Message", success))
        
        success, _ = test_endpoint("GET", f"/chats/{chat_id}/context", description="Get Chat Context")
        test_results.append(("Get Context", success))
        
        success, _ = test_endpoint("PUT", f"/chats/{chat_id}/rename", 
                                 {"chat_id": chat_id, "new_title": "Renamed Test Chat"},
                                 "Rename Chat")
        test_results.append(("Rename Chat", success))
    
    # 4. LLM Endpoints
    success, _ = test_endpoint("GET", "/llm/models", description="Get Available Models")
    test_results.append(("Get Models", success))
    
    success, _ = test_endpoint("GET", "/llm/health", description="LLM Health Check")
    test_results.append(("LLM Health", success))
    
    # 5. STT Testing
    success, _ = test_endpoint("POST", "/stt/transcribe", 
                             {"audio_data": "dGVzdA==", "filename": "test.wav"}, 
                             "STT Transcription")
    test_results.append(("STT Transcribe", success))
    
    # 6. Context-aware LLM (if chat exists)
    if chat_id:
        success, _ = test_endpoint("POST", "/llm/chat-generate", 
                                 {
                                     "chat_id": chat_id,
                                     "prompt": "What is 2+2?",
                                     "model": "gemma3n:latest",
                                     "stream": False
                                 },
                                 "Context-aware LLM Generation")
        test_results.append(("Context LLM", success))
    
    # 7. Cleanup - Delete test chat
    if chat_id:
        success, _ = test_endpoint("DELETE", f"/chats/{chat_id}", description="Delete Test Chat")
        test_results.append(("Delete Chat", success))
    
    # Print Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = 0
    total = len(test_results)
    
    for test_name, success in test_results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if success:
            passed += 1
    
    print(f"\n🎯 Results: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 All tests passed! Backend is fully functional.")
    else:
        print("⚠️ Some tests failed. Check the logs above for details.")
    
    return passed == total

if __name__ == "__main__":
    success = run_comprehensive_tests()
    exit(0 if success else 1)
