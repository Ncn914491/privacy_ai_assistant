#!/usr/bin/env python3
"""
🔧 WebSocket Stability Fixes for Privacy AI Assistant
Addresses connection stability issues in real-time STT streaming.

Key improvements:
1. Better connection lifecycle management
2. Proper error handling and recovery
3. Audio buffer management
4. Heartbeat mechanism
5. Graceful disconnection handling
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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ImprovedRealtimeSTT:
    """Improved real-time STT processor with better stability."""
    
    def __init__(self, model_path: str, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.model_path = model_path
        self.model = None
        self.is_recording = False
        self.audio_queue = queue.Queue(maxsize=100)  # Limit queue size to prevent memory issues
        self.recognizer = None
        self.websocket = None
        self.debug_audio_data = []
        self.loop = None
        self.audio_thread = None
        self.processing_thread = None
        self.heartbeat_task = None
        self.last_activity = time.time()
        self.connection_id = None
        
        # Connection state tracking
        self.connection_state = "disconnected"  # disconnected, connecting, connected, error
        self.error_count = 0
        self.max_errors = 5
        
        # Audio processing settings
        self.chunk_size = 4000
        self.blocksize = 2000
        self.channels = 1
        self.dtype = np.int16
        
        # Initialize model
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialize Vosk model with error handling."""
        try:
            if not os.path.exists(self.model_path):
                raise FileNotFoundError(f"Vosk model not found: {self.model_path}")
            
            logger.info(f"🔧 Initializing Vosk model: {self.model_path}")
            vosk.SetLogLevel(-1)  # Reduce Vosk logging
            self.model = vosk.Model(self.model_path)
            logger.info("✅ Vosk model initialized successfully")
        except Exception as e:
            logger.error(f"❌ Failed to initialize Vosk model: {e}")
            raise
    
    async def start_session(self, websocket: WebSocket, connection_id: str):
        """Start a new STT session with improved error handling."""
        try:
            self.connection_id = connection_id
            self.websocket = websocket
            self.loop = asyncio.get_event_loop()
            self.is_recording = True
            self.connection_state = "connecting"
            self.error_count = 0
            self.last_activity = time.time()
            
            # Initialize recognizer for this session
            if not self.model:
                raise RuntimeError("Vosk model not initialized")
            
            self.recognizer = vosk.KaldiRecognizer(self.model, self.sample_rate)
            self.debug_audio_data = []
            
            # Clear any existing queue data
            while not self.audio_queue.empty():
                try:
                    self.audio_queue.get_nowait()
                except queue.Empty:
                    break
            
            # Start processing thread first
            self.processing_thread = threading.Thread(
                target=self._process_audio_stream,
                name=f"STT-Processing-{connection_id}"
            )
            self.processing_thread.daemon = True
            self.processing_thread.start()
            
            # Start heartbeat task
            self.heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            
            self.connection_state = "connected"
            logger.info(f"🎤 Started STT session {connection_id}")
            
            # Send connection confirmation
            await self._send_message({
                'type': 'connected',
                'connection_id': connection_id,
                'timestamp': time.time()
            })
            
        except Exception as e:
            logger.error(f"❌ Failed to start STT session: {e}")
            self.connection_state = "error"
            await self._send_error(f"Failed to start session: {e}")
            raise
    
    async def stop_session(self):
        """Stop the STT session with proper cleanup."""
        logger.info(f"⏹️ Stopping STT session {self.connection_id}")
        
        self.is_recording = False
        self.connection_state = "disconnected"
        
        # Cancel heartbeat task
        if self.heartbeat_task and not self.heartbeat_task.done():
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass
        
        # Wait for threads to finish
        if self.processing_thread and self.processing_thread.is_alive():
            self.processing_thread.join(timeout=2)
        
        # Save debug audio if needed
        if self.debug_audio_data:
            self._save_debug_audio()
        
        # Clear resources
        self.websocket = None
        self.recognizer = None
        self.debug_audio_data = []
        
        logger.info(f"✅ STT session {self.connection_id} stopped")
    
    async def process_audio_data(self, audio_data: bytes):
        """Process incoming audio data with error handling."""
        try:
            if not self.is_recording or self.connection_state != "connected":
                return
            
            self.last_activity = time.time()
            
            # Add to queue with timeout to prevent blocking
            try:
                self.audio_queue.put(audio_data, timeout=0.1)
                logger.debug(f"📥 Queued audio data: {len(audio_data)} bytes")
            except queue.Full:
                logger.warning("⚠️ Audio queue full, dropping data")
                # Clear some old data to make room
                try:
                    self.audio_queue.get_nowait()
                    self.audio_queue.put(audio_data, timeout=0.1)
                except (queue.Empty, queue.Full):
                    pass
            
        except Exception as e:
            logger.error(f"❌ Error processing audio data: {e}")
            await self._handle_error(e)
    
    def _process_audio_stream(self):
        """Process audio chunks with Vosk in a separate thread."""
        logger.info(f"🔄 Started audio processing thread for {self.connection_id}")
        
        while self.is_recording:
            try:
                # Get audio chunk with timeout
                try:
                    audio_chunk = self.audio_queue.get(timeout=0.5)
                except queue.Empty:
                    continue
                
                if not self.recognizer:
                    continue
                
                # Store for debugging
                if len(self.debug_audio_data) < 160000:  # Limit debug data size
                    audio_array = np.frombuffer(audio_chunk, dtype=np.int16)
                    self.debug_audio_data.extend(audio_array)
                
                # Process with Vosk
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
                
                # Reset error count on successful processing
                self.error_count = 0
                
            except Exception as e:
                logger.error(f"❌ Processing error in thread: {e}")
                self.error_count += 1
                
                if self.error_count >= self.max_errors:
                    logger.error(f"❌ Too many errors ({self.error_count}), stopping processing")
                    self.is_recording = False
                    self._send_error_threadsafe(f"Too many processing errors: {e}")
                    break
                
                # Brief pause before retrying
                time.sleep(0.1)
        
        logger.info(f"🔄 Audio processing thread stopped for {self.connection_id}")
    
    def _send_result_threadsafe(self, result_type: str, text: str):
        """Send result to WebSocket client in a thread-safe manner."""
        if self.loop and self.websocket and self.connection_state == "connected":
            future = asyncio.run_coroutine_threadsafe(
                self._send_message({
                    'type': result_type,
                    'text': text,
                    'timestamp': time.time(),
                    'connection_id': self.connection_id
                }),
                self.loop
            )
            try:
                future.result(timeout=1)  # Shorter timeout
            except Exception as e:
                logger.error(f"❌ Error sending WebSocket message from thread: {e}")
    
    def _send_error_threadsafe(self, error_message: str):
        """Send error to WebSocket client in a thread-safe manner."""
        if self.loop and self.websocket:
            future = asyncio.run_coroutine_threadsafe(
                self._send_error(error_message),
                self.loop
            )
            try:
                future.result(timeout=1)
            except Exception as e:
                logger.error(f"❌ Error sending error message from thread: {e}")
    
    async def _send_message(self, message: dict):
        """Send message to WebSocket client with error handling."""
        if not self.websocket:
            return
        
        try:
            await self.websocket.send_json(message)
            logger.debug(f"📤 Sent message: {message.get('type', 'unknown')}")
        except Exception as e:
            logger.error(f"❌ Failed to send WebSocket message: {e}")
            self.connection_state = "error"
            raise
    
    async def _send_error(self, error_message: str):
        """Send error message to client."""
        try:
            await self._send_message({
                'type': 'error',
                'text': error_message,
                'timestamp': time.time(),
                'connection_id': self.connection_id
            })
        except Exception as e:
            logger.error(f"❌ Failed to send error message: {e}")
    
    async def _handle_error(self, error: Exception):
        """Handle errors with proper logging and client notification."""
        self.error_count += 1
        logger.error(f"❌ STT Error ({self.error_count}/{self.max_errors}): {error}")
        
        if self.error_count >= self.max_errors:
            self.connection_state = "error"
            await self._send_error(f"Too many errors, stopping session: {error}")
            await self.stop_session()
        else:
            await self._send_error(f"Processing error: {error}")
    
    async def _heartbeat_loop(self):
        """Send periodic heartbeat messages to keep connection alive."""
        try:
            while self.is_recording and self.connection_state == "connected":
                await asyncio.sleep(10)  # Heartbeat every 10 seconds
                
                if self.websocket:
                    # Check if connection is still active
                    current_time = time.time()
                    if current_time - self.last_activity > 30:  # 30 seconds of inactivity
                        logger.warning(f"⚠️ No activity for 30s on connection {self.connection_id}")
                    
                    await self._send_message({
                        'type': 'heartbeat',
                        'timestamp': current_time,
                        'connection_id': self.connection_id,
                        'last_activity': self.last_activity
                    })
        except asyncio.CancelledError:
            logger.info(f"💓 Heartbeat cancelled for {self.connection_id}")
        except Exception as e:
            logger.error(f"❌ Heartbeat error: {e}")
    
    def _save_debug_audio(self):
        """Save captured audio for debugging."""
        if not self.debug_audio_data:
            return
        
        debug_dir = Path("debug_audio")
        debug_dir.mkdir(exist_ok=True)
        
        timestamp = int(time.time())
        debug_file = debug_dir / f"debug_audio_{self.connection_id}_{timestamp}.wav"
        
        try:
            with wave.open(str(debug_file), 'wb') as wf:
                wf.setnchannels(self.channels)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(self.sample_rate)
                wf.writeframes(np.array(self.debug_audio_data, dtype=np.int16).tobytes())
            
            logger.info(f"💾 Saved debug audio: {debug_file}")
        except Exception as e:
            logger.error(f"❌ Failed to save debug audio: {e}")

