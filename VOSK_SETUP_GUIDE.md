# 🎤 Vosk Real-time STT Setup Guide

## 📋 Quick Start

### 1. Install Dependencies
```bash
# Option A: sounddevice (recommended)
pip install -r requirements_vosk.txt

# Option B: PyAudio (more stable on Windows)
pip install vosk pyaudio numpy wave
```

### 2. Download Vosk Model
```bash
# Download English model (1.8GB)
wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip

# Or smaller model (50MB, less accurate)
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip
```

### 3. Run the Script
```bash
# sounddevice version
python vosk_realtime_stt.py

# PyAudio version (if sounddevice has issues)
python vosk_pyaudio_stt.py
```

## 🔧 Key Features Fixed

### ✅ Proper Audio Format
- **16 kHz sample rate** (Vosk requirement)
- **Mono channel** (1 channel, not stereo)
- **16-bit PCM format** (int16)
- **Optimal chunk size** (4000 bytes)

### ✅ Device Selection
- Lists all available microphones
- Auto-selects default input device
- Shows device capabilities (channels, sample rate)

### ✅ Debug Capabilities
- Saves raw audio to `.wav` files
- Audio level analysis (RMS, max levels)
- Real-time logging of partial/final results
- Separate test mode for microphone validation

### ✅ Real-time Processing
- Separate thread for audio processing
- Queue-based audio handling
- Live partial results display
- Proper cleanup and error handling

## 🎯 Usage Examples

### Test Microphone First
```python
# Run option 2: Test microphone capture
# This will:
# - Record 5 seconds of audio
# - Analyze audio levels
# - Save test file for inspection
# - Show if mic is working properly
```

### Real-time STT
```python
# Run option 1: Start real-time STT
# This will:
# - Record for 10 seconds
# - Show partial results in real-time
# - Display final transcript
# - Save debug audio file
```

## 🔍 Troubleshooting

### ❌ "No transcript found"
**Causes:**
- Audio levels too low (speak louder)
- Wrong microphone selected
- Audio format issues
- Background noise

**Solutions:**
1. Run microphone test first
2. Check audio levels in debug output
3. Try different microphone
4. Speak closer to mic

### ❌ "No input devices found"
**Causes:**
- No microphone connected
- Driver issues
- Permissions problems

**Solutions:**
1. Check microphone connection
2. Update audio drivers
3. Grant microphone permissions
4. Try different USB port

### ❌ Audio callback errors
**Causes:**
- Sample rate mismatch
- Buffer overflow
- Device busy

**Solutions:**
1. Close other audio applications
2. Try PyAudio version instead
3. Restart audio service
4. Use different device

### ❌ Poor transcription accuracy
**Causes:**
- Background noise
- Low audio quality
- Wrong language model
- Speaking too fast/quiet

**Solutions:**
1. Use quiet environment
2. Speak clearly and slowly
3. Check audio levels (should be >1000)
4. Try larger Vosk model

## 📊 Audio Quality Guidelines

### Good Audio Levels
- **RMS Level**: 500-3000
- **Max Level**: 5000-30000
- **Dynamic Range**: Should vary with speech

### Poor Audio Indicators
- **RMS < 100**: Too quiet
- **Max < 1000**: Barely audible
- **Constant level**: No speech detected

## 🎛️ Configuration Options

### Model Selection
```python
# Large model (better accuracy, 1.8GB)
VOSK_MODEL_PATH = "vosk-model-en-us-0.22"

# Small model (faster, less accurate, 50MB)
VOSK_MODEL_PATH = "vosk-model-small-en-us-0.15"

# Other languages available at:
# https://alphacephei.com/vosk/models
```

### Audio Parameters
```python
SAMPLE_RATE = 16000  # Don't change - Vosk requirement
CHANNELS = 1         # Don't change - Vosk requirement
CHUNK_SIZE = 4000    # Can adjust: 2000-8000
BLOCKSIZE = 2000     # Can adjust for latency
```

## 🔗 Integration with Your AI Assistant

### Basic Integration
```python
from vosk_realtime_stt import VoskRealtimeSTT

# Initialize
stt = VoskRealtimeSTT("path/to/vosk-model")

# Record and transcribe
def get_voice_input():
    # Your integration code here
    transcript = stt.start_recording(duration=5.0)
    return transcript
```

### Advanced Integration
```python
# Custom callback for real-time results
def on_partial_result(text):
    print(f"Hearing: {text}")

def on_final_result(text):
    print(f"Final: {text}")
    # Send to your AI model
    ai_response = your_ai_model.process(text)
    return ai_response
```

## 📁 File Structure
```
your_project/
├── vosk_realtime_stt.py      # Main sounddevice version
├── vosk_pyaudio_stt.py       # PyAudio alternative
├── requirements_vosk.txt     # Dependencies
├── VOSK_SETUP_GUIDE.md      # This guide
├── vosk-model-en-us-0.22/   # Vosk model directory
└── debug_audio/             # Debug audio files
    ├── debug_mic_capture_*.wav
    ├── pyaudio_test_*.wav
    └── mic_test_*.wav
```

## 🚀 Next Steps

1. **Test microphone first** - Always run option 2 before STT
2. **Check debug audio** - Listen to saved files to verify quality
3. **Adjust parameters** - Fine-tune chunk size and duration
4. **Integrate with your AI** - Add to your assistant pipeline
5. **Add noise filtering** - Consider scipy/librosa for preprocessing

## 💡 Pro Tips

- **Use headphones** to prevent feedback
- **Quiet environment** improves accuracy significantly
- **Consistent distance** from microphone
- **Clear pronunciation** works better than loud volume
- **Test different models** for your use case
- **Monitor debug files** to understand issues
