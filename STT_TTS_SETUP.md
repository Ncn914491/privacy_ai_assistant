# STT/TTS Setup Instructions

## Stage 3: Voice Interaction Implementation

This document outlines the STT (Speech-to-Text) and TTS (Text-to-Speech) functionality added to the Privacy AI Assistant.

## Current Implementation Status

### ✅ Completed
- **Backend STT/TTS Commands**: Added Rust Tauri commands for voice processing
- **Frontend Integration**: Connected mic button and TTS toggle to backend
- **UI Enhancements**: Improved TTS toggle with better visual feedback
- **Error Handling**: Proper error handling for audio operations
- **Windows Compatibility**: Uses built-in Windows SAPI for initial testing

### 🚧 Current Features

#### Speech-to-Text (STT)
- **Trigger**: Click the microphone button in the chat input
- **Recording**: 5-second audio capture
- **Processing**: Currently uses Windows Speech API as placeholder
- **Output**: Transcribed text fills the chat input automatically

#### Text-to-Speech (TTS)
- **Trigger**: Toggle the "Voice Output" switch
- **Processing**: Uses Windows SAPI for speech synthesis
- **Playback**: AI responses are automatically spoken when TTS is enabled
- **Audio**: Generates temporary WAV files and plays them

## Production Requirements

### For Full Offline Functionality

#### 1. Vosk STT Models
```bash
# Download Vosk models (place in project root)
mkdir vosk-models
cd vosk-models

# English model (lightweight)
curl -O https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
unzip vosk-model-en-us-0.22.zip

# Or larger, more accurate model
curl -O https://alphacephei.com/vosk/models/vosk-model-en-us-0.22-lgraph.zip
unzip vosk-model-en-us-0.22-lgraph.zip
```

#### 2. Piper TTS Models
```bash
# Download Piper models
mkdir piper-models
cd piper-models

# English voice model
curl -O https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -O https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

#### 3. Update Model Paths
Edit `src-tauri/src/stt_tts.rs` and update the model paths:
```rust
// Line 21: Update Vosk model path
let model = Model::new("./vosk-models/vosk-model-en-us-0.22").expect("Could not load model");

// Line 157: Update Piper model path  
let piper_model = "./piper-models/en_US-lessac-medium.onnx";
```

## Testing the Implementation

### 1. Build and Run
```bash
# Install dependencies
npm install

# Build the project
npm run tauri dev
```

### 2. Test STT
1. Click the microphone button in the chat input
2. Speak clearly for 5 seconds
3. The transcribed text should appear in the input field
4. Click send to submit the message

### 3. Test TTS
1. Toggle "Voice Output" to enabled
2. Send any message to the AI
3. The AI's response should be spoken aloud automatically

### 4. Test Audio Devices
Add this to your frontend to test audio devices:
```javascript
import { invoke } from '@tauri-apps/api/core';

// Test audio devices
invoke('test_audio_devices').then((result) => {
  console.log('Audio devices:', result);
});
```

## Architecture Notes

### STT Flow
1. **User clicks mic** → `handleMicToggle()` in InputArea
2. **Frontend calls** → `invoke('run_vosk_stt', { mic_on: true })`
3. **Backend records** → 5 seconds of audio via `record_audio_to_file()`
4. **Backend processes** → Audio through `process_audio_with_vosk()`
5. **Returns result** → `SttResult` with transcribed text
6. **Frontend updates** → Chat input with transcribed text

### TTS Flow
1. **AI generates response** → LLM returns text
2. **Frontend checks** → TTS toggle enabled?
3. **Frontend calls** → `invoke('run_piper_tts', { text: response })`
4. **Backend generates** → Audio via `generate_speech_with_piper()`
5. **Backend plays** → Audio file through `play_audio_file()`
6. **Cleanup** → Temporary files removed

## Troubleshooting

### Common Issues

#### 1. "No input device available"
- Check microphone permissions
- Ensure microphone is connected and working
- Test with Windows Sound Recorder

#### 2. "Failed to create audio stream"
- Check audio drivers
- Restart the application
- Verify output device is working

#### 3. "TTS generation failed"
- Ensure Windows SAPI is available
- Check text for special characters
- Verify write permissions for temp files

#### 4. STT not working
- Speak clearly and loudly
- Check microphone levels in Windows
- Ensure 5-second recording completes

### Debug Commands

Add these to your frontend for debugging:
```javascript
// Test TTS configuration
invoke('get_tts_config').then(console.log);

// Test audio devices
invoke('test_audio_devices').then(console.log);
```

## Next Steps

### Stage 4: Plugin System
- Modular voice command handlers
- Custom STT/TTS model loading
- Voice command parsing and routing

### Future Enhancements
- **Real-time STT**: Streaming speech recognition
- **Voice Commands**: "Hey Assistant" wake word
- **Multi-language**: Support for other languages
- **Voice Cloning**: Custom voice models
- **Noise Cancellation**: Background noise filtering

## Security & Privacy

- **100% Offline**: No cloud APIs used
- **Local Processing**: All audio processing happens locally
- **Temporary Files**: Audio files are immediately deleted
- **No Storage**: No persistent audio data stored
- **Privacy First**: No data leaves the device

## Performance Considerations

- **Memory Usage**: STT/TTS models use ~100-500MB RAM
- **CPU Usage**: Audio processing is CPU-intensive
- **Battery Impact**: Continuous listening would drain battery
- **Disk Space**: Models require 50-200MB storage

## Dependencies Added

```toml
# Audio processing
cpal = "0.15"           # Audio I/O
rodio = "0.17"          # Audio playback
hound = "3.5"           # WAV file handling

# STT/TTS
vosk = "0.3"            # Offline STT
# Note: Piper integration pending

# Utilities
base64 = "0.22"         # Audio encoding
wav = "1.0"             # WAV processing
byteorder = "1.5"       # Audio format handling
```
