#!/usr/bin/env python3
"""
Test script for STT API endpoint
"""

import requests
import base64
import json
from pathlib import Path

def test_stt_endpoint():
    """Test the STT transcription endpoint."""
    
    # Test with debug audio file
    audio_file = Path("debug_audio/mic_test_20250720_085512.wav")
    
    if not audio_file.exists():
        print(f"❌ Audio file not found: {audio_file}")
        return False
    
    try:
        # Read and encode audio file
        with open(audio_file, 'rb') as f:
            audio_data = f.read()
        
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        # Prepare request
        request_data = {
            "audio_data": audio_base64,
            "filename": "hello.wav"
        }
        
        print(f"🎤 Testing STT with {audio_file} ({len(audio_data)} bytes)")
        
        # Send request to STT endpoint
        response = requests.post(
            "http://127.0.0.1:8000/stt/transcribe",
            json=request_data,
            timeout=30
        )
        
        print(f"📡 Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ STT Response: {json.dumps(result, indent=2)}")
            
            if result.get('success'):
                print(f"🎯 Transcribed text: '{result.get('text', '')}'")
                return True
            else:
                print(f"❌ STT failed: {result.get('error', 'Unknown error')}")
                return False
        else:
            print(f"❌ HTTP Error: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing STT API Endpoint")
    print("=" * 40)
    
    success = test_stt_endpoint()
    
    if success:
        print("\n✅ STT API test passed!")
    else:
        print("\n❌ STT API test failed!")
