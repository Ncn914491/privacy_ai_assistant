import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TAURI_ENV } from '../utils/tauriDetection';
import { useAppStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { StreamingResponse } from '../types';

interface EnhancedStreamingState {
  isStreaming: boolean;
  streamedContent: string;
  error: string | null;
  currentStreamId: string | null;
  totalTokens: number;
  streamingSpeed: number; // tokens per second
  estimatedTimeRemaining: number; // seconds
}

interface StreamEvent {
  stream_id: string;
  event_type: string;
  data: string;
  metadata?: {
    tokens?: number;
    model?: string;
    provider?: string;
  };
}

interface UseEnhancedStreamingReturn {
  streamingState: EnhancedStreamingState;
  startStream: (
    prompt: string, 
    options?: {
      mode?: 'online' | 'offline';
      model?: string;
      systemPrompt?: string;
      onChunk?: (chunk: string, metadata?: any) => void;
      onComplete?: (fullContent: string, metadata?: any) => void;
      onError?: (error: string) => void;
    }
  ) => Promise<string>;
  stopStream: () => Promise<void>;
  pauseStream: () => void;
  resumeStream: () => void;
}

export const useEnhancedStreaming = (): UseEnhancedStreamingReturn => {
  const [streamingState, setStreamingState] = useState<EnhancedStreamingState>({
    isStreaming: false,
    streamedContent: '',
    error: null,
    currentStreamId: null,
    totalTokens: 0,
    streamingSpeed: 0,
    estimatedTimeRemaining: 0,
  });

  const { llmPreferences } = useAppStore();
  const { settings } = useSettingsStore();
  const currentStreamIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const fullContentRef = useRef<string>('');
  const websocketRef = useRef<WebSocket | null>(null);
  const startTimeRef = useRef<number>(0);
  const tokenCountRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);

  // Auto-scroll functionality
  const scrollToBottom = useCallback(() => {
    if (settings.streamingConfig.autoScroll) {
      setTimeout(() => {
        const chatContainer = document.querySelector('[data-chat-container]');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 50);
    }
  }, [settings.streamingConfig.autoScroll]);

  const startStream = useCallback(async (
    prompt: string,
    options?: {
      mode?: 'online' | 'offline';
      model?: string;
      systemPrompt?: string;
      onChunk?: (chunk: string, metadata?: any) => void;
      onComplete?: (fullContent: string, metadata?: any) => void;
      onError?: (error: string) => void;
    }
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Stop any existing stream
        await stopStream();
        
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentStreamIdRef.current = streamId;
        fullContentRef.current = '';
        startTimeRef.current = Date.now();
        tokenCountRef.current = 0;
        isPausedRef.current = false;
        
        setStreamingState({
          isStreaming: true,
          streamedContent: '',
          error: null,
          currentStreamId: streamId,
          totalTokens: 0,
          streamingSpeed: 0,
          estimatedTimeRemaining: 0,
        });

        // Determine mode and model
        const mode = options?.mode || (llmPreferences.preferredProvider === 'online' ? 'online' : 'offline');
        const model = options?.model || (mode === 'online' 
          ? llmPreferences.selectedOnlineModel || 'gemini-2.5-flash'
          : llmPreferences.selectedOfflineModel || 'gemma3n:latest');

        console.log(`🚀 Starting enhanced streaming: ${mode} mode with ${model}`);

        if (mode === 'online') {
          await startOnlineStream(streamId, prompt, model, options, resolve, reject);
        } else {
          if (TAURI_ENV.isTauri && TAURI_ENV.hasInvoke) {
            await startTauriStream(streamId, prompt, model, options, resolve, reject);
          } else {
            await startWebSocketStream(streamId, prompt, model, options, resolve, reject);
          }
        }
      } catch (error) {
        console.error('❌ Failed to start enhanced streaming:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }));
        options?.onError?.(errorMessage);
        reject(error);
      }
    });
  }, [llmPreferences]);

  // Online streaming (Gemini API)
  const startOnlineStream = async (
    streamId: string,
    prompt: string,
    model: string,
    options: any,
    resolve: (value: string) => void,
    reject: (reason: any) => void
  ) => {
    try {
      const { llmRouter } = await import('../core/agents/llmRouter');
      llmRouter.updatePreferences(llmPreferences);
      
      const response = await llmRouter.routeRequest(
        prompt, 
        options?.systemPrompt, 
        'online'
      );
      
      if (response.success && response.response) {
        // Simulate streaming by sending the response in chunks
        const words = response.response.split(' ');
        const chunkSize = settings.streamingConfig.chunkSize || 3;
        const delayMs = settings.streamingConfig.delayMs || 50;
        
        for (let i = 0; i < words.length; i += chunkSize) {
          if (currentStreamIdRef.current !== streamId || isPausedRef.current) {
            break;
          }

          const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
          fullContentRef.current += chunk;
          tokenCountRef.current += chunkSize;
          
          // Calculate streaming metrics
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
          const speed = tokenCountRef.current / elapsedTime;
          const remainingTokens = words.length - (i + chunkSize);
          const estimatedTimeRemaining = remainingTokens / speed;
          
          setStreamingState(prev => ({
            ...prev,
            streamedContent: fullContentRef.current,
            totalTokens: tokenCountRef.current,
            streamingSpeed: speed,
            estimatedTimeRemaining: Math.max(0, estimatedTimeRemaining),
          }));
          
          options?.onChunk?.(chunk, {
            totalTokens: tokenCountRef.current,
            speed,
            model,
            provider: 'online'
          });
          
          scrollToBottom();
          
          // Add delay for streaming effect
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          estimatedTimeRemaining: 0,
        }));
        
        options?.onComplete?.(fullContentRef.current, {
          totalTokens: tokenCountRef.current,
          model,
          provider: 'online',
          executionTime: Date.now() - startTimeRef.current
        });
        
        resolve(fullContentRef.current);
      } else {
        throw new Error(response.error || 'Online streaming failed');
      }
    } catch (error) {
      console.error('❌ Online streaming error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
      }));
      options?.onError?.(errorMessage);
      reject(error);
    }
  };

  // Tauri streaming (Ollama)
  const startTauriStream = async (
    streamId: string,
    prompt: string,
    model: string,
    options: any,
    resolve: (value: string) => void,
    reject: (reason: any) => void
  ) => {
    try {
      // Listen for streaming events
      const unlisten = await listen<StreamEvent>('llm-stream-event', (event) => {
        const { stream_id, event_type, data, metadata } = event.payload;
        
        if (stream_id !== streamId) return;
        
        switch (event_type) {
          case 'chunk':
            if (!isPausedRef.current) {
              fullContentRef.current += data;
              tokenCountRef.current += metadata?.tokens || 1;
              
              const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
              const speed = tokenCountRef.current / elapsedTime;
              
              setStreamingState(prev => ({
                ...prev,
                streamedContent: fullContentRef.current,
                totalTokens: tokenCountRef.current,
                streamingSpeed: speed,
              }));
              
              options?.onChunk?.(data, metadata);
              scrollToBottom();
            }
            break;
            
          case 'complete':
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              estimatedTimeRemaining: 0,
            }));
            
            options?.onComplete?.(fullContentRef.current, {
              totalTokens: tokenCountRef.current,
              model,
              provider: 'local',
              executionTime: Date.now() - startTimeRef.current
            });
            
            resolve(fullContentRef.current);
            break;
            
          case 'error':
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              error: data,
            }));
            
            options?.onError?.(data);
            reject(new Error(data));
            break;
        }
      });
      
      unlistenRef.current = unlisten;
      
      // Start streaming via Tauri
      await invoke('start_llm_stream', {
        streamId,
        prompt,
        model,
        systemPrompt: options?.systemPrompt,
      });
      
    } catch (error) {
      console.error('❌ Tauri streaming error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
      }));
      options?.onError?.(errorMessage);
      reject(error);
    }
  };

  // WebSocket streaming (Python backend)
  const startWebSocketStream = async (
    streamId: string,
    prompt: string,
    model: string,
    options: any,
    resolve: (value: string) => void,
    reject: (reason: any) => void
  ) => {
    try {
      const ws = new WebSocket('ws://127.0.0.1:8000/llm/stream');
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected for enhanced streaming');
        
        const request = {
          stream_id: streamId,
          prompt,
          model,
          system_prompt: options?.systemPrompt,
          streaming_config: settings.streamingConfig
        };
        
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.stream_id !== streamId) return;
          
          switch (data.type) {
            case 'chunk':
              if (!isPausedRef.current) {
                fullContentRef.current += data.content;
                tokenCountRef.current += data.tokens || 1;
                
                const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
                const speed = tokenCountRef.current / elapsedTime;
                
                setStreamingState(prev => ({
                  ...prev,
                  streamedContent: fullContentRef.current,
                  totalTokens: tokenCountRef.current,
                  streamingSpeed: speed,
                }));
                
                options?.onChunk?.(data.content, data.metadata);
                scrollToBottom();
              }
              break;
              
            case 'complete':
              setStreamingState(prev => ({
                ...prev,
                isStreaming: false,
                estimatedTimeRemaining: 0,
              }));
              
              options?.onComplete?.(fullContentRef.current, {
                totalTokens: tokenCountRef.current,
                model,
                provider: 'local',
                executionTime: Date.now() - startTimeRef.current
              });
              
              resolve(fullContentRef.current);
              break;
              
            case 'error':
              setStreamingState(prev => ({
                ...prev,
                isStreaming: false,
                error: data.error,
              }));
              
              options?.onError?.(data.error);
              reject(new Error(data.error));
              break;
          }
        } catch (error) {
          console.error('❌ WebSocket message parsing error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        const errorMessage = 'WebSocket connection failed';
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }));
        options?.onError?.(errorMessage);
        reject(new Error(errorMessage));
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket connection closed');
        websocketRef.current = null;
      };

    } catch (error) {
      console.error('❌ WebSocket streaming error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
      }));
      options?.onError?.(errorMessage);
      reject(error);
    }
  };

  const stopStream = useCallback(async (): Promise<void> => {
    console.log('⏹️ Stopping enhanced stream...');
    
    currentStreamIdRef.current = null;
    
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    if (TAURI_ENV.isTauri && TAURI_ENV.hasInvoke) {
      try {
        await invoke('stop_llm_stream');
      } catch (error) {
        console.warn('Failed to stop Tauri stream:', error);
      }
    }

    setStreamingState(prev => ({
      ...prev,
      isStreaming: false,
      currentStreamId: null,
      estimatedTimeRemaining: 0,
    }));
  }, []);

  const pauseStream = useCallback(() => {
    isPausedRef.current = true;
    console.log('⏸️ Stream paused');
  }, []);

  const resumeStream = useCallback(() => {
    isPausedRef.current = false;
    console.log('▶️ Stream resumed');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return {
    streamingState,
    startStream,
    stopStream,
    pauseStream,
    resumeStream,
  };
};
