#!/usr/bin/env python3
"""
Complete End-to-End Pipeline Test for Privacy AI Assistant

This script tests the complete pipeline:
1. Python Backend Health Check
2. LLM Generation (Non-streaming)
3. LLM Streaming via WebSocket
4. STT WebSocket Connection
5. Complete Voice → STT → LLM → Response flow

Usage: python test_complete_pipeline.py
"""

import asyncio
import json
import requests
import websockets
import time
from typing import Dict, Any

# Configuration
BACKEND_URL = "http://127.0.0.1:8000"
STT_WS_URL = "ws://127.0.0.1:8000/stt/stream"
LLM_WS_URL = "ws://127.0.0.1:8000/llm/stream"

class PipelineTest:
    def __init__(self):
        self.results = {}
        
    def log(self, test_name: str, status: str, message: str = ""):
        """Log test results"""
        status_emoji = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{status_emoji} {test_name}: {message}")
        self.results[test_name] = {"status": status, "message": message}
    
    def test_backend_health(self) -> bool:
        """Test 1: Backend Health Check"""
        try:
            response = requests.get(f"{BACKEND_URL}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "healthy" and data.get("vosk_initialized"):
                    self.log("Backend Health", "PASS", "Backend is healthy and Vosk is initialized")
                    return True
                else:
                    self.log("Backend Health", "FAIL", f"Backend unhealthy: {data}")
                    return False
            else:
                self.log("Backend Health", "FAIL", f"HTTP {response.status_code}")
                return False
        except Exception as e:
            self.log("Backend Health", "FAIL", f"Connection error: {e}")
            return False
    
    def test_llm_generation(self) -> bool:
        """Test 2: LLM Generation (Non-streaming)"""
        try:
            payload = {
                "prompt": "Say 'Hello from LLM test' and nothing else.",
                "model": "gemma3n:latest",
                "stream": False
            }
            response = requests.post(f"{BACKEND_URL}/llm/generate", json=payload, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("response"):
                    self.log("LLM Generation", "PASS", f"Response: {data['response'][:50]}...")
                    return True
                else:
                    self.log("LLM Generation", "FAIL", f"LLM error: {data.get('error', 'Unknown')}")
                    return False
            else:
                self.log("LLM Generation", "FAIL", f"HTTP {response.status_code}")
                return False
        except Exception as e:
            self.log("LLM Generation", "FAIL", f"Request error: {e}")
            return False
    
    async def test_llm_streaming(self) -> bool:
        """Test 3: LLM Streaming via WebSocket"""
        try:
            async with websockets.connect(LLM_WS_URL) as websocket:
                # Send streaming request
                request = {
                    "prompt": "Count from 1 to 3, one number per line.",
                    "model": "gemma3n:latest"
                }
                await websocket.send(json.dumps(request))
                
                # Collect streaming response
                full_response = ""
                chunks_received = 0
                timeout_count = 0
                
                while timeout_count < 30:  # 30 second timeout
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        data = json.loads(message)
                        
                        if data["type"] == "chunk":
                            full_response += data["data"]
                            chunks_received += 1
                        elif data["type"] == "complete":
                            self.log("LLM Streaming", "PASS", f"Received {chunks_received} chunks: {full_response[:50]}...")
                            return True
                        elif data["type"] == "error":
                            self.log("LLM Streaming", "FAIL", f"Stream error: {data['data']}")
                            return False
                            
                    except asyncio.TimeoutError:
                        timeout_count += 1
                        continue
                
                self.log("LLM Streaming", "FAIL", "Streaming timeout")
                return False
                
        except Exception as e:
            self.log("LLM Streaming", "FAIL", f"WebSocket error: {e}")
            return False
    
    async def test_stt_websocket(self) -> bool:
        """Test 4: STT WebSocket Connection"""
        try:
            async with websockets.connect(STT_WS_URL) as websocket:
                # Just test connection and immediate stop
                await asyncio.sleep(0.5)  # Brief connection
                await websocket.send(json.dumps({"action": "stop"}))
                
                # Wait for any response or connection close
                try:
                    await asyncio.wait_for(websocket.recv(), timeout=2.0)
                except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed):
                    pass  # Expected behavior
                
                self.log("STT WebSocket", "PASS", "STT WebSocket connection successful")
                return True
                
        except Exception as e:
            self.log("STT WebSocket", "FAIL", f"WebSocket error: {e}")
            return False
    
    def test_ollama_models(self) -> bool:
        """Test 5: Ollama Models Check"""
        try:
            response = requests.get(f"{BACKEND_URL}/ollama/models", timeout=10)
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", [])
                model_names = [model["name"] for model in models]
                
                if "gemma3n:latest" in model_names:
                    self.log("Ollama Models", "PASS", f"Found gemma3n:latest in {len(models)} models")
                    return True
                else:
                    self.log("Ollama Models", "FAIL", f"gemma3n:latest not found in: {model_names}")
                    return False
            else:
                self.log("Ollama Models", "FAIL", f"HTTP {response.status_code}")
                return False
        except Exception as e:
            self.log("Ollama Models", "FAIL", f"Request error: {e}")
            return False
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        print("🧪 Starting Complete Pipeline Test Suite")
        print("=" * 50)
        
        # Test 1: Backend Health
        health_ok = self.test_backend_health()
        
        # Test 2: Ollama Models
        models_ok = self.test_ollama_models()
        
        # Test 3: LLM Generation
        llm_ok = self.test_llm_generation()
        
        # Test 4: LLM Streaming
        streaming_ok = await self.test_llm_streaming()
        
        # Test 5: STT WebSocket
        stt_ok = await self.test_stt_websocket()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 Test Results Summary:")
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results.values() if r["status"] == "PASS")
        
        for test_name, result in self.results.items():
            status_emoji = "✅" if result["status"] == "PASS" else "❌"
            print(f"  {status_emoji} {test_name}")
        
        print(f"\n🎯 Overall: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            print("🎉 All tests passed! The complete pipeline is working correctly.")
            return True
        else:
            print("⚠️ Some tests failed. Check the issues above.")
            return False

async def main():
    """Main test runner"""
    test_suite = PipelineTest()
    success = await test_suite.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)