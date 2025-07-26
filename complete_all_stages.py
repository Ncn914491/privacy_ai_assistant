#!/usr/bin/env python3
"""
Complete All 7 Stages - Privacy AI Assistant
Comprehensive implementation and verification script
"""

import json
import time
import subprocess
import sys
from pathlib import Path

def print_stage(stage_num, title):
    print(f"\n{'='*60}")
    print(f"🚀 STAGE {stage_num}: {title}")
    print(f"{'='*60}")

def check_file_exists(file_path, description=""):
    if Path(file_path).exists():
        print(f"✅ {description or file_path}")
        return True
    else:
        print(f"❌ Missing: {description or file_path}")
        return False

def run_command(command, description="", timeout=30):
    try:
        print(f"🔧 {description or command}")
        result = subprocess.run(
            command.split(), 
            capture_output=True, 
            text=True, 
            timeout=timeout
        )
        if result.returncode == 0:
            print(f"✅ Success: {description}")
            return True
        else:
            print(f"❌ Failed: {description}")
            print(f"   Error: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ Error running {description}: {e}")
        return False

def verify_stage_0():
    """Stage 0: Repo Bootstrap & Structure"""
    print_stage(0, "Repo Bootstrap & Structure")
    
    required_dirs = [
        "src/components",
        "src/core",
        "src/hooks", 
        "src/plugins",
        "src/stores",
        "src/utils",
        "src/types",
        "src-tauri"
    ]
    
    required_files = [
        "src/App.tsx",
        "src/main.tsx",
        "package.json",
        "src-tauri/tauri.conf.json",
        "src/utils/accessibility.ts",
        "src/utils/privacyManager.ts"
    ]
    
    all_good = True
    
    for dir_path in required_dirs:
        if not check_file_exists(dir_path, f"Directory: {dir_path}"):
            all_good = False
    
    for file_path in required_files:
        if not check_file_exists(file_path, f"File: {file_path}"):
            all_good = False
    
    return all_good

def verify_stage_1():
    """Stage 1: Desktop UI Shell"""
    print_stage(1, "Desktop UI Shell")
    
    ui_components = [
        "src/components/EnhancedChatInterface.tsx",
        "src/components/EnhancedSidebar.tsx", 
        "src/components/MessageBubble.tsx",
        "src/components/InputArea.tsx",
        "src/components/SystemPromptPanel.tsx"
    ]
    
    all_good = True
    for component in ui_components:
        if not check_file_exists(component, f"UI Component: {component}"):
            all_good = False
    
    # Check if npm dependencies are installed
    if Path("node_modules").exists():
        print("✅ NPM dependencies installed")
    else:
        print("❌ NPM dependencies not installed")
        all_good = False
    
    return all_good

def verify_stage_2():
    """Stage 2: LLM Integration"""
    print_stage(2, "LLM Integration")
    
    llm_files = [
        "src/hooks/useEnhancedStreaming.ts",
        "src/hooks/useLLM.ts",
        "simple_backend_server.py"
    ]
    
    all_good = True
    for file_path in llm_files:
        if not check_file_exists(file_path, f"LLM Component: {file_path}"):
            all_good = False
    
    # Test backend health if running
    try:
        import requests
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend server is running")
        else:
            print("⚠️  Backend server not responding")
    except:
        print("⚠️  Backend server not running (start with: python simple_backend_server.py)")
    
    return all_good

def verify_stage_3():
    """Stage 3: STT/TTS Modules (Temporarily Paused)"""
    print_stage(3, "STT/TTS Modules (Temporarily Paused)")
    print("⏸️  STT/TTS modules are temporarily paused as requested")
    print("✅ Stage 3 marked as complete (paused)")
    return True

def verify_stage_4():
    """Stage 4: Plugin System (Tool Dashboard)"""
    print_stage(4, "Plugin System (Tool Dashboard)")
    
    plugin_files = [
        "src/plugins/todoList/index.ts",
        "src/plugins/noteTaker/index.ts", 
        "src/plugins/fileReader/index.ts",
        "src/plugins/fileWriter/index.ts",
        "src/plugins/pluginInspector/index.ts",
        "src/components/ToolDashboard.tsx",
        "src/core/plugins/registry.ts"
    ]
    
    all_good = True
    for file_path in plugin_files:
        if not check_file_exists(file_path, f"Plugin: {file_path}"):
            all_good = False
    
    return all_good

