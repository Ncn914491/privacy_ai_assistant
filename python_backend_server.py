#!/usr/bin/env python3
"""
🚀 Python Backend Server for Privacy AI Assistant
Handles real-time STT streaming and LLM communication.

Architecture:
- FastAPI server for HTTP endpoints
- WebSocket for real-time STT streaming
- Vosk for offline speech recognition
- Ollama client for LLM communication

Requirements:
- pip install fastapi uvicorn websockets vosk sounddevice numpy requests
"""

import asyncio
import json
import logging
import queue
import threading
import time
import wave
from pathlib import Path
from typing import Optional, Dict, Any, List
import base64
import io

import numpy as np
import sounddevice as sd
import vosk
import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 🔧 Configuration
SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = np.int16
CHUNK_SIZE = 4000
BLOCKSIZE = 2000

# Paths
VOSK_MODEL_PATH = "vosk-model-small-en-us-0.15"
DEBUG_AUDIO_DIR = Path("debug_audio")
DEBUG_AUDIO_DIR.mkdir(exist_ok=True)

# Ollama Configuration
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "gemma3n:latest"  # Standardized model name

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(title="Privacy AI Assistant Backend", version="1.0.0")

# CORS middleware for Tauri frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class STTRequest(BaseModel):
    audio_data: str  # Base64 encoded audio
    format: str = "webm"

class LLMRequest(BaseModel):
    prompt: str
    model: str = DEFAULT_MODEL
    stream: bool = False

class LLMResponse(BaseModel):
    response: str
    model: str
    success: bool
    error: Optional[str] = None

# Global Vosk instance
vosk_model = None
vosk_recognizer = None

def initialize_vosk():
    """Initialize Vosk model and recognizer."""
    global vosk_model, vosk_recognizer
    
    try:
        if not Path(VOSK_MODEL_PATH).exists():
            logger.error(f"❌ Vosk model not found: {VOSK_MODEL_PATH}")
            return False
        
        logger.info(f"🔧 Initializing Vosk model: {VOSK_MODEL_PATH}")
        vosk.SetLogLevel(-1)
        vosk_model = vosk.Model(VOSK_MODEL_PATH)
        vosk_recognizer = vosk.KaldiRecognizer(vosk_model, SAMPLE_RATE)
        
        logger.info("✅ Vosk initialized successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to initialize Vosk: {e}")
        return False

