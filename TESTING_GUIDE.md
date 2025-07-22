# Privacy AI Assistant - Testing Guide

## 🧪 Comprehensive Testing Protocol

This guide provides step-by-step instructions for testing all the fixes and improvements made to the privacy AI assistant application.

## 📋 Pre-Testing Checklist

### System Requirements
- [ ] Node.js and npm installed
- [ ] Python 3.11+ installed
- [ ] Rust and Tauri CLI installed
- [ ] Microphone access available
- [ ] Internet connection for initial setup

### Dependencies Setup
- [ ] Python backend dependencies installed (`pip install -r requirements.txt`)
- [ ] Vosk model downloaded and placed in correct directory
- [ ] Ollama installed and running
- [ ] Gemma 3n model available in Ollama

### Environment Verification
```bash
# Check Python dependencies
python -c "import vosk, fastapi, uvicorn, websockets; print('Python deps OK')"

# Check Ollama
ollama list | grep gemma

# Check Node dependencies
npm list --depth=0
```

## 🚀 Testing Phases

### Phase 1: Backend Connectivity Testing

1. **Start Python Backend**:
   ```bash
   cd privacy_ai_assistant
   python python_backend_server.py
   ```

2. **Verify Backend Health**:
   - Open browser to `http://localhost:8000/health`
   - Should return: `{"status": "healthy", "vosk_initialized": true}`

3. **Test WebSocket Endpoint**:
   ```bash
   # Test WebSocket connection
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" http://localhost:8000/stt/stream
   ```

### Phase 2: Frontend Application Testing

1. **Start Tauri Application**:
   ```bash
   npm run tauri dev
   ```

2. **Verify Application Launch**:
   - [ ] Application window opens successfully
   - [ ] No console errors on startup
   - [ ] Status badges show appropriate states
   - [ ] Chat interface is responsive

### Phase 3: Microphone Permission Testing

1. **Initial Permission State**:
   - [ ] Click voice input button
   - [ ] Verify permission request dialog appears
   - [ ] Check connection status indicator shows "Permission Needed"

2. **Grant Permission**:
   - [ ] Click "Allow" in browser permission dialog
   - [ ] Verify status changes to "Checking Permissions"
   - [ ] Confirm final status shows "Ready" or "Connected"

3. **Deny Permission**:
   - [ ] Refresh application
   - [ ] Click voice input button
   - [ ] Click "Deny" in permission dialog
   - [ ] Verify error message appears
   - [ ] Check retry button functionality

4. **Permission Recovery**:
   - [ ] Reset permissions in browser settings
   - [ ] Click retry button
   - [ ] Verify permission request appears again

### Phase 4: WebSocket Stability Testing

1. **Basic Connection**:
   - [ ] Open voice modal
   - [ ] Verify WebSocket connection established
   - [ ] Check debug panel for connection confirmation
   - [ ] Verify heartbeat messages appear every 10 seconds

2. **Connection Recovery**:
   - [ ] Start voice recording
   - [ ] Temporarily disconnect internet
   - [ ] Verify error handling and reconnection attempts
   - [ ] Restore internet connection
   - [ ] Confirm automatic reconnection

3. **Long Session Testing**:
   - [ ] Keep voice modal open for 2+ minutes
   - [ ] Verify heartbeat messages continue
   - [ ] Check for any connection drops
   - [ ] Verify no memory leaks in debug panel

### Phase 5: Speech-to-Text Pipeline Testing

1. **Basic STT Functionality**:
   - [ ] Click record button
   - [ ] Speak clearly: "Hello, this is a test"
   - [ ] Verify partial transcription appears in real-time
   - [ ] Stop recording
   - [ ] Confirm final transcription accuracy

2. **Real-time Transcription**:
   - [ ] Start recording
   - [ ] Speak continuously for 10-15 seconds
   - [ ] Verify partial results update in real-time
   - [ ] Check debug panel for STT events
   - [ ] Confirm no audio data loss

3. **Error Handling**:
   - [ ] Start recording without speaking
   - [ ] Verify "No speech detected" message
   - [ ] Test with very quiet audio
   - [ ] Test with background noise
   - [ ] Verify appropriate error messages

### Phase 6: STT to LLM Pipeline Testing

1. **Complete Pipeline**:
   - [ ] Record voice message: "What is artificial intelligence?"
   - [ ] Verify transcription appears correctly
   - [ ] Confirm transcription is added as user message
   - [ ] Verify LLM response is generated
   - [ ] Check response appears in chat interface

