import { useState, useRef, useCallback, useEffect } from 'react';

interface STTResult {
  type: 'partial' | 'final';
  text: string;
  timestamp: number;
}

interface UseRealtimeSTTReturn {
  isRecording: boolean;
  isConnected: boolean;
  partialText: string;
  finalText: string;
  error: string | null;
  micPermission: 'prompt' | 'granted' | 'denied' | 'checking';
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearResults: () => void;
  requestMicPermission: () => Promise<boolean>;
}

const PYTHON_BACKEND_WS_URL = 'ws://127.0.0.1:8000/stt/stream';

export const useRealtimeSTT = (): UseRealtimeSTTReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('prompt');
  
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  const clearResults = useCallback(() => {
    setPartialText('');
    setFinalText('');
    setError(null);
  }, []);

  // Convert Float32Array to Int16Array (PCM 16-bit)
  const convertFloat32ToInt16 = useCallback((float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const clampedValue = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = clampedValue * 32767;
    }
    return int16Array;
  }, []);

  // Request microphone permission
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      setMicPermission('checking');
      setError(null);
      console.log('🎤 Requesting microphone permission...');

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,  // Disable for better Vosk compatibility
          noiseSuppression: false,  // Disable for better Vosk compatibility
          autoGainControl: false    // Disable for better Vosk compatibility
        }
      });

      // Stop the stream immediately - we just needed to check permission
      stream.getTracks().forEach(track => track.stop());

      setMicPermission('granted');
      console.log('✅ Microphone permission granted');
      return true;
    } catch (error: any) {
      console.error('❌ Microphone permission error:', error);
      setMicPermission('denied');

      let errorMessage = 'Microphone access denied. ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please click "Allow" when prompted for microphone access, or enable microphone permissions in your browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Microphone is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage += 'Microphone does not support the required audio settings.';
      } else {
        errorMessage += `Error: ${error.message}`;
      }

      setError(errorMessage);
      return false;
    }
  }, []);

  // Stop audio capture and cleanup
  const stopAudioCapture = useCallback(() => {
    console.log('🔇 Stopping audio capture...');
    
    // Stop the audio processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('🎤 Stopped microphone track');
      });
      mediaStreamRef.current = null;
    }
  }, []);

  // Start audio capture and streaming
  const startAudioCapture = useCallback(async () => {
    try {
      console.log('🎤 Starting audio capture...');
      
      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      mediaStreamRef.current = stream;
      
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = audioContext;
      
      // Create audio source
      const source = audioContext.createMediaStreamSource(stream);
      
      // Create script processor (deprecated but still widely supported)
      // Note: In production, consider using AudioWorklet for better performance
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (event) => {
        if (!isRecording || !websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const pcmData = convertFloat32ToInt16(inputBuffer);
        
        // Send PCM data as binary to WebSocket
        try {
          websocketRef.current.send(pcmData.buffer);
        } catch (error) {
          console.error('❌ Failed to send audio data:', error);
        }
      };
      
      // Connect audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      console.log('✅ Audio capture started');
      
    } catch (error) {
      console.error('❌ Failed to start audio capture:', error);
      setError(`Failed to start audio capture: ${error}`);
      throw error;
    }
  }, [isRecording, convertFloat32ToInt16]);

  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting...');
    
    // Stop audio capture first
    stopAudioCapture();
    
    // Close WebSocket
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    setIsConnected(false);
    setIsRecording(false);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, [stopAudioCapture]);

  const connect = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to Python backend WebSocket...');
        
        const ws = new WebSocket(PYTHON_BACKEND_WS_URL);
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected to Python backend');
          setIsConnected(true);
          setError(null);
          reconnectAttempts.current = 0;
          websocketRef.current = ws;
          resolve();
        };
        
        ws.onmessage = (event) => {
          try {
            const result: STTResult = JSON.parse(event.data);
            console.log('📤 STT result received:', result);

            if (result.type === 'partial') {
              setPartialText(result.text);
              console.log('🔄 Partial transcription:', result.text);
            } else if (result.type === 'final') {
              const newFinalText = (prev: string) => prev + (prev ? ' ' : '') + result.text;
              setFinalText(newFinalText);
              setPartialText(''); // Clear partial when we get final
              console.log('🎯 Final transcription:', result.text);
            } else if (result.type === 'error') {
              console.error('❌ STT error from backend:', result.text);
              setError(result.text || 'STT processing error');
            }
          } catch (e) {
            console.error('❌ Failed to parse STT result:', e, 'Raw data:', event.data);
            setError('Failed to parse transcription result');
          }
        };
        
        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          setError('WebSocket connection error');
          reject(new Error('WebSocket connection failed'));
        };
        
        ws.onclose = (event) => {
          console.log('🔌 WebSocket closed:', event.code, event.reason);
          setIsConnected(false);
          setIsRecording(false);
          websocketRef.current = null;

          // Attempt to reconnect if it wasn't a clean close and we're not intentionally disconnecting
          if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            console.log(`🔄 Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
            setError(`Connection lost. Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts})`);

            reconnectTimeoutRef.current = setTimeout(() => {
              connect().catch((error) => {
                console.error('❌ Reconnection failed:', error);
                if (reconnectAttempts.current >= maxReconnectAttempts) {
                  setError('Failed to reconnect to STT service. Please refresh the page.');
                }
              });
            }, Math.min(2000 * reconnectAttempts.current, 10000)); // Exponential backoff with max 10s
          } else if (reconnectAttempts.current >= maxReconnectAttempts) {
            setError('Failed to reconnect to STT service. Please refresh the page.');
          }
        };
        
      } catch (e) {
        console.error('❌ Failed to create WebSocket:', e);
        setError('Failed to create WebSocket connection');
        reject(e);
      }
    });
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 Starting real-time STT recording...');
      
      // Clear previous results
      clearResults();
      
      // Check/request microphone permission first
      if (micPermission !== 'granted') {
        const hasPermission = await requestMicPermission();
        if (!hasPermission) {
          return;
        }
      }
      
      // Connect if not already connected
      if (!isConnected) {
        await connect();
      }
      
      // Start audio capture
      await startAudioCapture();
      
      // Start recording
      setIsRecording(true);
      console.log('✅ Real-time STT recording started');
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setError(`Failed to start recording: ${error}`);
      setIsRecording(false);
      stopAudioCapture();
    }
  }, [isConnected, micPermission, connect, clearResults, requestMicPermission, startAudioCapture, stopAudioCapture]);

  const stopRecording = useCallback(() => {
    console.log('⏹️ Stopping real-time STT recording...');
    
    // Stop audio capture first
    stopAudioCapture();
    
    if (websocketRef.current && isConnected) {
      // Send stop command to backend
      try {
        websocketRef.current.send(JSON.stringify({ action: 'stop' }));
      } catch (error) {
        console.error('❌ Failed to send stop command:', error);
      }
    }
    
    setIsRecording(false);
    console.log('✅ Real-time STT recording stopped');
  }, [isConnected, stopAudioCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isRecording,
    isConnected,
    partialText,
    finalText,
    error,
    micPermission,
    startRecording,
    stopRecording,
    clearResults,
    requestMicPermission,
  };
};