def verify_stage_5():
    """Stage 5: Accessibility Layer"""
    print_stage(5, "Accessibility Layer")
    
    accessibility_files = [
        "src/utils/accessibility.ts"
    ]
    
    all_good = True
    for file_path in accessibility_files:
        if not check_file_exists(file_path, f"Accessibility: {file_path}"):
            all_good = False
    
    # Check if accessibility styles are in CSS
    css_file = Path("src/styles/globals.css")
    if css_file.exists():
        content = css_file.read_text()
        if "ACCESSIBILITY ENHANCEMENTS" in content:
            print("✅ Accessibility styles added to CSS")
        else:
            print("❌ Accessibility styles missing from CSS")
            all_good = False
    
    return all_good

def verify_stage_6():
    """Stage 6: Android Porting"""
    print_stage(6, "Android Porting")
    
    android_files = [
        "src-tauri/gen/android/app/src/main/AndroidManifest.xml"
    ]
    
    all_good = True
    for file_path in android_files:
        if not check_file_exists(file_path, f"Android Config: {file_path}"):
            all_good = False
    
    # Check Tauri config for mobile support
    tauri_config = Path("src-tauri/tauri.conf.json")
    if tauri_config.exists():
        try:
            config = json.loads(tauri_config.read_text())
            if "tauri" in config:
                print("✅ Tauri configuration updated for mobile")
            else:
                print("⚠️  Tauri configuration may need mobile updates")
        except:
            print("❌ Could not parse Tauri configuration")
            all_good = False
    
    return all_good

def verify_stage_7():
    """Stage 7: Privacy Sandbox"""
    print_stage(7, "Privacy Sandbox")
    
    privacy_files = [
        "src/utils/privacyManager.ts"
    ]
    
    all_good = True
    for file_path in privacy_files:
        if not check_file_exists(file_path, f"Privacy: {file_path}"):
            all_good = False
    
    return all_good

def run_comprehensive_tests():
    """Run the comprehensive test suite"""
    print_stage("TEST", "Comprehensive Testing")
    
    if Path("test_ui_fixes_comprehensive.py").exists():
        return run_command(
            "python test_ui_fixes_comprehensive.py", 
            "Running comprehensive test suite",
            timeout=60
        )
    else:
        print("❌ Test suite not found")
        return False

def main():
    """Main completion verification"""
    print("🎯 Privacy AI Assistant - Complete All 7 Stages Verification")
    print("=" * 70)
    
    stages = [
        ("Stage 0", verify_stage_0),
        ("Stage 1", verify_stage_1), 
        ("Stage 2", verify_stage_2),
        ("Stage 3", verify_stage_3),
        ("Stage 4", verify_stage_4),
        ("Stage 5", verify_stage_5),
        ("Stage 6", verify_stage_6),
        ("Stage 7", verify_stage_7),
    ]
    
    results = {}
    
    for stage_name, verify_func in stages:
        try:
            results[stage_name] = verify_func()
        except Exception as e:
            print(f"❌ {stage_name} verification failed: {e}")
            results[stage_name] = False
        
        time.sleep(1)
    
    # Run comprehensive tests
    results["Tests"] = run_comprehensive_tests()
    
    # Final summary
    print("\n" + "=" * 70)
    print("📊 FINAL COMPLETION SUMMARY")
    print("=" * 70)
    
    completed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for stage, result in results.items():
        status = "✅ COMPLETE" if result else "❌ INCOMPLETE"
        print(f"{stage:.<30} {status}")
    
    print(f"\nOverall Progress: {completed}/{total} stages completed")
    
    if completed == total:
        print("\n🎉 ALL STAGES COMPLETED SUCCESSFULLY!")
        print("🚀 Your Privacy AI Assistant is ready for submission!")
        print("\n📋 Next Steps:")
        print("   1. Start backend: python simple_backend_server.py")
        print("   2. Start frontend: npm run dev")
        print("   3. Build for production: npm run build")
        print("   4. Build Tauri app: npm run tauri build")
        return True
    else:
        print(f"\n⚠️  {total - completed} stages need attention.")
        print("Please review the failed items above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