class WebSocketConnectionManager:
    """Manage multiple WebSocket connections for STT."""
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.connections: Dict[str, ImprovedRealtimeSTT] = {}
        self.connection_counter = 0
    
    def create_connection(self) -> str:
        """Create a new connection ID."""
        self.connection_counter += 1
        connection_id = f"stt_{int(time.time())}_{self.connection_counter}"
        return connection_id
    
    async def start_session(self, websocket: WebSocket, connection_id: str):
        """Start a new STT session."""
        if connection_id in self.connections:
            await self.stop_session(connection_id)
        
        stt_processor = ImprovedRealtimeSTT(self.model_path)
        self.connections[connection_id] = stt_processor
        
        try:
            await stt_processor.start_session(websocket, connection_id)
        except Exception as e:
            # Clean up on failure
            if connection_id in self.connections:
                del self.connections[connection_id]
            raise
    
    async def stop_session(self, connection_id: str):
        """Stop an STT session."""
        if connection_id in self.connections:
            stt_processor = self.connections[connection_id]
            await stt_processor.stop_session()
            del self.connections[connection_id]
    
    async def process_audio(self, connection_id: str, audio_data: bytes):
        """Process audio data for a connection."""
        if connection_id in self.connections:
            await self.connections[connection_id].process_audio_data(audio_data)
    
    async def cleanup_all(self):
        """Clean up all connections."""
        for connection_id in list(self.connections.keys()):
            await self.stop_session(connection_id)