class RealtimeSTT:
    """Real-time STT processor for WebSocket streaming."""
    
    def __init__(self):
        self.is_recording = False
        self.audio_queue = queue.Queue()
        self.recognizer = None
        self.websocket = None
        self.debug_audio_data = []
        
    def start_recording(self, websocket: WebSocket):
        """Start real-time recording and processing."""
        self.websocket = websocket
        self.is_recording = True
        self.recognizer = vosk.KaldiRecognizer(vosk_model, SAMPLE_RATE)
        self.debug_audio_data = []
        
        # Start audio capture thread
        self.audio_thread = threading.Thread(target=self._audio_capture_thread)
        self.audio_thread.start()
        
        # Start processing thread
        self.processing_thread = threading.Thread(target=self._process_audio_stream)
        self.processing_thread.start()
        
        logger.info("🎤 Started real-time STT recording")
    
    def stop_recording(self):
        """Stop recording and processing."""
        self.is_recording = False
        
        if hasattr(self, 'audio_thread'):
            self.audio_thread.join(timeout=2)
        if hasattr(self, 'processing_thread'):
            self.processing_thread.join(timeout=2)
        
        # Save debug audio if needed
        if self.debug_audio_data:
            self._save_debug_audio()
        
        logger.info("⏹️ Stopped real-time STT recording")
    
    def _audio_capture_thread(self):
        """Capture audio from microphone."""
        def audio_callback(indata, frames, time, status):
            if not self.is_recording:
                return
            
            if status:
                logger.warning(f"Audio status: {status}")
            
            # Convert to int16 mono
            audio_data = indata[:, 0] if indata.shape[1] > 1 else indata.flatten()
            audio_int16 = (audio_data * 32767).astype(np.int16)
            
            # Add to queue for processing
            self.audio_queue.put(audio_int16.tobytes())
            
            # Store for debugging
            self.debug_audio_data.extend(audio_int16)
        
        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype=np.float32,
                blocksize=BLOCKSIZE,
                callback=audio_callback
            ):
                while self.is_recording:
                    time.sleep(0.1)
        except Exception as e:
            logger.error(f"❌ Audio capture error: {e}")
    
    def _process_audio_stream(self):
        """Process audio chunks with Vosk."""
        while self.is_recording:
            try:
                audio_chunk = self.audio_queue.get(timeout=0.1)
                
                if self.recognizer.AcceptWaveform(audio_chunk):
                    # Final result
                    result = json.loads(self.recognizer.Result())
                    if result.get('text', '').strip():
                        asyncio.create_task(self._send_result('final', result['text']))
                else:
                    # Partial result
                    partial = json.loads(self.recognizer.PartialResult())
                    if partial.get('partial', '').strip():
                        asyncio.create_task(self._send_result('partial', partial['partial']))
                
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"❌ Processing error: {e}")
    
    async def _send_result(self, result_type: str, text: str):
        """Send result to WebSocket client."""
        if self.websocket:
            try:
                await self.websocket.send_json({
                    'type': result_type,
                    'text': text,
                    'timestamp': time.time()
                })
                logger.info(f"📤 Sent {result_type}: {text}")
            except Exception as e:
                logger.error(f"❌ Failed to send WebSocket message: {e}")
    
    def _save_debug_audio(self):
        """Save captured audio for debugging."""
        if not self.debug_audio_data:
            return
        
        timestamp = int(time.time())
        debug_file = DEBUG_AUDIO_DIR / f"debug_audio_{timestamp}.wav"
        
        try:
            with wave.open(str(debug_file), 'wb') as wf:
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(SAMPLE_RATE)
                wf.writeframes(np.array(self.debug_audio_data, dtype=np.int16).tobytes())
            
            logger.info(f"💾 Saved debug audio: {debug_file}")
        except Exception as e:
            logger.error(f"❌ Failed to save debug audio: {e}")

# Global STT instance
realtime_stt = RealtimeSTT()

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    logger.info("🚀 Starting Privacy AI Assistant Backend...")
    
    if not initialize_vosk():
        logger.error("❌ Failed to initialize Vosk - STT will not work")
    
    # Test Ollama connection
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [model['name'] for model in models]
            logger.info(f"✅ Ollama connected. Available models: {model_names}")
            
            # Check if our default model is available
            if any(DEFAULT_MODEL in name for name in model_names):
                logger.info(f"✅ Default model {DEFAULT_MODEL} is available")
            else:
                logger.warning(f"⚠️ Default model {DEFAULT_MODEL} not found. Available: {model_names}")
        else:
            logger.error(f"❌ Ollama API returned status {response.status_code}")
    except Exception as e:
        logger.error(f"❌ Failed to connect to Ollama: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "vosk_initialized": vosk_model is not None,
        "timestamp": time.time()
    }

@app.get("/ollama/models")
async def get_ollama_models():
    """Get available Ollama models."""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            raise HTTPException(status_code=response.status_code, detail="Ollama API error")
    except requests.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Cannot connect to Ollama: {e}")

