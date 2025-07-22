import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  requestMicrophonePermission, 
  checkMicrophonePermission, 
  testMicrophoneAccess,
  isGetUserMediaSupported,
  isSecureContext,
  MicPermissionState,
  DEFAULT_AUDIO_CONSTRAINTS
} from '../utils/microphonePermissions';
import { debugVoiceSteps } from '../utils/voicePipelineDebug';

interface STTResult {
  type: 'partial' | 'final' | 'error';
  text: string;
  timestamp: number;
}

interface UseRealtimeSTTReturn {
  isRecording: boolean;
  isConnected: boolean;
  partialText: string;
  finalText: string;
  error: string | null;
  micPermission: MicPermissionState;
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
  const [micPermission, setMicPermission] = useState<MicPermissionState>('prompt');
  
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  // Check initial permission state on mount
  useEffect(() => {
    const checkInitialPermission = async () => {
      if (!isGetUserMediaSupported()) {
        setMicPermission('unavailable');
        setError('Microphone access is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
        return;
      }

      if (!isSecureContext()) {
        setMicPermission('unavailable');
        setError('Microphone access requires a secure context (HTTPS or localhost). Please ensure you are using a secure connection.');
        return;
      }

      try {
        const permission = await checkMicrophonePermission();
        setMicPermission(permission);
        console.log('🎤 Initial microphone permission state:', permission);
      } catch (error) {
        console.warn('⚠️ Could not check initial microphone permission:', error);
        setMicPermission('prompt');
      }
    };

    checkInitialPermission();
  }, []);

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
      debugVoiceSteps.micPermissionRequest(false); // Start as false, will update on success

      const result = await testMicrophoneAccess(DEFAULT_AUDIO_CONSTRAINTS);
      
      setMicPermission(result.state);
      
      if (result.state === 'granted') {
        console.log('✅ Microphone permission granted');
        debugVoiceSteps.micPermissionGranted();
        return true;
      } else {
        console.error('❌ Microphone permission denied:', result.error);
        debugVoiceSteps.micPermissionRequest(false, result.error);
        setError(result.error || 'Microphone access denied');
        return false;
      }
    } catch (error: any) {
      console.error('❌ Unexpected error requesting microphone permission:', error);
      setMicPermission('denied');
      const errorMessage = `Unexpected error: ${error.message}`;
      debugVoiceSteps.micPermissionRequest(false, errorMessage);
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
      
      // Request media stream with proper error handling
      const result = await requestMicrophonePermission(DEFAULT_AUDIO_CONSTRAINTS);
      
      if (result.state !== 'granted' || !result.stream) {
        throw new Error(result.error || 'Failed to get microphone access');
      }
      
      const stream = result.stream;
      mediaStreamRef.current = stream;
      
      // Create audio context with proper sample rate
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = audioContext;
      
      // Resume audio context if it's suspended (required by some browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
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
          setError('Failed to send audio data to STT service');
        }
      };
      
      // Connect audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      console.log('✅ Audio capture started');
      
    } catch (error: any) {
      console.error('❌ Failed to start audio capture:', error);
      setError(`Failed to start audio capture: ${error.message}`);
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
        debugVoiceSteps.websocketConnect(false); // Start as false, will update on success
        
        const ws = new WebSocket(PYTHON_BACKEND_WS_URL);
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected to Python backend');
          setIsConnected(true);
          setError(null);
          reconnectAttempts.current = 0;
          websocketRef.current = ws;
          debugVoiceSteps.websocketConnect(true);
          resolve();
        };
        
        ws.onmessage = (event) => {
          try {
            const result: STTResult = JSON.parse(event.data);
            console.log('📤 STT result received:', result);

            if (result.type === 'partial') {
              setPartialText(result.text);
              console.log('🔄 Partial transcription:', result.text);
              debugVoiceSteps.sttPartialResult(result.text);
            } else if (result.type === 'final') {
              const newFinalText = (prev: string) => prev + (prev ? ' ' : '') + result.text;
              setFinalText(newFinalText);
              setPartialText(''); // Clear partial when we get final
              console.log('🎯 Final transcription:', result.text);
              debugVoiceSteps.sttFinalResult(result.text);
            } else if (result.type === 'error') {
              console.error('❌ STT error from backend:', result.text);
              debugVoiceSteps.sttError(result.text || 'STT processing error');
              setError(result.text || 'STT processing error');
            } else if (result.type === 'connected') {
              console.log('✅ STT WebSocket connection confirmed:', result.connection_id);
              setError(null);
            } else if (result.type === 'heartbeat') {
              console.debug('💓 Heartbeat received from backend');
              // Reset error state on successful heartbeat
              if (error && error.includes('connection')) {
                setError(null);
              }
            } else if (result.type === 'pong') {
              console.debug('🏓 Pong received from backend');
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
      debugVoiceSteps.audioStreamStart();
      
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
      debugVoiceSteps.sttError(`Failed to start recording: ${error}`);
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

  // Add ping functionality to keep connection alive
  const pingWebSocket = useCallback(() => {
    if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
      try {
        websocketRef.current.send(JSON.stringify({ action: 'ping' }));
        console.debug('🏓 Ping sent to backend');
      } catch (error) {
        console.error('❌ Failed to send ping:', error);
      }
    }
  }, []);

  // Set up periodic ping when connected
  useEffect(() => {
    let pingInterval: NodeJS.Timeout | null = null;
    
    if (isConnected && websocketRef.current) {
      pingInterval = setInterval(pingWebSocket, 15000); // Ping every 15 seconds
    }
    
    return () => {
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    };
  }, [isConnected, pingWebSocket]);

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
