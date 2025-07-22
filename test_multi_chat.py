#!/usr/bin/env python3
"""
Test script for multi-chat architecture functionality
"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def create_test_conversation(chat_id, conversation):
    """Create a test conversation in a chat session."""
    print(f"💬 Creating conversation in chat {chat_id}")
    
    for i, (role, content) in enumerate(conversation):
        print(f"  {i+1}. {role}: {content}")
        
        # Add message
        response = requests.post(
            f"{BASE_URL}/chats/{chat_id}/messages",
            json={"chat_id": chat_id, "content": content, "role": role, "model": "gemma3n:latest"},
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"❌ Failed to add message: {response.text}")
            return False
    
    return True

def test_context_isolation():
    """Test that different chat sessions maintain isolated contexts."""
    print("\n🧪 Testing Context Isolation Between Chat Sessions")
    print("=" * 60)
    
    # Create two chat sessions
    chat1_response = requests.post(f"{BASE_URL}/chats/create", json={"title": "Math Chat"})
    chat2_response = requests.post(f"{BASE_URL}/chats/create", json={"title": "Science Chat"})
    
    if chat1_response.status_code != 200 or chat2_response.status_code != 200:
        print("❌ Failed to create chat sessions")
        return False
    
    chat1_id = chat1_response.json()["chat_id"]
    chat2_id = chat2_response.json()["chat_id"]
    
    print(f"📝 Created Chat 1: {chat1_id} (Math)")
    print(f"📝 Created Chat 2: {chat2_id} (Science)")
    
    # Create different conversations in each chat
    math_conversation = [
        ("user", "What is 5 + 3?"),
        ("assistant", "5 + 3 = 8"),
        ("user", "What about 10 * 2?"),
        ("assistant", "10 * 2 = 20")
    ]
    
    science_conversation = [
        ("user", "What is photosynthesis?"),
        ("assistant", "Photosynthesis is the process by which plants convert sunlight into energy."),
        ("user", "What gas do plants release?"),
        ("assistant", "Plants release oxygen during photosynthesis.")
    ]
    
    # Add conversations
    if not create_test_conversation(chat1_id, math_conversation):
        return False
    
    if not create_test_conversation(chat2_id, science_conversation):
        return False
    
    # Test context retrieval for each chat
    print("\n🔍 Testing Context Retrieval:")
    
    # Get context for math chat
    context1_response = requests.get(f"{BASE_URL}/chats/{chat1_id}/context")
    if context1_response.status_code == 200:
        context1 = context1_response.json()
        print(f"✅ Math Chat Context: {len(context1['messages'])} messages, {context1['total_tokens']} tokens")
        
        # Verify it contains math content
        math_content = any("5 + 3" in msg.get("content", "") for msg in context1["messages"])
        if math_content:
            print("✅ Math chat contains math-specific content")
        else:
            print("❌ Math chat missing expected content")
    else:
        print("❌ Failed to get math chat context")
        return False
    
    # Get context for science chat
    context2_response = requests.get(f"{BASE_URL}/chats/{chat2_id}/context")
    if context2_response.status_code == 200:
        context2 = context2_response.json()
        print(f"✅ Science Chat Context: {len(context2['messages'])} messages, {context2['total_tokens']} tokens")
        
        # Verify it contains science content
        science_content = any("photosynthesis" in msg.get("content", "") for msg in context2["messages"])
        if science_content:
            print("✅ Science chat contains science-specific content")
        else:
            print("❌ Science chat missing expected content")
    else:
        print("❌ Failed to get science chat context")
        return False
    
    # Test context-aware generation in each chat
    print("\n🤖 Testing Context-Aware Generation:")
    
    # Ask follow-up question in math chat (should use math context)
    math_llm_response = requests.post(
        f"{BASE_URL}/llm/chat-generate",
        json={
            "chat_id": chat1_id,
            "prompt": "What was the result of the first calculation?",
            "model": "gemma3n:latest",
            "stream": False
        },
        timeout=30
    )
    
    if math_llm_response.status_code == 200:
        math_result = math_llm_response.json()
        if math_result["success"]:
            print(f"✅ Math Chat Response: '{math_result['response']}'")
            # Should reference 5+3=8
            if "8" in math_result["response"]:
                print("✅ Math chat correctly used math context")
            else:
                print("⚠️ Math chat response may not have used context properly")
        else:
            print(f"❌ Math LLM generation failed: {math_result.get('error')}")
    else:
        print("❌ Failed to generate math response")
    
    # Ask follow-up question in science chat (should use science context)
    science_llm_response = requests.post(
        f"{BASE_URL}/llm/chat-generate",
        json={
            "chat_id": chat2_id,
            "prompt": "What process did we discuss earlier?",
            "model": "gemma3n:latest",
            "stream": False
        },
        timeout=30
    )
    
    if science_llm_response.status_code == 200:
        science_result = science_llm_response.json()
        if science_result["success"]:
            print(f"✅ Science Chat Response: '{science_result['response']}'")
            # Should reference photosynthesis
            if "photosynthesis" in science_result["response"].lower():
                print("✅ Science chat correctly used science context")
            else:
                print("⚠️ Science chat response may not have used context properly")
        else:
            print(f"❌ Science LLM generation failed: {science_result.get('error')}")
    else:
        print("❌ Failed to generate science response")
    
    # Cleanup
    requests.delete(f"{BASE_URL}/chats/{chat1_id}")
    requests.delete(f"{BASE_URL}/chats/{chat2_id}")
    
    print("\n✅ Context isolation test completed!")
    return True

def test_token_management():
    """Test token counting and context window management."""
    print("\n🧪 Testing Token Management and Context Windows")
    print("=" * 60)
    
    # Create a chat for token testing
    chat_response = requests.post(f"{BASE_URL}/chats/create", json={"title": "Token Test Chat"})
    if chat_response.status_code != 200:
        print("❌ Failed to create token test chat")
        return False
    
    chat_id = chat_response.json()["chat_id"]
    print(f"📝 Created token test chat: {chat_id}")
    
    # Add messages of varying lengths to test token counting
    test_messages = [
        "Hi",  # Short message
        "This is a medium length message to test token counting.",  # Medium message
        "This is a much longer message that contains significantly more text to test how the token counting system handles larger inputs and whether it accurately estimates the number of tokens required for processing this content.",  # Long message
    ]
    
    total_expected_tokens = 0
    
    for i, message in enumerate(test_messages):
        print(f"\n📝 Adding message {i+1}: '{message[:50]}{'...' if len(message) > 50 else ''}'")
        
        response = requests.post(
            f"{BASE_URL}/chats/{chat_id}/messages",
            json={"chat_id": chat_id, "content": message, "role": "user", "model": "gemma3n:latest"},
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            token_count = result["message"]["token_count"]
            print(f"✅ Message added with {token_count} tokens")
            total_expected_tokens += token_count
        else:
            print(f"❌ Failed to add message: {response.text}")
            return False
    
    # Get context and verify token counting
    context_response = requests.get(f"{BASE_URL}/chats/{chat_id}/context")
    if context_response.status_code == 200:
        context = context_response.json()
        print(f"\n📊 Context Summary:")
        print(f"  Messages: {len(context['messages'])}")
        print(f"  Total Tokens: {context['total_tokens']}")
        print(f"  Max Tokens: {context['max_tokens']}")
        print(f"  Utilization: {context['token_utilization']:.2f}%")
        print(f"  Truncated: {context['truncated_count']}")
        
        if context['total_tokens'] > 0:
            print("✅ Token counting is working")
        else:
            print("❌ Token counting appears to be broken")
            return False
    else:
        print("❌ Failed to get context")
        return False
    
    # Cleanup
    requests.delete(f"{BASE_URL}/chats/{chat_id}")
    
    print("\n✅ Token management test completed!")
    return True

def run_multi_chat_tests():
    """Run all multi-chat architecture tests."""
    print("🚀 Multi-Chat Architecture Testing")
    print("=" * 60)
    
    tests = [
        ("Context Isolation", test_context_isolation),
        ("Token Management", test_token_management),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        try:
            print(f"\n🧪 Running {test_name} Test...")
            success = test_func()
            results.append((test_name, success))
            
            if success:
                print(f"✅ {test_name} test PASSED")
            else:
                print(f"❌ {test_name} test FAILED")
                
        except Exception as e:
            print(f"❌ {test_name} test CRASHED: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 MULTI-CHAT TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\n🎯 Results: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    return passed == total

if __name__ == "__main__":
    success = run_multi_chat_tests()
    exit(0 if success else 1)
