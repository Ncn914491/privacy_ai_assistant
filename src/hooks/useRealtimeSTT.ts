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
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearResults: () => void;
}

const PYTHON_BACKEND_WS_URL = 'ws://127.0.0.1:8000/stt/stream';

export const useRealtimeSTT = (): UseRealtimeSTTReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  const clearResults = useCallback(() => {
    setPartialText('');
    setFinalText('');
    setError(null);
  }, []);

  const disconnect = useCallback(() => {
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
  }, []);

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
            } else if (result.type === 'final') {
              setFinalText(prev => prev + (prev ? ' ' : '') + result.text);
              setPartialText(''); // Clear partial when we get final
            }
          } catch (e) {
            console.error('❌ Failed to parse STT result:', e);
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
          
          // Attempt to reconnect if it wasn't a clean close
          if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++;
            console.log(`🔄 Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect().catch(console.error);
            }, 2000 * reconnectAttempts.current); // Exponential backoff
          } else if (reconnectAttempts.current >= maxReconnectAttempts) {
            setError('Failed to reconnect to STT service');
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
      
      // Connect if not already connected
      if (!isConnected) {
        await connect();
      }
      
      // Start recording
      setIsRecording(true);
      console.log('✅ Real-time STT recording started');
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setError(`Failed to start recording: ${error}`);
      setIsRecording(false);
    }
  }, [isConnected, connect, clearResults]);

  const stopRecording = useCallback(() => {
    console.log('⏹️ Stopping real-time STT recording...');
    
    if (websocketRef.current && isConnected) {
      // Send stop command to backend
      websocketRef.current.send(JSON.stringify({ action: 'stop' }));
    }
    
    setIsRecording(false);
    console.log('✅ Real-time STT recording stopped');
  }, [isConnected]);

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
    startRecording,
    stopRecording,
    clearResults,
  };
};
