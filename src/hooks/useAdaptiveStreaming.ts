import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TAURI_ENV } from '../utils/tauriDetection';
import { useAppStore } from '../stores/chatStore';

interface StreamingState {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
  currentStreamId: string | null;
}

interface StreamEvent {
  stream_id: string;
  event_type: string;
  data: string;
}

interface UseAdaptiveStreamingReturn {
  streamingState: StreamingState;
  startStream: (prompt: string, onChunk?: (chunk: string) => void, onComplete?: (fullContent: string) => void) => Promise<string>;
  stopStream: () => Promise<void>;
}

export const useAdaptiveStreaming = (): UseAdaptiveStreamingReturn => {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    streamedContent: '',
    error: null,
    currentStreamId: null,
  });

  const { llmPreferences } = useAppStore();
  const currentStreamIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const fullContentRef = useRef<string>('');
  const websocketRef = useRef<WebSocket | null>(null);

  // Determine if we should use online or offline streaming
  const isOnlineModel = llmPreferences.preferredProvider === 'online' || 
                       (llmPreferences.preferredProvider === 'auto' && navigator.onLine);

  const startStream = useCallback(async (
    prompt: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (fullContent: string) => void
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      console.log('🚀 [ADAPTIVE STREAMING] Starting stream for:', isOnlineModel ? 'online' : 'offline', 'model');
      
      try {
        // Stop any existing stream
        await stopStream();
        
        fullContentRef.current = '';
        setStreamingState({
          isStreaming: true,
          streamedContent: '',
          error: null,
          currentStreamId: null,
        });

        if (isOnlineModel) {
          // Use online streaming (Gemini API with custom streaming)
          await startOnlineStream(prompt, onChunk, onComplete, resolve, reject);
        } else {
          // Use offline streaming (Tauri/WebSocket)
          if (TAURI_ENV.isTauri && TAURI_ENV.hasInvoke) {
            await startTauriStream(prompt, onChunk, onComplete, resolve, reject);
          } else {
            await startWebSocketStream(prompt, onChunk, onComplete, resolve, reject);
          }
        }
      } catch (error) {
        console.error('❌ [ADAPTIVE STREAMING] Failed to start stream:', error);
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: error instanceof Error ? error.message : String(error),
        }));
        reject(error);
      }
    });
  }, [isOnlineModel]);

  // Online streaming using Gemini API
  const startOnlineStream = async (
    prompt: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (fullContent: string) => void,
    resolve?: (value: string) => void,
    reject?: (reason: any) => void
  ) => {
    try {
      console.log('🌐 [ONLINE STREAMING] Starting Gemini API streaming...');
      
      if (!llmPreferences.geminiApiKey) {
        throw new Error('Gemini API key not configured');
      }

      const selectedModel = llmPreferences.selectedOnlineModel || 'gemini-2.5-flash';
      
      // Use the LLM router for online requests (non-streaming for now)
      const { llmRouter } = await import('../core/agents/llmRouter');
      llmRouter.updatePreferences(llmPreferences);
      
      const response = await llmRouter.routeRequest(prompt, undefined, 'online');
      
      if (response.success && response.response) {
        // Simulate streaming by sending the response in chunks
        const words = response.response.split(' ');
        const chunkSize = 2; // Send 2 words at a time
        
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
          fullContentRef.current += chunk;
          
          setStreamingState(prev => ({
            ...prev,
            streamedContent: fullContentRef.current,
          }));
          
          onChunk?.(chunk);
          
          // Add delay for streaming effect
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
        }));
        
        onComplete?.(fullContentRef.current);
        resolve?.(fullContentRef.current);
      } else {
        throw new Error(response.error || 'Online LLM request failed');
      }
    } catch (error) {
      console.error('❌ [ONLINE STREAMING] Error:', error);
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      reject?.(error);
    }
  };

  // Tauri streaming for offline models
  const startTauriStream = async (
    prompt: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (fullContent: string) => void,
    resolve?: (value: string) => void,
    reject?: (reason: any) => void
  ) => {
    try {
      console.log('🖥️ [TAURI STREAMING] Starting Tauri streaming...');
      
      const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await invoke('start_llm_stream', {
        stream_id: streamId,
        prompt: prompt,
        model: llmPreferences.selectedOfflineModel || null,
        system_prompt: null
      });
      currentStreamIdRef.current = streamId;
      
      setStreamingState(prev => ({
        ...prev,
        currentStreamId: streamId,
      }));

      // Listen for stream events
      const eventName = `llm_stream_${streamId}`;
      const unlisten = await listen<StreamEvent>(eventName, (event) => {
        const streamEvent = event.payload;
        
        if (streamEvent.event_type === 'chunk') {
          fullContentRef.current += streamEvent.data;
          
          setStreamingState(prev => ({
            ...prev,
            streamedContent: fullContentRef.current,
          }));
          
          onChunk?.(streamEvent.data);
          
        } else if (streamEvent.event_type === 'complete') {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
            currentStreamId: null,
          }));
          
          currentStreamIdRef.current = null;
          onComplete?.(fullContentRef.current);
          resolve?.(fullContentRef.current);
          
        } else if (streamEvent.event_type === 'error') {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
            error: streamEvent.data,
            currentStreamId: null,
          }));
          
          currentStreamIdRef.current = null;
          reject?.(new Error(streamEvent.data));
        }
      });

      unlistenRef.current = unlisten;
    } catch (error) {
      console.error('❌ [TAURI STREAMING] Error:', error);
      reject?.(error);
    }
  };

  // WebSocket streaming for offline models (browser fallback)
  const startWebSocketStream = async (
    prompt: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (fullContent: string) => void,
    resolve?: (value: string) => void,
    reject?: (reason: any) => void
  ) => {
    try {
      console.log('🌐 [WEBSOCKET STREAMING] Starting WebSocket streaming...');
      
      const ws = new WebSocket('ws://127.0.0.1:8000/llm/stream');
      websocketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          prompt,
          model: llmPreferences.selectedOfflineModel || 'gemma3n:latest'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'chunk') {
            fullContentRef.current += data.data;
            
            setStreamingState(prev => ({
              ...prev,
              streamedContent: fullContentRef.current,
            }));
            
            onChunk?.(data.data);
            
          } else if (data.type === 'complete') {
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
            }));
            
            onComplete?.(fullContentRef.current);
            resolve?.(fullContentRef.current);
            
          } else if (data.type === 'error') {
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              error: data.data,
            }));
            
            reject?.(new Error(data.data));
          }
        } catch (parseError) {
          console.error('❌ [WEBSOCKET STREAMING] Parse error:', parseError);
          reject?.(parseError);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ [WEBSOCKET STREAMING] WebSocket error:', error);
        reject?.(new Error('WebSocket connection failed'));
      };
    } catch (error) {
      console.error('❌ [WEBSOCKET STREAMING] Error:', error);
      reject?.(error);
    }
  };

  const stopStream = useCallback(async (): Promise<void> => {
    console.log('⏹️ [ADAPTIVE STREAMING] Stopping stream...');
    
    // Stop Tauri stream
    if (currentStreamIdRef.current) {
      try {
        await invoke('stop_llm_stream', { stream_id: currentStreamIdRef.current });
      } catch (error) {
        console.error('❌ Failed to stop Tauri stream:', error);
      }
    }

    // Stop WebSocket
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    // Clean up event listeners
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    currentStreamIdRef.current = null;
    fullContentRef.current = '';
    
    setStreamingState({
      isStreaming: false,
      streamedContent: '',
      error: null,
      currentStreamId: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  return {
    streamingState,
    startStream,
    stopStream,
  };
};
