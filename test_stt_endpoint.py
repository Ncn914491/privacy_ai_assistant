#!/usr/bin/env python3
"""
Test the new /stt/transcribe endpoint with the STT integration
"""

import requests
import base64
import wave
import numpy as np
import tempfile
import os

def create_test_audio():
    """Create a test audio file for transcription"""
    # Create a short sine wave (beep) instead of silence
    sample_rate = 16000
    duration = 2.0  # seconds
    frequency = 440  # Hz (A note)
    
    # Generate sine wave
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    wave_data = np.sin(2 * np.pi * frequency * t) * 0.3  # 30% volume
    
    # Convert to 16-bit PCM
    audio_data = (wave_data * 32767).astype(np.int16)
    
    # Create WAV file
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        with wave.open(f.name, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data.tobytes())
        return f.name

def test_stt_endpoint():
    """Test the /stt/transcribe endpoint"""
    print("🧪 Testing /stt/transcribe endpoint...")
    
    # Create test audio
    audio_file = create_test_audio()
    print(f"📁 Created test audio: {audio_file}")
    
    try:
        # Read and encode audio file
        with open(audio_file, 'rb') as f:
            audio_data = f.read()
        
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        print(f"📊 Audio data size: {len(audio_data)} bytes")
        
        # Send request to STT endpoint
        url = "http://127.0.0.1:8000/stt/transcribe"
        payload = {
            "audio_data": audio_base64,
            "format": "wav"
        }
        
        print("🚀 Sending request to STT endpoint...")
        response = requests.post(url, json=payload, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ STT Response: {result}")
            
            if result.get("success"):
                print(f"📝 Transcription: '{result.get('text', '')}'")
            else:
                print(f"❌ STT Error: {result.get('error', 'Unknown error')}")
        else:
            print(f"❌ HTTP Error {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
    finally:
        # Clean up
        if os.path.exists(audio_file):
            os.remove(audio_file)
            print(f"🧹 Cleaned up: {audio_file}")

def test_with_real_audio():
    """Test with existing audio file if available"""
    # Check if there's a real audio file in debug_audio
    debug_dir = "debug_audio"
    if os.path.exists(debug_dir):
        audio_files = [f for f in os.listdir(debug_dir) if f.endswith('.wav')]
        if audio_files:
            audio_file = os.path.join(debug_dir, audio_files[0])
            print(f"🎵 Testing with real audio file: {audio_file}")
            
            try:
                with open(audio_file, 'rb') as f:
                    audio_data = f.read()
                
                audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                
                url = "http://127.0.0.1:8000/stt/transcribe"
                payload = {
                    "audio_data": audio_base64,
                    "format": "wav"
                }
                
                response = requests.post(url, json=payload, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"✅ Real Audio STT Response: {result}")
                else:
                    print(f"❌ HTTP Error {response.status_code}: {response.text}")
                    
            except Exception as e:
                print(f"❌ Real audio test failed: {e}")

if __name__ == "__main__":
    print("🧪 STT Endpoint Integration Test")
    print("=" * 50)
    
    # Test with synthetic audio
    test_stt_endpoint()
    
    print("\n" + "=" * 50)
    
    # Test with real audio if available
    test_with_real_audio()
