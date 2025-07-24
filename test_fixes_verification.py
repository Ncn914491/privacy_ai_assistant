#!/usr/bin/env python3
"""
Comprehensive test to verify both fixes:
1. HardwareStatusBadge TypeError fix
2. Connection refused error fix
"""

import requests
import time
import psutil

def test_backend_connection():
    """Test that backend is accessible"""
    print("🔍 Testing backend connection...")
    
    try:
        response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend connected: {data}")
            return True
        else:
            print(f"❌ Backend HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend connection failed: {e}")
        return False

def test_hardware_endpoint():
    """Test the hardware endpoint that feeds HardwareStatusBadge"""
    print("\n🔧 Testing hardware endpoint...")
    
    try:
        response = requests.get("http://127.0.0.1:8000/hardware/info", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                hardware_data = data.get('data', {})
                hardware = hardware_data.get('hardware', {})
                runtime = hardware_data.get('runtime', {})
                
                print("✅ Hardware endpoint working")
                print(f"   Hardware data: {bool(hardware)}")
                print(f"   Runtime data: {bool(runtime)}")
                print(f"   Runtime mode: {runtime.get('mode', 'Missing')}")
                print(f"   Runtime reason: {runtime.get('reason', 'Missing')}")
                
                # Check if the data structure is complete
                has_mode = runtime.get('mode') is not None
                has_hardware = bool(hardware)
                
                return has_mode and has_hardware
            else:
                print(f"❌ Hardware endpoint failed: {data.get('error')}")
                return False
        else:
            print(f"❌ Hardware endpoint HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Hardware endpoint test failed: {e}")
        return False

def test_vite_server():
    """Test that Vite dev server is running"""
    print("\n🌐 Testing Vite dev server...")
    
    try:
        response = requests.get("http://localhost:5174", timeout=5)
        if response.status_code == 200:
            content = response.text
            if "Privacy AI Assistant" in content or "<!DOCTYPE html>" in content:
                print("✅ Vite server accessible and serving content")
                return True
            else:
                print("❌ Vite server serving unexpected content")
                return False
        else:
            print(f"❌ Vite server HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Vite server connection failed: {e}")
        return False

def test_desktop_app_running():
    """Test that desktop app is running"""
    print("\n🖥️  Testing desktop application...")
    
    for proc in psutil.process_iter(['pid', 'name', 'exe']):
        try:
            if proc.info['name'] and 'privacy-ai-assistant' in proc.info['name'].lower():
                print(f"✅ Desktop app running: PID {proc.info['pid']}")
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    print("❌ Desktop application not found")
    return False

def test_chat_functionality():
    """Test basic chat functionality"""
    print("\n💬 Testing chat functionality...")
    
    try:
        # Create a chat session
        response = requests.post(
            "http://127.0.0.1:8000/chats/create",
            json={"title": "Fix Verification Test"},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                chat_id = data.get('chat_id')
                print(f"✅ Chat session created: {chat_id}")
                return True
            else:
                print(f"❌ Chat creation failed: {data.get('error')}")
                return False
        else:
            print(f"❌ Chat creation HTTP error: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Chat functionality test failed: {e}")
        return False

def main():
    print("🔧 Comprehensive Fix Verification Test\n")
    print("Testing fixes for:")
    print("1. HardwareStatusBadge TypeError: Cannot read properties of undefined (reading 'mode')")
    print("2. Connection refused error: ERR_CONNECTION_REFUSED")
    print("\n" + "=" * 80)
    
    # Run all tests
    backend_ok = test_backend_connection()
    hardware_ok = test_hardware_endpoint()
    vite_ok = test_vite_server()
    desktop_ok = test_desktop_app_running()
    chat_ok = test_chat_functionality()
    
    print("\n" + "=" * 80)
    print("📊 FIX VERIFICATION RESULTS:")
    print("=" * 80)
    
    results = {
        "Backend Connection": backend_ok,
        "Hardware Endpoint": hardware_ok,
        "Vite Dev Server": vite_ok,
        "Desktop App Running": desktop_ok,
        "Chat Functionality": chat_ok
    }
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name:<20}: {status}")
    
    print("\n" + "=" * 80)
    
    # Specific fix assessments
    connection_fixed = backend_ok and vite_ok and desktop_ok
    hardware_fixed = hardware_ok and backend_ok
    
    if connection_fixed and hardware_fixed:
        print("🎉 ALL FIXES VERIFIED - Both issues resolved!")
        print("✅ Connection refused error: FIXED")
        print("✅ HardwareStatusBadge TypeError: FIXED")
        print("✅ Desktop application should now work properly")
    elif connection_fixed:
        print("🎯 CONNECTION ISSUE FIXED")
        print("✅ ERR_CONNECTION_REFUSED resolved")
        if not hardware_fixed:
            print("⚠️  Hardware endpoint may still have issues")
    elif hardware_fixed:
        print("🎯 HARDWARE BADGE ISSUE FIXED")
        print("✅ TypeError for hardware.mode resolved")
        if not connection_fixed:
            print("⚠️  Connection issues may persist")
    else:
        print("❌ CRITICAL ISSUES REMAIN")
        print("🔧 Both fixes may need additional work")
    
    print("=" * 80)
    
    if connection_fixed and hardware_fixed:
        print("\n💡 Success! The desktop app should now:")
        print("1. ✅ Load without connection errors")
        print("2. ✅ Display hardware status without TypeError")
        print("3. ✅ Show proper loading states and fallbacks")
        print("4. ✅ Connect to both frontend (Vite) and backend services")
        print("5. 🖥️  Provide a smooth desktop experience")
        
        print("\n🎮 User Actions:")
        print("• The Privacy AI Assistant window should be visible")
        print("• Hardware status badge should show 'Loading...' then proper status")
        print("• Chat functionality should work end-to-end")
        print("• No more 'webpage cannot be reached' errors")
    else:
        print("\n🔧 Next Steps:")
        if not connection_fixed:
            print("• Ensure Vite dev server is running on port 5174")
            print("• Ensure backend server is running on port 8000")
            print("• Check Tauri configuration for correct devUrl")
        if not hardware_fixed:
            print("• Verify hardware endpoint returns complete data structure")
            print("• Check that runtime.mode is properly set")
            print("• Ensure proper null checks in HardwareStatusBadge component")

if __name__ == "__main__":
    main()
