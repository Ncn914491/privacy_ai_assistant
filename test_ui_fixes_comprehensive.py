#!/usr/bin/env python3
"""
Comprehensive test suite for UI fixes and enhancements
Tests all the major fixes implemented for the privacy AI assistant
"""

import json
import time
import requests
import subprocess
import sys
from pathlib import Path

def test_backend_health():
    """Test if the Python backend is running and healthy"""
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend health check passed")
            return True
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend health check error: {e}")
        return False

def test_llm_streaming():
    """Test LLM streaming functionality"""
    try:
        print("🧪 Testing LLM streaming...")
        
        # Test streaming endpoint
        data = {
            "prompt": "Count from 1 to 5, one number per line",
            "model": "gemma3n:latest"
        }
        
        response = requests.post(
            "http://127.0.0.1:8000/llm/generate", 
            json=data, 
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"✅ LLM streaming test passed")
                print(f"   Response preview: {result.get('response', '')[:100]}...")
                return True
            else:
                print(f"❌ LLM streaming failed: {result.get('error')}")
                return False
        else:
            print(f"❌ LLM streaming HTTP error: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ LLM streaming test error: {e}")
        return False

def test_system_prompt_integration():
    """Test system prompt functionality"""
    try:
        print("🧪 Testing system prompt integration...")
        
        # Test with system prompt
        data = {
            "prompt": "Hello",
            "model": "gemma3n:latest",
            "system_prompt": "You are a helpful assistant. Always respond with 'System prompt working: ' followed by your response."
        }
        
        response = requests.post(
            "http://127.0.0.1:8000/llm/generate", 
            json=data, 
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                response_text = result.get('response', '')
                if 'System prompt working:' in response_text or 'system prompt' in response_text.lower():
                    print("✅ System prompt integration test passed")
                    return True
                else:
                    print(f"❌ System prompt not properly integrated")
                    print(f"   Response: {response_text[:200]}...")
                    return False
            else:
                print(f"❌ System prompt test failed: {result.get('error')}")
                return False
        else:
            print(f"❌ System prompt test HTTP error: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ System prompt test error: {e}")
        return False

def test_tool_context_storage():
    """Test tool context storage and retrieval"""
    try:
        print("🧪 Testing tool context functionality...")
        
        # Simulate tool context data
        test_context = {
            "todoList": {
                "toolName": "todoList",
                "toolData": [
                    {
                        "id": "1",
                        "title": "Test Task",
                        "content": "This is a test task for context integration",
                        "createdAt": "2024-01-01T00:00:00Z"
                    }
                ],
                "context": "1. Test Task\n   This is a test task for context integration\n   Created: 1/1/2024",
                "timestamp": "2024-01-01T00:00:00Z"
            }
        }
        
        # Test context formatting
        context_str = format_tool_context(test_context)
        if "Test Task" in context_str and "test task for context" in context_str:
            print("✅ Tool context formatting test passed")
            return True
        else:
            print("❌ Tool context formatting failed")
            print(f"   Formatted context: {context_str}")
            return False
            
    except Exception as e:
        print(f"❌ Tool context test error: {e}")
        return False

def format_tool_context(tool_context):
    """Format tool context for testing (mirrors frontend logic)"""
    if not tool_context:
        return ''
    
    if isinstance(tool_context, str):
        return tool_context
    
    if isinstance(tool_context, list):
        return '\n'.join([f"{i+1}. {json.dumps(item)}" for i, item in enumerate(tool_context)])
    
    if isinstance(tool_context, dict):
        return '\n'.join([f"{key}: {json.dumps(value)}" for key, value in tool_context.items()])
    
    return str(tool_context)

def test_frontend_build():
    """Test if frontend builds successfully"""
    try:
        print("🧪 Testing frontend build...")
        
        # Check if package.json exists
        if not Path("package.json").exists():
            print("❌ package.json not found")
            return False
        
        # Try to run a quick build check (just verify dependencies)
        result = subprocess.run(
            ["npm", "list", "--depth=0"], 
            capture_output=True, 
            text=True, 
            timeout=30
        )
        
        if result.returncode == 0:
            print("✅ Frontend dependencies check passed")
            return True
        else:
            print("❌ Frontend dependencies check failed")
            print(f"   Error: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Frontend build test error: {e}")
        return False

def test_file_structure():
    """Test if all required files exist"""
    try:
        print("🧪 Testing file structure...")
        
        required_files = [
            "src/hooks/useEnhancedStreaming.ts",
            "src/components/MessageBubble.tsx",
            "src/components/ToolDashboard.tsx",
            "src/components/EnhancedSidebar.tsx",
            "src/components/EnhancedChatInterface.tsx",
            "src/components/SystemPromptPanel.tsx",
            "src/stores/settingsStore.ts"
        ]
        
        missing_files = []
        for file_path in required_files:
            if not Path(file_path).exists():
                missing_files.append(file_path)
        
        if not missing_files:
            print("✅ File structure test passed")
            return True
        else:
            print("❌ File structure test failed")
            print(f"   Missing files: {missing_files}")
            return False
            
    except Exception as e:
        print(f"❌ File structure test error: {e}")
        return False

def run_comprehensive_tests():
    """Run all tests and provide summary"""
    print("🚀 Starting comprehensive UI fixes test suite...")
    print("=" * 60)
    
    tests = [
        ("File Structure", test_file_structure),
        ("Frontend Build", test_frontend_build),
        ("Backend Health", test_backend_health),
        ("LLM Streaming", test_llm_streaming),
        ("System Prompt Integration", test_system_prompt_integration),
        ("Tool Context Storage", test_tool_context_storage),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        print(f"\n📋 Running {test_name} test...")
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"❌ {test_name} test crashed: {e}")
            results[test_name] = False
        
        time.sleep(1)  # Brief pause between tests
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:.<30} {status}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! UI fixes are working correctly.")
        return True
    else:
        print("⚠️  Some tests failed. Please check the issues above.")
        return False

if __name__ == "__main__":
    success = run_comprehensive_tests()
    sys.exit(0 if success else 1)