2. **Pipeline Debugging**:
   - [ ] Open debug panel during voice input
   - [ ] Verify pipeline steps are logged:
     - `mic_permission_granted`
     - `websocket_connect`
     - `audio_stream_start`
     - `stt_final_result`
     - `llm_request_start`
     - `llm_response`
     - `pipeline_complete`

3. **Error Recovery**:
   - [ ] Test with empty transcription
   - [ ] Test with LLM backend down
   - [ ] Verify appropriate error messages
   - [ ] Check error handling in debug panel

### Phase 7: User Experience Testing

1. **Status Indicators**:
   - [ ] Verify all status badges show correct states
   - [ ] Test connection status indicator details
   - [ ] Check color coding for different states
   - [ ] Verify status updates in real-time

2. **Error Boundary Testing**:
   - [ ] Trigger JavaScript error (modify code temporarily)
   - [ ] Verify error boundary catches error
   - [ ] Check error details display
   - [ ] Test "Try Again" functionality
   - [ ] Verify error logging to localStorage

3. **Debug Panel Features**:
   - [ ] Open debug panel
   - [ ] Verify log filtering works
   - [ ] Test log export functionality
   - [ ] Check auto-scroll behavior
   - [ ] Verify log clearing works

### Phase 8: Performance Testing

1. **Memory Usage**:
   - [ ] Monitor memory usage during long sessions
   - [ ] Check for memory leaks in debug panel
   - [ ] Verify audio buffer cleanup
   - [ ] Test multiple voice input sessions

2. **Response Times**:
   - [ ] Measure time from speech end to transcription
   - [ ] Check LLM response generation time
   - [ ] Verify UI responsiveness during processing
   - [ ] Test concurrent operations

3. **Audio Quality**:
   - [ ] Test with different microphone qualities
   - [ ] Verify 16kHz, mono, PCM audio processing
   - [ ] Check audio data integrity in debug logs
   - [ ] Test with various speech patterns

## 🔍 Debug and Troubleshooting

### Common Issues and Solutions

1. **Microphone Permission Denied**:
   - Check browser settings for microphone access
   - Verify HTTPS/secure context requirements
   - Reset permissions and try again

2. **WebSocket Connection Failed**:
   - Verify Python backend is running on port 8000
   - Check firewall settings
   - Confirm no port conflicts

3. **STT Not Working**:
   - Verify Vosk model is properly installed
   - Check audio format (16kHz, mono, PCM)
   - Monitor debug panel for STT errors

4. **LLM Not Responding**:
   - Confirm Ollama is running
   - Check Gemma 3n model availability
   - Verify backend health endpoint

### Debug Panel Usage

1. **Accessing Debug Panel**:
   - Click settings icon in voice modal
   - Or add `?debug=true` to URL for auto-open

2. **Log Filtering**:
   - Use filter dropdown to focus on specific log levels
   - Enable debug logs for detailed information
   - Export logs for external analysis

3. **Voice Pipeline Debugging**:
   - Monitor pipeline steps in real-time
   - Check for failed steps or errors
   - Verify timing and performance metrics

## 📊 Test Results Documentation

### Test Report Template

```markdown
## Test Session Report

**Date**: [Date]
**Tester**: [Name]
**Environment**: [OS, Browser, Hardware]

### Test Results
- [ ] Backend Connectivity: PASS/FAIL
- [ ] Frontend Launch: PASS/FAIL
- [ ] Microphone Permissions: PASS/FAIL
- [ ] WebSocket Stability: PASS/FAIL
- [ ] STT Functionality: PASS/FAIL
- [ ] STT-LLM Pipeline: PASS/FAIL
- [ ] User Experience: PASS/FAIL
- [ ] Performance: PASS/FAIL

### Issues Found
1. [Issue description]
2. [Issue description]

### Debug Data
[Attach exported debug logs if issues found]
```

## 🎯 Success Criteria

The application passes testing if:
- ✅ All microphone permission flows work correctly
- ✅ WebSocket connections remain stable during use
- ✅ STT transcription is accurate and real-time
- ✅ STT to LLM pipeline works end-to-end
- ✅ Error handling provides clear user feedback
- ✅ Debug tools provide sufficient troubleshooting information
- ✅ Performance is acceptable for real-time use
- ✅ No memory leaks or resource issues

## 🚀 Deployment Readiness

After successful testing:
1. Document any platform-specific issues
2. Create deployment configuration
3. Set up monitoring and logging
4. Prepare user documentation
5. Plan rollback procedures

## 📞 Support Information

For testing issues or questions:
- Check debug panel logs first
- Export debug data for analysis
- Review FIXES_SUMMARY.md for known limitations
- Consult application console for additional error details

