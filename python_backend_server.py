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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    
    yield  # This separates startup from shutdown
    
    # Shutdown
    logger.info("🙏 Shutting down Privacy AI Assistant Backend...")

# FastAPI app with lifespan
app = FastAPI(title="Privacy AI Assistant Backend", version="1.0.0", lifespan=lifespan)

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
        model_path = Path("models/vosk/vosk-model-small-en-us-0.15")
        if not model_path.exists():
            logger.error(f"❌ Vosk model not found: {model_path}")
            return False
        
        logger.info(f"🔧 Initializing Vosk model: {model_path}")
        vosk.SetLogLevel(-1)
        stt_processor = STT(str(model_path))
        
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
        # Decode base64 audio data and save temporarily for STT.transcribe
        audio_bytes = base64.b64decode(request.audio_data)
        temp_audio_path = DEBUG_AUDIO_DIR / f"temp_upload_{int(time.time())}.wav"
        
        with open(temp_audio_path, "wb") as f:
            f.write(audio_bytes)

        # Use the new STT class to transcribe
        transcription_result = stt_processor.transcribe(str(temp_audio_path))
        
        # Clean up temporary file
        os.remove(temp_audio_path)

        if transcription_result["success"]:
            transcript = transcription_result["text"]
            logger.info(f"Transcription successful: {transcript}")
            return STTResponse(text=transcript, success=True)
        else:
            logger.error(f"Transcription failed: {transcription_result['error']}")
            return STTResponse(text="", success=False, error=transcription_result["error"])

    except base64.binascii.Error:
        logger.error("Invalid Base64 data received.")
        raise HTTPException(status_code=400, detail="Invalid Base64 data")
    except Exception as e:
        logger.error(f"Unexpected error during file transcription: {e}", exc_info=True)
        return STTResponse(text="", success=False, error=f"An unexpected error occurred: {e}")

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
        logger.info(f"🚀 Chat LLM request: chat_id={request.chat_id}, model={request.model}")

        # Get context for the chat session
        context_data = session_manager.get_context_for_session(
            request.chat_id,
            request.system_prompt,
            request.model
        )

        if not context_data:
            return LLMResponse(
                response="",
                model=request.model,
                success=False,
                error=f"Chat session {request.chat_id} not found"
            )

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

        logger.info(f"📝 Context: {len(context_messages)} messages, {context_data['total_tokens']} tokens ({context_data['token_utilization']:.1f}% utilization)")

        # Prepare Ollama request
        ollama_request = {
            "model": request.model,
            "prompt": formatted_prompt,
            "stream": request.stream
        }

        # Send request to Ollama
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=ollama_request,
            timeout=120  # Longer timeout for context-aware generation
        )

        if response.status_code == 200:
            result = response.json()
            llm_response = result.get('response', '').strip()

            if llm_response:
                # Add the assistant's response to the chat session
                session_manager.add_message(request.chat_id, llm_response, "assistant", request.model)

                logger.info(f"✅ Chat LLM response generated (length: {len(llm_response)})")
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
    """WebSocket endpoint for real-time STT streaming with improved stability."""
    await websocket.accept()
    connection_id = f"stt_{int(time.time())}_{id(websocket)}"
    logger.info(f"🔌 STT WebSocket connected: {connection_id}")
    
    # Connection state tracking
    connection_state = "connected"
    error_count = 0
    max_errors = 5
    last_activity = time.time()
    recognizer = None
    heartbeat_task = None
    
    try:
        # Check if Vosk is initialized
        if not stt_processor:
            await websocket.send_json({
                'type': 'error',
                'text': 'Vosk not initialized',
                'timestamp': time.time(),
                'connection_id': connection_id
            })
            logger.error("❌ Vosk instance not initialized for STT streaming")
            return

        # Initialize recognizer for this session
        recognizer = vosk.KaldiRecognizer(stt_processor.model, SAMPLE_RATE)
        logger.info(f"🎤 Started real-time STT session: {connection_id}")

        # Send connection confirmation
        await websocket.send_json({
            'type': 'connected',
            'connection_id': connection_id,
            'timestamp': time.time()
        })

        # Start heartbeat task
        async def heartbeat_loop():
            try:
                while connection_state == "connected":
                    await asyncio.sleep(10)  # Heartbeat every 10 seconds
                    if websocket:
                        current_time = time.time()
                        await websocket.send_json({
                            'type': 'heartbeat',
                            'timestamp': current_time,
                            'connection_id': connection_id,
                            'last_activity': last_activity
                        })
            except asyncio.CancelledError:
                logger.info(f"💓 Heartbeat cancelled for {connection_id}")
            except Exception as e:
                logger.error(f"❌ Heartbeat error: {e}")

        heartbeat_task = asyncio.create_task(heartbeat_loop())

        # Main message loop with improved error handling
        while connection_state == "connected":
            try:
                # Try to receive binary data first with timeout
                try:
                    audio_data = await asyncio.wait_for(
                        websocket.receive_bytes(), 
                        timeout=30.0  # 30 second timeout
                    )
                    
                    last_activity = time.time()
                    logger.debug(f"📥 Received audio data: {len(audio_data)} bytes")

                    try:
                        # Process audio data with Vosk
                        if recognizer.AcceptWaveform(audio_data):
                            # Final result
                            result = json.loads(recognizer.Result())
                            if result.get('text', '').strip():
                                await websocket.send_json({
                                    'type': 'final',
                                    'text': result['text'],
                                    'timestamp': time.time(),
                                    'connection_id': connection_id
                                })
                                logger.info(f"🎯 Final result: {result['text']}")
                        else:
                            # Partial result
                            partial = json.loads(recognizer.PartialResult())
                            if partial.get('partial', '').strip():
                                await websocket.send_json({
                                    'type': 'partial',
                                    'text': partial['partial'],
                                    'timestamp': time.time(),
                                    'connection_id': connection_id
                                })
                        
                        # Reset error count on successful processing
                        error_count = 0
                        
                    except Exception as vosk_error:
                        error_count += 1
                        logger.error(f"❌ Vosk processing error ({error_count}/{max_errors}): {vosk_error}")
                        
                        await websocket.send_json({
                            'type': 'error',
                            'text': f'Speech processing error: {vosk_error}',
                            'timestamp': time.time(),
                            'connection_id': connection_id
                        })
                        
                        if error_count >= max_errors:
                            logger.error(f"❌ Too many Vosk errors, closing connection {connection_id}")
                            connection_state = "error"
                            break

                except asyncio.TimeoutError:
                    # Send heartbeat on timeout
                    current_time = time.time()
                    if current_time - last_activity > 60:  # 60 seconds of inactivity
                        logger.warning(f"⚠️ No activity for 60s on connection {connection_id}, closing")
                        break
                    
                    await websocket.send_json({
                        'type': 'heartbeat',
                        'timestamp': current_time,
                        'connection_id': connection_id
                    })
                    continue
                    
                except Exception:
                    # If binary data fails, try JSON (for control messages)
                    try:
                        control_message = await asyncio.wait_for(
                            websocket.receive_json(),
                            timeout=1.0
                        )
                        
                        if control_message.get('action') == 'stop':
                            logger.info(f"⏹️ Received stop command for {connection_id}")
                            break
                        elif control_message.get('action') == 'ping':
                            await websocket.send_json({
                                'type': 'pong',
                                'timestamp': time.time(),
                                'connection_id': connection_id
                            })
                            
                    except asyncio.TimeoutError:
                        # No message received, continue
                        continue
                    except Exception as json_error:
                        logger.debug(f"❌ No valid message received: {json_error}")
                        # Don't break immediately, might be temporary
                        await asyncio.sleep(0.1)

            except WebSocketDisconnect:
                logger.info(f"🔌 STT WebSocket disconnected: {connection_id}")
                break
            except Exception as e:
                error_count += 1
                logger.error(f"❌ WebSocket error ({error_count}/{max_errors}) for {connection_id}: {e}")
                
                if error_count >= max_errors:
                    logger.error(f"❌ Too many WebSocket errors, closing connection {connection_id}")
                    break
                
                # Brief pause before retrying
                await asyncio.sleep(0.1)

    finally:
        # Clean up
        connection_state = "disconnected"
        
        # Cancel heartbeat task
        if heartbeat_task and not heartbeat_task.done():
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        
        logger.info(f"🔌 STT WebSocket cleanup completed: {connection_id}")

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
