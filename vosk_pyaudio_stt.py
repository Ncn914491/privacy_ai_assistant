#!/usr/bin/env python3
"""
🎤 Vosk Real-time STT with PyAudio (Alternative Implementation)
More stable on some systems, especially Windows.

Requirements:
- pip install vosk pyaudio numpy wave
- Download Vosk model: https://alphacephei.com/vosk/models
"""

import json
import queue
import sys
import threading
import time
import wave
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

import numpy as np
import pyaudio
import vosk

# 🔧 Vosk Configuration
SAMPLE_RATE = 16000
CHANNELS = 1
FORMAT = pyaudio.paInt16  # 16-bit PCM
CHUNK_SIZE = 4000
FRAMES_PER_BUFFER = 1024

# 📁 Paths
VOSK_MODEL_PATH = "vosk-model-small-en-us-0.15"
DEBUG_AUDIO_DIR = Path("debug_audio")
DEBUG_AUDIO_DIR.mkdir(exist_ok=True)

class VoskPyAudioSTT:
    """Real-time STT using Vosk with PyAudio for better Windows compatibility."""
    
    def __init__(self, model_path: str = VOSK_MODEL_PATH):
        """Initialize Vosk STT with PyAudio."""
        print(f"🔧 Initializing Vosk STT with PyAudio...")
        
        # Initialize PyAudio
        self.audio = pyaudio.PyAudio()
        
        # Initialize Vosk
        if not Path(model_path).exists():
            raise FileNotFoundError(f"❌ Vosk model not found: {model_path}")
        
        vosk.SetLogLevel(-1)
        self.model = vosk.Model(model_path)
        self.recognizer = vosk.KaldiRecognizer(self.model, SAMPLE_RATE)
        
        # Audio processing
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.debug_audio_data = []
        
        print("✅ Vosk STT with PyAudio initialized")
    
    def list_audio_devices(self) -> List[Dict]:
        """List all available audio input devices."""
        print("\n🎤 Available Audio Input Devices:")
        devices = []
        
        for i in range(self.audio.get_device_count()):
            device_info = self.audio.get_device_info_by_index(i)
            if device_info['maxInputChannels'] > 0:
                devices.append({
                    'id': i,
                    'name': device_info['name'],
                    'channels': device_info['maxInputChannels'],
                    'sample_rate': device_info['defaultSampleRate']
                })
                print(f"  {i}: {device_info['name']} ({device_info['maxInputChannels']} ch)")
        
        return devices
    
    def select_microphone(self) -> Optional[int]:
        """Select microphone device."""
        devices = self.list_audio_devices()
        
        if not devices:
            print("❌ No input devices found!")
            return None
        
        # Use default input device
        try:
            default_device = self.audio.get_default_input_device_info()
            default_id = default_device['index']
            print(f"\n🎯 Using default input device: {default_id} - {default_device['name']}")
            return default_id
        except Exception as e:
            print(f"⚠️ Could not get default device: {e}")
            return devices[0]['id']
    
    def save_debug_audio(self, filename: str = None):
        """Save captured audio for debugging."""
        if not self.debug_audio_data:
            print("⚠️ No audio data to save")
            return
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"debug_pyaudio_{timestamp}.wav"
        
        filepath = DEBUG_AUDIO_DIR / filename
        
        # Save as WAV
        with wave.open(str(filepath), 'wb') as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(self.audio.get_sample_size(FORMAT))
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b''.join(self.debug_audio_data))
        
        duration = len(self.debug_audio_data) * FRAMES_PER_BUFFER / SAMPLE_RATE
        print(f"💾 Debug audio saved: {filepath} ({duration:.1f}s)")
        return filepath
    
    def process_audio_stream(self):
        """Process audio chunks with Vosk."""
        print("🔄 Starting audio processing thread...")
        
        while self.is_recording:
            try:
                audio_chunk = self.audio_queue.get(timeout=0.1)
                
                if self.recognizer.AcceptWaveform(audio_chunk):
                    result = json.loads(self.recognizer.Result())
                    if result.get('text', '').strip():
                        print(f"\n🎯 FINAL: {result['text']}")
                else:
                    partial = json.loads(self.recognizer.PartialResult())
                    if partial.get('partial', '').strip():
                        print(f"🔄 PARTIAL: {partial['partial']}", end='\r')
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"❌ Processing error: {e}")
    
    def start_recording(self, duration: float = 10.0, device_id: Optional[int] = None):
        """Start real-time recording with PyAudio."""
        if device_id is None:
            device_id = self.select_microphone()
        
        if device_id is None:
            print("❌ No microphone selected")
            return
        
        print(f"\n🎤 Starting PyAudio recording...")
        print(f"📊 Config: {SAMPLE_RATE}Hz, {CHANNELS} channel, device {device_id}")
        print(f"⏱️ Duration: {duration}s")
        print("🔴 Recording... (speak now)")
        
        # Reset state
        self.is_recording = True
        self.debug_audio_data = []
        
        # Start processing thread
        processing_thread = threading.Thread(target=self.process_audio_stream)
        processing_thread.daemon = True
        processing_thread.start()
        
        try:
            # Open audio stream
            stream = self.audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                input=True,
                input_device_index=device_id,
                frames_per_buffer=FRAMES_PER_BUFFER
            )
            
            start_time = time.time()
            
            while time.time() - start_time < duration and self.is_recording:
                try:
                    # Read audio data
                    audio_data = stream.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                    
                    # Store for debugging
                    self.debug_audio_data.append(audio_data)
                    
                    # Add to processing queue
                    self.audio_queue.put(audio_data)
                    
                except Exception as e:
                    print(f"⚠️ Audio read error: {e}")
                    break
            
            # Clean up
            stream.stop_stream()
            stream.close()
            
        except Exception as e:
            print(f"❌ Recording error: {e}")
        finally:
            print(f"\n⏹️ Recording stopped")
            self.is_recording = False
            
            # Get final result
            final_result = json.loads(self.recognizer.FinalResult())
            if final_result.get('text', '').strip():
                print(f"🎯 FINAL RESULT: {final_result['text']}")
            else:
                print("❌ No transcript found")
            
            # Save debug audio
            self.save_debug_audio()
    
    def test_microphone(self, duration: float = 5.0):
        """Test microphone without transcription."""
        device_id = self.select_microphone()
        if device_id is None:
            return
        
        print(f"\n🧪 Testing microphone for {duration}s...")
        
        try:
            stream = self.audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                input=True,
                input_device_index=device_id,
                frames_per_buffer=FRAMES_PER_BUFFER
            )
            
            audio_data = []
            start_time = time.time()
            
            while time.time() - start_time < duration:
                data = stream.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                audio_data.append(data)
            
            stream.stop_stream()
            stream.close()
            
            # Analyze audio
            if audio_data:
                # Convert to numpy for analysis
                audio_bytes = b''.join(audio_data)
                audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
                
                rms = np.sqrt(np.mean(audio_array**2))
                max_val = np.max(np.abs(audio_array))
                
                print(f"📊 Audio Analysis:")
                print(f"   Samples: {len(audio_array)}")
                print(f"   Duration: {len(audio_array)/SAMPLE_RATE:.1f}s")
                print(f"   RMS Level: {rms:.1f}")
                print(f"   Max Level: {max_val}")
                print(f"   Quality: {'Good' if max_val > 1000 else 'Low - speak louder!'}")
                
                # Save test audio
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                test_file = DEBUG_AUDIO_DIR / f"pyaudio_test_{timestamp}.wav"
                
                with wave.open(str(test_file), 'wb') as wf:
                    wf.setnchannels(CHANNELS)
                    wf.setsampwidth(self.audio.get_sample_size(FORMAT))
                    wf.setframerate(SAMPLE_RATE)
                    wf.writeframes(audio_bytes)
                
                print(f"💾 Test audio saved: {test_file}")
            
        except Exception as e:
            print(f"❌ Microphone test failed: {e}")
    
    def __del__(self):
        """Clean up PyAudio."""
        if hasattr(self, 'audio'):
            self.audio.terminate()


def main():
    """Main function with interactive menu."""
    print("🎤 Vosk Real-time STT - PyAudio Version")
    print("=" * 50)
    
    try:
        stt = VoskPyAudioSTT()
    except FileNotFoundError as e:
        print(f"❌ {e}")
        print("💡 Download a Vosk model from: https://alphacephei.com/vosk/models")
        return
    except Exception as e:
        print(f"❌ Initialization failed: {e}")
        return
    
    try:
        while True:
            print("\n🎯 Choose an option:")
            print("1. 🎤 Start real-time STT (10s)")
            print("2. 🧪 Test microphone capture (5s)")
            print("3. 📋 List audio devices")
            print("4. ⚙️ Custom duration STT")
            print("5. 🚪 Exit")
            
            choice = input("\nEnter choice (1-5): ").strip()
            
            if choice == '1':
                stt.start_recording(duration=10.0)
            elif choice == '2':
                stt.test_microphone(duration=5.0)
            elif choice == '3':
                stt.list_audio_devices()
            elif choice == '4':
                try:
                    duration = float(input("Enter duration in seconds: "))
                    stt.start_recording(duration=duration)
                except ValueError:
                    print("❌ Invalid duration")
            elif choice == '5':
                print("👋 Goodbye!")
                break
            else:
                print("❌ Invalid choice")
    
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user")
    finally:
        # Clean up
        del stt


if __name__ == "__main__":
    main()