# Example usage in the main server
def create_improved_websocket_endpoint(app: FastAPI, model_path: str):
    """Create an improved WebSocket endpoint with better stability."""
    
    connection_manager = WebSocketConnectionManager(model_path)
    
    @app.websocket("/stt/stream-improved")
    async def websocket_stt_stream_improved(websocket: WebSocket):
        """Improved WebSocket endpoint for real-time STT streaming."""
        connection_id = connection_manager.create_connection()
        
        try:
            await websocket.accept()
            logger.info(f"🔌 STT WebSocket connected: {connection_id}")
            
            # Start STT session
            await connection_manager.start_session(websocket, connection_id)
            
            # Main message loop
            while True:
                try:
                    # Try to receive binary data (audio)
                    try:
                        audio_data = await asyncio.wait_for(
                            websocket.receive_bytes(), 
                            timeout=30.0  # 30 second timeout
                        )
                        await connection_manager.process_audio(connection_id, audio_data)
                        
                    except asyncio.TimeoutError:
                        # Send heartbeat on timeout
                        await websocket.send_json({
                            'type': 'heartbeat',
                            'timestamp': time.time(),
                            'connection_id': connection_id
                        })
                        continue
                        
                    except Exception:
                        # Try to receive JSON control messages
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
                            break
                
                except WebSocketDisconnect:
                    logger.info(f"🔌 STT WebSocket disconnected: {connection_id}")
                    break
                except Exception as e:
                    logger.error(f"❌ WebSocket error for {connection_id}: {e}")
                    break
        
        finally:
            # Clean up
            await connection_manager.stop_session(connection_id)
            logger.info(f"🔌 STT WebSocket cleanup completed: {connection_id}")
    
    return connection_manager

if __name__ == "__main__":
    # Example usage
    model_path = "models/vosk/vosk-model-small-en-us-0.15"
    app = FastAPI()
    
    # Add CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Create improved WebSocket endpoint
    connection_manager = create_improved_websocket_endpoint(app, model_path)
    
    @app.on_event("shutdown")
    async def shutdown_event():
        await connection_manager.cleanup_all()
    
    uvicorn.run(app, host="127.0.0.1", port=8000)