@app.post("/llm/generate")
async def generate_llm_response(request: LLMRequest) -> LLMResponse:
    """Generate LLM response via Ollama."""
    try:
        logger.info(f"🚀 LLM request: model={request.model}, prompt_length={len(request.prompt)}")

        # Prepare Ollama request
        ollama_request = {
            "model": request.model,
            "prompt": request.prompt,
            "stream": False  # Force non-streaming for this endpoint
        }

        # Send request to Ollama
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=ollama_request,
            timeout=60
        )

        if response.status_code == 200:
            result = response.json()
            llm_response = result.get('response', '').strip()

            if llm_response:
                logger.info(f"✅ LLM response generated (length: {len(llm_response)})")
                return LLMResponse(
                    response=llm_response,
                    model=request.model,
                    success=True
                )
            else:
                logger.error("❌ Empty response from Ollama")
                return LLMResponse(
                    response="",
                    model=request.model,
                    success=False,
                    error="Empty response from LLM"
                )
        else:
            error_text = response.text()
            logger.error(f"❌ Ollama API error {response.status_code}: {error_text}")
            return LLMResponse(
                response="",
                model=request.model,
                success=False,
                error=f"Ollama API error {response.status_code}: {error_text}"
            )
    
    except requests.RequestException as e:
        logger.error(f"❌ Request to Ollama failed: {e}")
        return LLMResponse(
            response="",
            model=request.model,
            success=False,
            error=f"Cannot connect to Ollama: {e}"
        )
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        return LLMResponse(
            response="",
            model=request.model,
            success=False,
            error=f"Unexpected error: {e}"
        )

@app.websocket("/llm/stream")
async def websocket_llm_stream(websocket: WebSocket):
    """WebSocket endpoint for streaming LLM responses."""
    await websocket.accept()
    logger.info("🔌 LLM WebSocket connected")

    try:
        while True:
            # Receive LLM request
            data = await websocket.receive_json()
            prompt = data.get('prompt', '')
            model = data.get('model', DEFAULT_MODEL)

            if not prompt:
                await websocket.send_json({
                    'type': 'error',
                    'data': 'Empty prompt provided'
                })
                continue

            logger.info(f"🚀 Streaming LLM request: model={model}, prompt_length={len(prompt)}")

            try:
                # Prepare Ollama streaming request
                ollama_request = {
                    "model": model,
                    "prompt": prompt,
                    "stream": True
                }

                # Send streaming request to Ollama
                response = requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json=ollama_request,
                    stream=True,
                    timeout=60
                )

                if response.status_code == 200:
                    # Stream response chunks
                    for line in response.iter_lines():
                        if line:
                            try:
                                chunk_data = json.loads(line.decode('utf-8'))
                                chunk_text = chunk_data.get('response', '')
                                is_done = chunk_data.get('done', False)

                                if chunk_text:
                                    await websocket.send_json({
                                        'type': 'chunk',
                                        'data': chunk_text
                                    })

                                if is_done:
                                    await websocket.send_json({
                                        'type': 'complete',
                                        'data': 'Stream completed'
                                    })
                                    break

                            except json.JSONDecodeError:
                                continue
                else:
                    await websocket.send_json({
                        'type': 'error',
                        'data': f'Ollama API error: {response.status_code}'
                    })

            except Exception as e:
                logger.error(f"❌ Streaming error: {e}")
                await websocket.send_json({
                    'type': 'error',
                    'data': f'Streaming error: {e}'
                })

    except WebSocketDisconnect:
        logger.info("🔌 LLM WebSocket disconnected")
    except Exception as e:
        logger.error(f"❌ LLM WebSocket error: {e}")
    finally:
        logger.info("🔌 LLM WebSocket cleanup completed")

@app.websocket("/stt/stream")
async def websocket_stt_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time STT streaming."""
    await websocket.accept()
    logger.info("🔌 STT WebSocket connected")
    
    try:
        # Start real-time STT
        realtime_stt.start_recording(websocket)
        
        # Keep connection alive and handle messages
        while True:
            try:
                message = await websocket.receive_json()
                
                if message.get('action') == 'stop':
                    logger.info("⏹️ Received stop command")
                    break
                    
            except WebSocketDisconnect:
                logger.info("🔌 STT WebSocket disconnected")
                break
            except Exception as e:
                logger.error(f"❌ WebSocket error: {e}")
                break
    
    finally:
        realtime_stt.stop_recording()
        logger.info("🔌 STT WebSocket cleanup completed")

if __name__ == "__main__":
    uvicorn.run(
        "python_backend_server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )
