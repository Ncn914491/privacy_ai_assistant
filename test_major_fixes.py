#!/usr/bin/env python3
"""
🔧 Test Script for Major App Fixes
Tests all the critical fixes applied to resolve LLM streaming, UI rendering, 
model usage, and tool dashboard navigation issues.
"""

import asyncio
import json
import requests
import time
import subprocess
import sys
from pathlib import Path

# Test configuration
OLLAMA_URL = "http://localhost:11434"
BACKEND_URL = "http://localhost:8000"
TEST_MODEL = "gemma2:2b"

class FixTester:
    def __init__(self):
        self.results = {
            "llm_streaming": {"status": "pending", "details": []},
            "gemini_removal": {"status": "pending", "details": []},
            "output_parsing": {"status": "pending", "details": []},
            "tool_navigation": {"status": "pending", "details": []},
            "ui_enhancements": {"status": "pending", "details": []}
        }
    
    def log(self, category, message, success=True):
        """Log test results"""
        status = "✅" if success else "❌"
        print(f"{status} [{category.upper()}] {message}")
        self.results[category]["details"].append({
            "message": message,
            "success": success,
            "timestamp": time.time()
        })
    
    async def test_ollama_connection(self):
        """Test Ollama service connection"""
        try:
            response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
            if response.status_code == 200:
                models = response.json().get("models", [])
                gemma_models = [m for m in models if "gemma" in m["name"].lower()]
                
                if gemma_models:
                    self.log("llm_streaming", f"Ollama connected, found {len(gemma_models)} Gemma models")
                    return True
                else:
                    self.log("llm_streaming", "Ollama connected but no Gemma models found", False)
                    return False
            else:
                self.log("llm_streaming", f"Ollama connection failed: {response.status_code}", False)
                return False
        except Exception as e:
            self.log("llm_streaming", f"Ollama connection error: {e}", False)
            return False
    
    async def test_llm_streaming(self):
        """Test LLM streaming functionality"""
        print("\n🔄 Testing LLM Streaming...")
        
        # Test Ollama connection first
        if not await self.test_ollama_connection():
            self.results["llm_streaming"]["status"] = "failed"
            return
        
        # Test streaming request
        try:
            payload = {
                "model": TEST_MODEL,
                "prompt": "Hello, please respond with a short greeting.",
                "stream": True
            }
            
            response = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json=payload,
                stream=True,
                timeout=30
            )
            
            if response.status_code == 200:
                chunks_received = 0
                total_content = ""
                
                for line in response.iter_lines():
                    if line:
                        try:
                            data = json.loads(line.decode('utf-8'))
                            if data.get("response"):
                                chunks_received += 1
                                total_content += data["response"]
                            
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue
                
                if chunks_received > 0 and total_content.strip():
                    self.log("llm_streaming", f"Streaming successful: {chunks_received} chunks, {len(total_content)} chars")
                    self.results["llm_streaming"]["status"] = "passed"
                else:
                    self.log("llm_streaming", "Streaming failed: no content received", False)
                    self.results["llm_streaming"]["status"] = "failed"
            else:
                self.log("llm_streaming", f"Streaming request failed: {response.status_code}", False)
                self.results["llm_streaming"]["status"] = "failed"
                
        except Exception as e:
            self.log("llm_streaming", f"Streaming test error: {e}", False)
            self.results["llm_streaming"]["status"] = "failed"
    
    def test_gemini_removal(self):
        """Test that Gemini dependencies have been removed"""
        print("\n🚫 Testing Gemini Removal...")
        
        files_to_check = [
            "src/core/agents/llmRouter.ts",
            "src/hooks/useAdaptiveStreaming.ts",
            "src-tauri/src/llm.rs"
        ]
        
        gemini_patterns = [
            "gemini",
            "generativelanguage.googleapis.com",
            "geminiApiKey",
            "GEMINI_API_KEY"
        ]
        
        issues_found = 0
        
        for file_path in files_to_check:
            if Path(file_path).exists():
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read().lower()
                    
                    for pattern in gemini_patterns:
                        if pattern.lower() in content:
                            # Check if it's in a comment or removal context
                            lines = content.split('\n')
                            for i, line in enumerate(lines):
                                if pattern.lower() in line.lower():
                                    # Allow if it's commented out or in removal context
                                    if not (line.strip().startswith('//') or 
                                           line.strip().startswith('*') or
                                           'removed' in line.lower() or
                                           'no longer' in line.lower()):
                                        issues_found += 1
                                        self.log("gemini_removal", f"Found {pattern} in {file_path}:L{i+1}", False)
                    
                    if issues_found == 0:
                        self.log("gemini_removal", f"✓ {file_path} - Gemini references removed")
                        
                except Exception as e:
                    self.log("gemini_removal", f"Error checking {file_path}: {e}", False)
                    issues_found += 1
            else:
                self.log("gemini_removal", f"File not found: {file_path}", False)
                issues_found += 1
        
        if issues_found == 0:
            self.results["gemini_removal"]["status"] = "passed"
            self.log("gemini_removal", "All Gemini dependencies successfully removed")
        else:
            self.results["gemini_removal"]["status"] = "failed"
            self.log("gemini_removal", f"Found {issues_found} Gemini references still active", False)
    
    def test_output_parsing(self):
        """Test output parsing improvements"""
        print("\n📝 Testing Output Parsing...")
        
        # Check MessageBubble improvements
        message_bubble_path = "src/components/MessageBubble.tsx"
        if Path(message_bubble_path).exists():
            try:
                with open(message_bubble_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                improvements = [
                    ("streamingText ? streamingText : message.content", "Streaming text handling"),
                    ("prose-ul:text-gray", "List styling"),
                    ("prose-ol:text-gray", "Ordered list styling"),
                    ("aria-label=\"Typing indicator\"", "Accessibility improvement"),
                    ("bg-gray-200 dark:bg-gray-700", "Code styling")
                ]
                
                found_improvements = 0
                for pattern, description in improvements:
                    if pattern in content:
                        found_improvements += 1
                        self.log("output_parsing", f"✓ {description} implemented")
                    else:
                        self.log("output_parsing", f"✗ {description} missing", False)
                
                if found_improvements >= 3:  # At least 3 out of 5 improvements
                    self.results["output_parsing"]["status"] = "passed"
                else:
                    self.results["output_parsing"]["status"] = "failed"
                    
            except Exception as e:
                self.log("output_parsing", f"Error checking MessageBubble: {e}", False)
                self.results["output_parsing"]["status"] = "failed"
        else:
            self.log("output_parsing", "MessageBubble.tsx not found", False)
            self.results["output_parsing"]["status"] = "failed"
    
    def test_tool_navigation(self):
        """Test tool navigation system"""
        print("\n🔧 Testing Tool Navigation...")
        
        # Check ToolDashboard component
        tool_dashboard_path = "src/components/ToolDashboard.tsx"
        if Path(tool_dashboard_path).exists():
            self.log("tool_navigation", "ToolDashboard component created")
            
            try:
                with open(tool_dashboard_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                features = [
                    ("interface ToolDashboardProps", "TypeScript interface"),
                    ("activeTab", "Tab navigation"),
                    ("handleAddData", "Data management"),
                    ("handleExecuteTool", "Tool execution"),
                    ("localStorage.getItem", "Data persistence")
                ]
                
                found_features = 0
                for pattern, description in features:
                    if pattern in content:
                        found_features += 1
                        self.log("tool_navigation", f"✓ {description} implemented")
                    else:
                        self.log("tool_navigation", f"✗ {description} missing", False)
                
                if found_features >= 4:
                    self.results["tool_navigation"]["status"] = "passed"
                else:
                    self.results["tool_navigation"]["status"] = "failed"
                    
            except Exception as e:
                self.log("tool_navigation", f"Error checking ToolDashboard: {e}", False)
                self.results["tool_navigation"]["status"] = "failed"
        else:
            self.log("tool_navigation", "ToolDashboard component not found", False)
            self.results["tool_navigation"]["status"] = "failed"
        
        # Check EnhancedSidebar integration
        sidebar_path = "src/components/EnhancedSidebar.tsx"
        if Path(sidebar_path).exists():
            try:
                with open(sidebar_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if "handleToolClick" in content and "selectedTool" in content:
                    self.log("tool_navigation", "✓ Sidebar tool navigation integrated")
                else:
                    self.log("tool_navigation", "✗ Sidebar integration incomplete", False)
                    
            except Exception as e:
                self.log("tool_navigation", f"Error checking sidebar: {e}", False)
    
    def test_ui_enhancements(self):
        """Test UI/UX enhancements"""
        print("\n🎨 Testing UI Enhancements...")
        
        # Check ChatInterface improvements
        chat_interface_path = "src/components/ChatInterface.tsx"
        if Path(chat_interface_path).exists():
            try:
                with open(chat_interface_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                enhancements = [
                    ("shouldShowStreaming", "Streaming state management"),
                    ("streamingText", "Streaming text display"),
                    ("isStreaming && streamingText", "Streaming condition check"),
                    ("streaming-temp", "Temporary streaming message")
                ]
                
                found_enhancements = 0
                for pattern, description in enhancements:
                    if pattern in content:
                        found_enhancements += 1
                        self.log("ui_enhancements", f"✓ {description} implemented")
                    else:
                        self.log("ui_enhancements", f"✗ {description} missing", False)
                
                if found_enhancements >= 3:
                    self.results["ui_enhancements"]["status"] = "passed"
                else:
                    self.results["ui_enhancements"]["status"] = "failed"
                    
            except Exception as e:
                self.log("ui_enhancements", f"Error checking ChatInterface: {e}", False)
                self.results["ui_enhancements"]["status"] = "failed"
        else:
            self.log("ui_enhancements", "ChatInterface.tsx not found", False)
            self.results["ui_enhancements"]["status"] = "failed"
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("🔧 MAJOR FIXES TEST SUMMARY")
        print("="*60)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results.values() if r["status"] == "passed")
        
        for category, result in self.results.items():
            status_icon = {
                "passed": "✅",
                "failed": "❌",
                "pending": "⏳"
            }.get(result["status"], "❓")
            
            print(f"{status_icon} {category.replace('_', ' ').title()}: {result['status'].upper()}")
        
        print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            print("🎉 All major fixes successfully implemented!")
        else:
            print("⚠️  Some fixes need attention. Check the details above.")
        
        return passed_tests == total_tests

async def main():
    """Run all tests"""
    print("🚀 Starting Major Fixes Test Suite...")
    print("Testing LLM streaming, Gemini removal, output parsing, tool navigation, and UI enhancements")
    
    tester = FixTester()
    
    # Run tests
    await tester.test_llm_streaming()
    tester.test_gemini_removal()
    tester.test_output_parsing()
    tester.test_tool_navigation()
    tester.test_ui_enhancements()
    
    # Print summary
    success = tester.print_summary()
    
    # Save results
    with open("test_results_major_fixes.json", "w") as f:
        json.dump(tester.results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: test_results_major_fixes.json")
    
    return 0 if success else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
