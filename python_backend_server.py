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
import os
import base64
import tempfile
import logging
import traceback
from datetime import datetime
from pydub import AudioSegment
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

from stt.stt import STT # Import the new STT class
from chat_sessions import (
    session_manager,
    ChatSession,
    ChatMessage,
    ChatSessionSummary,
    CreateChatRequest,
    CreateChatResponse,
    RenameChatRequest,
    AddMessageRequest,
    ChatListResponse,
    ChatSessionResponse
)
from hardware_detection import (
    get_runtime_config,
    get_hardware_summary,
    hardware_detector,
    RuntimeConfig,
    HardwareInfo
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('backend.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)

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

# Lifespan context manager
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Startup
    logger.info("🚀 Starting Privacy AI Assistant Backend...")

    if not initialize_vosk():
        logger.error("❌ Failed to initialize Vosk - STT will not work")

    # Test Ollama connection with timeout and fallback
    ollama_status = {"connected": False, "error": None, "models": [], "default_model_available": False}
    try:
        logger.info("🔍 Testing Ollama connection...")
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if response.status_code == 200:
            models = response.json().get('models', [])
            model_names = [model['name'] for model in models]
            ollama_status["connected"] = True
            ollama_status["models"] = model_names
            logger.info(f"✅ Ollama connected. Available models: {model_names}")

            # Check if our default model is available
            if any(DEFAULT_MODEL in name for name in model_names):
                ollama_status["default_model_available"] = True
                logger.info(f"✅ Default model {DEFAULT_MODEL} is available")
            else:
                logger.warning(f"⚠️ Default model {DEFAULT_MODEL} not found. Available: {model_names}")
        else:
            ollama_status["error"] = f"API returned status {response.status_code}"
            logger.warning(f"⚠️ Ollama API returned status {response.status_code} - continuing startup")
    except requests.exceptions.Timeout:
        ollama_status["error"] = "Connection timeout"
        logger.warning("⚠️ Ollama connection timeout - continuing startup without Ollama")
    except requests.exceptions.ConnectionError:
        ollama_status["error"] = "Connection refused"
        logger.warning("⚠️ Ollama connection refused - continuing startup without Ollama")
    except Exception as e:
        ollama_status["error"] = str(e)
        logger.warning(f"⚠️ Failed to connect to Ollama: {e} - continuing startup")

    # Store Ollama status in app state for UI access
    app.state.ollama_status = ollama_status
    logger.info("🚀 Backend startup completed - ready to serve requests")

    yield  # This separates startup from shutdown

    # Shutdown
    logger.info("🙏 Shutting down Privacy AI Assistant Backend...")

# FastAPI app with lifespan
app = FastAPI(title="Privacy AI Assistant Backend", version="1.0.0", lifespan=lifespan)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors."""
    error_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    logger.error(f"🚨 Unhandled exception [{error_id}]: {str(exc)}", exc_info=True)

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "error_id": error_id,
            "message": "An unexpected error occurred. Please check the server logs."
        }
    )

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
    sample_rate: Optional[int] = 16000  # Sample rate for audio processing
    channels: Optional[int] = 1  # Number of audio channels

class STTResponse(BaseModel):
    text: str
    success: bool
    error: Optional[str] = None

class LLMRequest(BaseModel):
    prompt: str
    model: str = DEFAULT_MODEL
    stream: bool = False

class LLMResponse(BaseModel):
    response: str
    model: str
    success: bool
    error: Optional[str] = None

# Global STT instance
stt_processor: Optional[STT] = None

def initialize_vosk():
    """Initialize Vosk model and recognizer."""
    global stt_processor
    
    try:
        model_path = Path("models/vosk/vosk-model-en-us-0.22-lgraph")
        if not model_path.exists():
            logger.error(f"❌ Vosk model not found: {model_path}")
            return False
        
        logger.info(f"🔧 Initializing Vosk model: {model_path}")
        vosk.SetLogLevel(-1)  # Suppress Vosk debug output

        # Initialize with better settings for accuracy
        stt_processor = STT(str(model_path))

        # Test the model with a simple phrase
        logger.info("🧪 Testing Vosk model initialization...")
        test_result = stt_processor.model
        if test_result:
            logger.info("✅ Vosk model loaded and tested successfully")
        
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
        self.loop = None
        
    def start_recording(self, websocket: WebSocket, loop: asyncio.AbstractEventLoop):
        """Start real-time recording and processing."""
        global stt_processor
        if not stt_processor:
            logger.error("Vosk STT processor not initialized, cannot start real-time STT.")
            return

        self.websocket = websocket
        self.loop = loop
        self.is_recording = True
        self.recognizer = vosk.KaldiRecognizer(stt_processor.model, SAMPLE_RATE) # Use the model from stt_processor
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
                        self._send_result_threadsafe('final', result['text'])
                else:
                    # Partial result
                    partial = json.loads(self.recognizer.PartialResult())
                    if partial.get('partial', '').strip():
                        self._send_result_threadsafe('partial', partial['partial'])
                
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"❌ Processing error: {e}")

    def _send_result_threadsafe(self, result_type: str, text: str):
        """Send result to WebSocket client in a thread-safe manner."""
        if self.loop and self.websocket:
            future = asyncio.run_coroutine_threadsafe(
                self._send_result(result_type, text),
                self.loop
            )
            try:
                future.result(timeout=2)  # Wait for the result
            except Exception as e:
                logger.error(f"❌ Error sending WebSocket message from thread: {e}")
    
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


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "vosk_initialized": stt_processor is not None,
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

@app.post("/stt/transcribe", response_model=STTResponse)
async def transcribe_audio_file(request: STTRequest):
    """Transcribe an audio file using Vosk."""
    if not stt_processor:
        logger.error("Vosk STT processor not initialized, cannot transcribe.")
        return STTResponse(text="", success=False, error="Vosk STT processor not initialized")

    try:
        logger.info(f"🎵 Processing audio transcription request, format: {request.format}")
        
        # Decode base64 audio data with validation
        try:
            audio_bytes = base64.b64decode(request.audio_data)
            logger.info(f"📊 Decoded audio data: {len(audio_bytes)} bytes")
        except Exception as decode_error:
            logger.error(f"❌ Base64 decode failed: {decode_error}")
            return STTResponse(text="", success=False, error=f"Invalid base64 audio data: {decode_error}")

        # Validate audio size
        if len(audio_bytes) == 0:
            logger.error("❌ Empty audio data received")
            return STTResponse(text="", success=False, error="Empty audio data received")

        max_audio_size = 50 * 1024 * 1024  # 50MB limit
        if len(audio_bytes) > max_audio_size:
            logger.error(f"❌ Audio file too large: {len(audio_bytes)} bytes")
            return STTResponse(text="", success=False, error=f"Audio file too large. Maximum size is {max_audio_size // (1024*1024)}MB")
        
        # Convert audio to proper WAV format using pydub
        try:
            # Load audio from bytes with improved format handling
            input_buffer = io.BytesIO(audio_bytes)

            # Handle different audio formats
            format_to_use = request.format.lower()
            if format_to_use in ['webm', 'ogg']:
                # For WebM/OGG, try different approaches
                try:
                    audio_segment = AudioSegment.from_file(input_buffer, format="webm")
                except:
                    input_buffer.seek(0)
                    try:
                        audio_segment = AudioSegment.from_file(input_buffer, format="ogg")
                    except:
                        input_buffer.seek(0)
                        audio_segment = AudioSegment.from_file(input_buffer)  # Auto-detect
            elif format_to_use == 'wav':
                audio_segment = AudioSegment.from_file(input_buffer, format="wav")
            elif format_to_use in ['mp4', 'm4a']:
                audio_segment = AudioSegment.from_file(input_buffer, format="mp4")
            else:
                # Let pydub auto-detect the format
                audio_segment = AudioSegment.from_file(input_buffer)
            
            # Log original audio properties
            logger.info(f"📊 Original audio: {audio_segment.frame_rate}Hz, {audio_segment.channels} channels, {audio_segment.sample_width} bytes/sample")

            # Convert to the required format for Vosk (16kHz mono 16-bit)
            target_sample_rate = request.sample_rate or SAMPLE_RATE
            target_channels = request.channels or CHANNELS

            audio_segment = (
                audio_segment
                .set_frame_rate(target_sample_rate)  # Use requested or default 16000 Hz
                .set_channels(target_channels)       # Use requested or default mono
                .set_sample_width(2)                 # 16-bit PCM
            )

            logger.info(f"📊 Converted audio: {audio_segment.frame_rate}Hz, {audio_segment.channels} channels, {audio_segment.sample_width} bytes/sample")
            
            # Export to WAV in memory
            wav_buffer = io.BytesIO()
            audio_segment.export(wav_buffer, format="wav")
            wav_buffer.seek(0)
            
            logger.info(f"✅ Audio converted successfully: {len(wav_buffer.getvalue())} bytes WAV")
            
            # Use the new transcribe_filelike method
            transcription_result = stt_processor.transcribe_filelike(wav_buffer)
            
        except Exception as audio_error:
            logger.error(f"❌ Audio conversion failed: {audio_error}")
            # Fallback: save as temp file and try original method
            temp_audio_path = DEBUG_AUDIO_DIR / f"temp_upload_{int(time.time())}.{request.format}"
            try:
                with open(temp_audio_path, "wb") as f:
                    f.write(audio_bytes)
                
                # Try to convert with pydub file-based approach
                audio_segment = AudioSegment.from_file(str(temp_audio_path))
                audio_segment = (
                    audio_segment
                    .set_frame_rate(SAMPLE_RATE)
                    .set_channels(CHANNELS)
                    .set_sample_width(2)
                )
                
                processed_path = DEBUG_AUDIO_DIR / f"processed_{int(time.time())}.wav"
                audio_segment.export(str(processed_path), format="wav")
                
                transcription_result = stt_processor.transcribe(str(processed_path))
                
                # Cleanup
                os.remove(temp_audio_path)
                if transcription_result["success"]:
                    os.remove(processed_path)
                else:
                    logger.error(f"Saved failed processed audio: {processed_path}")
                    
            except Exception as fallback_error:
                logger.error(f"❌ Fallback audio processing failed: {fallback_error}")
                return STTResponse(text="", success=False, error=f"Audio processing failed: {fallback_error}")
        
        if transcription_result["success"]:
            transcript = transcription_result["text"].strip()
            if transcript:
                logger.info(f"✅ Transcription successful: '{transcript}'")
                return STTResponse(text=transcript, success=True)
            else:
                logger.warning("⚠️ Transcription returned empty text")
                return STTResponse(text="", success=False, error="No speech detected in audio")
        else:
            logger.error(f"❌ Transcription failed: {transcription_result['error']}")
            return STTResponse(text="", success=False, error=transcription_result["error"])

    except base64.binascii.Error:
        logger.error("❌ Invalid Base64 data received.")
        return STTResponse(text="", success=False, error="Invalid Base64 audio data")
    except Exception as e:
        logger.error(f"❌ Unexpected error during file transcription: {e}", exc_info=True)
        return STTResponse(text="", success=False, error=f"Unexpected error: {e}")

class ChatLLMRequest(BaseModel):
    chat_id: str
    prompt: str
    model: str = DEFAULT_MODEL
    stream: bool = False
    system_prompt: Optional[str] = None

@app.post("/llm/generate")
async def generate_llm_response(request: LLMRequest) -> LLMResponse:
    """Generate LLM response via Ollama (legacy endpoint)."""
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

@app.post("/llm/chat-generate")
async def generate_chat_llm_response(request: ChatLLMRequest) -> LLMResponse:
    """Generate context-aware LLM response for a chat session."""
    try:
        logger.info(f"🚀 [LLM PIPELINE] Chat LLM request: chat_id={request.chat_id}, model={request.model}")
        logger.info(f"📝 [LLM PIPELINE] Received prompt from STT: '{request.prompt[:100]}{'...' if len(request.prompt) > 100 else ''}'")

        # Get context for the chat session
        context_data = session_manager.get_context_for_session(
            request.chat_id,
            request.system_prompt,
            request.model
        )

        if not context_data:
            logger.error(f"❌ [LLM PIPELINE] Chat session {request.chat_id} not found")
            return LLMResponse(
                response="",
                model=request.model,
                success=False,
                error=f"Chat session {request.chat_id} not found"
            )

        logger.info(f"🗂️ [LLM PIPELINE] Context loaded: {len(context_data['messages'])} messages")

        # Add the new user message to context
        context_messages = context_data["messages"]
        context_messages.append({
            "role": "user",
            "content": request.prompt
        })

        # Format messages for Ollama
        formatted_prompt = ""
        for msg in context_messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                formatted_prompt += f"System: {content}\n\n"
            elif role == "user":
                formatted_prompt += f"User: {content}\n\n"
            elif role == "assistant":
                formatted_prompt += f"Assistant: {content}\n\n"

        formatted_prompt += "Assistant: "

        logger.info(f"📝 [LLM PIPELINE] Context: {len(context_messages)} messages, {context_data['total_tokens']} tokens ({context_data['token_utilization']:.1f}% utilization)")
        logger.info(f"🤖 [LLM PIPELINE] Sending request to Ollama with {len(formatted_prompt)} character prompt")

        # Prepare Ollama request
        ollama_request = {
            "model": request.model,
            "prompt": formatted_prompt,
            "stream": request.stream
        }

        # Send request to Ollama
        logger.info(f"🌐 [LLM PIPELINE] Making request to {OLLAMA_BASE_URL}/api/generate")
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=ollama_request,
            timeout=120  # Longer timeout for context-aware generation
        )

        logger.info(f"📡 [LLM PIPELINE] Ollama response status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            llm_response = result.get('response', '').strip()
            logger.info(f"📤 [LLM PIPELINE] Raw Ollama response length: {len(llm_response)}")

            if llm_response:
                # Add the assistant's response to the chat session
                logger.info(f"💾 [LLM PIPELINE] Saving response to chat session {request.chat_id}")
                session_manager.add_message(request.chat_id, llm_response, "assistant", request.model)

                logger.info(f"✅ [LLM PIPELINE] Chat LLM response generated successfully (length: {len(llm_response)})")
                logger.info(f"🎯 [LLM PIPELINE] Response preview: '{llm_response[:100]}{'...' if len(llm_response) > 100 else ''}'")
                
                return LLMResponse(
                    response=llm_response,
                    model=request.model,
                    success=True
                )
            else:
                logger.error("❌ [LLM PIPELINE] Empty response from Ollama")
                return LLMResponse(
                    response="",
                    model=request.model,
                    success=False,
                    error="Empty response from LLM"
                )
        else:
            error_text = response.text()
            logger.error(f"❌ [LLM PIPELINE] Ollama API error {response.status_code}: {error_text}")
            return LLMResponse(
                response="",
                model=request.model,
                success=False,
                error=f"Ollama API error {response.status_code}: {error_text}"
            )

    except requests.RequestException as e:
        logger.error(f"❌ [LLM PIPELINE] Request to Ollama failed: {e}")
        return LLMResponse(
            response="",
            model=request.model,
            success=False,
            error=f"Cannot connect to Ollama: {e}"
        )
    except Exception as e:
        logger.error(f"❌ [LLM PIPELINE] Unexpected error: {e}", exc_info=True)
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

async def _stt_listener(websocket: WebSocket, recognizer):
    """Handle incoming audio data and control messages"""
    try:
        while True:
            message = await websocket.receive()
            
            if message["type"] == "websocket.receive":
                if message.get("bytes") is not None:
                    # Handle binary audio data
                    audio_data = message["bytes"]
                    logger.debug(f"📥 Received audio data: {len(audio_data)} bytes")
                    
                    try:
                        if recognizer.AcceptWaveform(audio_data):
                            # Final result
                            result = json.loads(recognizer.Result())
                            if result.get('text', '').strip():
                                await websocket.send_json({
                                    'type': 'final',
                                    'text': result['text'],
                                    'timestamp': time.time()
                                })
                                logger.info(f"🎯 Final result: {result['text']}")
                        else:
                            # Partial result
                            partial = json.loads(recognizer.PartialResult())
                            if partial.get('partial', '').strip():
                                await websocket.send_json({
                                    'type': 'partial',
                                    'text': partial['partial'],
                                    'timestamp': time.time()
                                })
                    except Exception as vosk_error:
                        logger.error(f"❌ Vosk processing error: {vosk_error}")
                        await websocket.send_json({
                            'type': 'error',
                            'text': f'Speech processing error: {vosk_error}',
                            'timestamp': time.time()
                        })
                
                elif message.get("text") is not None:
                    # Handle JSON control messages
                    try:
                        control_message = json.loads(message["text"])
                        if control_message.get('action') == 'stop':
                            logger.info("⏹️ Received stop command")
                            break
                        elif control_message.get('type') == 'pong':
                            logger.debug("🏓 Received pong")
                    except json.JSONDecodeError:
                        logger.warning("⚠️ Invalid JSON control message")
            
            elif message["type"] in ("websocket.disconnect", "websocket.close"):
                logger.info("🔌 WebSocket disconnected")
                break
                
    except Exception as e:
        logger.error(f"❌ STT listener error: {e}")
        raise

async def _stt_ping_keepalive(websocket: WebSocket):
    """Send periodic ping messages to keep connection alive"""
    try:
        while True:
            await asyncio.sleep(10)  # Ping every 10 seconds
            try:
                await websocket.send_json({
                    'type': 'ping',
                    'timestamp': time.time()
                })
                logger.debug("🏓 Sent ping")
            except Exception as ping_error:
                logger.error(f"❌ Failed to send ping: {ping_error}")
                break
    except asyncio.CancelledError:
        logger.debug("🏓 Ping task cancelled")
    except Exception as e:
        logger.error(f"❌ Ping keepalive error: {e}")

@app.websocket("/stt/stream")
async def websocket_stt_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time STT streaming with improved stability."""
    await websocket.accept()
    logger.info("🔌 STT WebSocket connected")

    try:
        # Check if Vosk is initialized
        if not stt_processor:
            await websocket.send_json({
                'type': 'error',
                'message': 'Vosk not initialized',
                'timestamp': time.time()
            })
            logger.error("❌ Vosk instance not initialized for STT streaming")
            return

        # Initialize recognizer for this session
        recognizer = vosk.KaldiRecognizer(stt_processor.model, SAMPLE_RATE)
        logger.info("🎤 Started real-time STT session")

        # Send ready signal
        await websocket.send_json({
            'type': 'ready',
            'message': 'STT WebSocket ready',
            'timestamp': time.time()
        })

        # Start listener and ping tasks
        listener_task = asyncio.create_task(_stt_listener(websocket, recognizer))
        ping_task = asyncio.create_task(_stt_ping_keepalive(websocket))

        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [listener_task, ping_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel remaining tasks
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    except Exception as e:
        logger.error(f"❌ STT WebSocket error: {e}")
        try:
            await websocket.send_json({
                'type': 'error',
                'text': f'WebSocket error: {e}',
                'timestamp': time.time()
            })
        except:
            pass  # Connection might be closed
    finally:
        logger.info("🔌 STT WebSocket cleanup completed")

# ===== TEXT-TO-SPEECH ENDPOINTS =====

class TTSRequest(BaseModel):
    text: str
    voice: str = "en"
    speed: float = 1.0

class TTSResponse(BaseModel):
    success: bool
    audio_data: Optional[str] = None  # Base64 encoded audio
    error: Optional[str] = None

@app.post("/tts/synthesize", response_model=TTSResponse)
async def synthesize_speech(request: TTSRequest):
    """Synthesize speech from text using pyttsx3."""
    try:
        import pyttsx3
        import tempfile
        import base64

        logger.info(f"🔊 Synthesizing speech: {request.text[:50]}...")

        # Initialize TTS engine
        engine = pyttsx3.init()

        # Set properties
        engine.setProperty('rate', int(150 * request.speed))  # Speed
        engine.setProperty('volume', 0.9)  # Volume (0.0 to 1.0)

        # Get available voices and set voice
        voices = engine.getProperty('voices')
        if voices:
            # Try to find English voice
            for voice in voices:
                if 'english' in voice.name.lower() or 'en' in voice.id.lower():
                    engine.setProperty('voice', voice.id)
                    break

        # Create temporary file for audio output
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_path = temp_file.name

        try:
            # Save speech to file
            engine.save_to_file(request.text, temp_path)
            engine.runAndWait()

            # Read the audio file and encode as base64
            with open(temp_path, 'rb') as audio_file:
                audio_data = base64.b64encode(audio_file.read()).decode('utf-8')

            logger.info("✅ Speech synthesis completed")

            return TTSResponse(
                success=True,
                audio_data=audio_data
            )

        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    except ImportError:
        logger.error("❌ pyttsx3 not installed")
        return TTSResponse(
            success=False,
            error="TTS engine not available. Please install pyttsx3: pip install pyttsx3"
        )
    except Exception as e:
        logger.error(f"❌ TTS synthesis failed: {e}")
        return TTSResponse(
            success=False,
            error=f"Speech synthesis failed: {e}"
        )

# ===== CHAT SESSION ENDPOINTS =====

@app.post("/chats/create", response_model=CreateChatResponse)
async def create_chat_session(request: CreateChatRequest):
    """Create a new chat session."""
    try:
        session = session_manager.create_session(request.title)
        return CreateChatResponse(
            chat_id=session.id,
            title=session.title,
            success=True
        )
    except Exception as e:
        logger.error(f"❌ Failed to create chat session: {e}")
        return CreateChatResponse(
            chat_id="",
            title="",
            success=False,
            error=str(e)
        )

@app.get("/chats/list", response_model=ChatListResponse)
async def list_chat_sessions():
    """List all chat sessions."""
    try:
        sessions = session_manager.list_sessions()
        return ChatListResponse(
            sessions=sessions,
            success=True
        )
    except Exception as e:
        logger.error(f"❌ Failed to list chat sessions: {e}")
        return ChatListResponse(
            sessions=[],
            success=False,
            error=str(e)
        )

@app.get("/chats/{chat_id}", response_model=ChatSessionResponse)
async def get_chat_session(chat_id: str):
    """Get a specific chat session."""
    try:
        session = session_manager.load_session(chat_id)
        if session:
            return ChatSessionResponse(
                session=session,
                success=True
            )
        else:
            return ChatSessionResponse(
                session=None,
                success=False,
                error=f"Chat session {chat_id} not found"
            )
    except Exception as e:
        logger.error(f"❌ Failed to get chat session {chat_id}: {e}")
        return ChatSessionResponse(
            session=None,
            success=False,
            error=str(e)
        )

@app.post("/chats/{chat_id}/messages")
async def add_message_to_chat(chat_id: str, request: AddMessageRequest):
    """Add a message to a chat session."""
    try:
        message = session_manager.add_message(
            chat_id,
            request.content,
            request.role,
            request.model or "gemma3n:latest"
        )
        if message:
            return {
                "success": True,
                "message": message.dict()
            }
        else:
            return {
                "success": False,
                "error": f"Failed to add message to chat {chat_id}"
            }
    except Exception as e:
        logger.error(f"❌ Failed to add message to chat {chat_id}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.put("/chats/{chat_id}/rename")
async def rename_chat_session(chat_id: str, request: RenameChatRequest):
    """Rename a chat session."""
    try:
        success = session_manager.rename_session(chat_id, request.new_title)
        return {
            "success": success,
            "error": None if success else f"Failed to rename chat {chat_id}"
        }
    except Exception as e:
        logger.error(f"❌ Failed to rename chat {chat_id}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.delete("/chats/{chat_id}")
async def delete_chat_session(chat_id: str):
    """Delete a chat session."""
    try:
        success = session_manager.delete_session(chat_id)
        return {
            "success": success,
            "error": None if success else f"Failed to delete chat {chat_id}"
        }
    except Exception as e:
        logger.error(f"❌ Failed to delete chat {chat_id}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/chats/{chat_id}/context")
async def get_chat_context(chat_id: str, system_prompt: Optional[str] = None, model: Optional[str] = None):
    """Get token-aware context window for a chat session."""
    try:
        context_data = session_manager.get_context_for_session(
            chat_id,
            system_prompt,
            model or "gemma3n:latest"
        )
        if context_data:
            return {
                "success": True,
                **context_data
            }
        else:
            return {
                "success": False,
                "error": f"Chat session {chat_id} not found"
            }
    except Exception as e:
        logger.error(f"❌ Failed to get context for chat {chat_id}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

# ===== HARDWARE DETECTION ENDPOINTS =====

@app.get("/hardware/info")
async def get_hardware_info():
    """Get detailed hardware information."""
    try:
        summary = get_hardware_summary()
        return {
            "success": True,
            "data": summary
        }
    except Exception as e:
        logger.error(f"❌ Failed to get hardware info: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/hardware/runtime-config")
async def get_optimal_runtime_config():
    """Get optimal runtime configuration for Ollama."""
    try:
        config = get_runtime_config()
        return {
            "success": True,
            "config": {
                "mode": config.mode.value,
                "reason": config.reason,
                "ollama_args": config.ollama_args,
                "recommended_models": config.recommended_models,
                "hardware_info": {
                    "cpu_cores": config.hardware_info.cpu_cores,
                    "ram_total_mb": config.hardware_info.ram_total,
                    "ram_available_mb": config.hardware_info.ram_available,
                    "has_gpu": config.hardware_info.has_gpu,
                    "gpu_name": config.hardware_info.gpu_name,
                    "vram_total_mb": config.hardware_info.vram_total,
                    "vram_available_mb": config.hardware_info.vram_available,
                    "platform": config.hardware_info.platform_info
                }
            }
        }
    except Exception as e:
        logger.error(f"❌ Failed to get runtime config: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/hardware/refresh")
async def refresh_hardware_detection():
    """Refresh hardware detection (useful for hot-plugged GPUs)."""
    try:
        # Re-detect hardware
        hardware_detector._detect_basic_info()
        hardware_detector.detect_gpu()

        # Get updated config
        config = get_runtime_config()

        return {
            "success": True,
            "message": "Hardware detection refreshed",
            "config": {
                "mode": config.mode.value,
                "reason": config.reason
            }
        }
    except Exception as e:
        logger.error(f"❌ Failed to refresh hardware detection: {e}")
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    uvicorn.run(
        "python_backend_server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )
