import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TAURI_ENV } from '../utils/tauriDetection';
import { useAppStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';

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
        console.log('🚀 [STREAMING] Starting new stream request...');

        // Stop any existing stream
        await stopStream();

        // Generate unique stream ID
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentStreamIdRef.current = streamId;
        fullContentRef.current = '';
        startTimeRef.current = Date.now();
        tokenCountRef.current = 0;
        isPausedRef.current = false;

        // Initialize streaming state
        setStreamingState({
          isStreaming: true,
          streamedContent: '',
          error: null,
          currentStreamId: streamId,
          totalTokens: 0,
          streamingSpeed: 0,
          estimatedTimeRemaining: 0,
        });

        // Determine mode and model with proper fallbacks
        const mode = options?.mode || (llmPreferences.preferredProvider === 'online' ? 'online' : 'offline');
        const model = options?.model || (mode === 'online'
          ? llmPreferences.selectedOnlineModel || 'gemini-2.5-flash'
          : llmPreferences.selectedOfflineModel || 'gemma3n:latest');

        console.log(`📡 [STREAMING] Mode: ${mode}, Model: ${model}, Stream ID: ${streamId}`);
        console.log(`📝 [STREAMING] Prompt length: ${prompt.length} chars`);

        // Route to appropriate streaming method
        if (mode === 'online') {
          await executeOnlineStreaming(streamId, prompt, model, options, resolve, reject);
        } else {
          if (TAURI_ENV.isTauri && TAURI_ENV.hasInvoke) {
            await executeTauriStreaming(streamId, prompt, model, options, resolve, reject);
          } else {
            await executeWebSocketStreaming(streamId, prompt, model, options, resolve, reject);
          }
        }
      } catch (error) {
        console.error('❌ [STREAMING] Failed to start stream:', error);
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

  // Rewritten Online Streaming Implementation
  const executeOnlineStreaming = async (
    streamId: string,
    prompt: string,
    model: string,
    options: any,
    resolve: (value: string) => void,
    reject: (reason: any) => void
  ) => {
    try {
      console.log('🌐 [ONLINE] Starting Gemini API streaming...');

      // Set timeout for online requests
      const timeoutId = setTimeout(() => {
        console.error('❌ [ONLINE] Request timeout after 60 seconds');
        const errorMsg = 'Online request timed out. Please check your internet connection and try again.';
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMsg,
        }));
        options?.onError?.(errorMsg);
        reject(new Error(errorMsg));
      }, 60000);

      // Import and configure LLM router
      const { llmRouter } = await import('../core/agents/llmRouter');
      llmRouter.updatePreferences(llmPreferences);

      console.log('📡 [ONLINE] Making API request...');
      const response = await llmRouter.routeRequest(
        prompt,
        options?.systemPrompt,
        'online'
      );

      clearTimeout(timeoutId);

      if (response.success && response.response) {
        console.log('✅ [ONLINE] Response received, starting streaming simulation...');
        console.log(`📝 [ONLINE] Response length: ${response.response.length} chars`);

        // Reset content
        fullContentRef.current = '';

        // Split response into words for streaming simulation
        const words = response.response.split(' ');
        const chunkSize = Math.max(1, settings.streamingConfig?.chunkSize || 2);
        const delayMs = Math.max(10, settings.streamingConfig?.delayMs || 50);

        console.log(`🔄 [ONLINE] Streaming ${words.length} words in chunks of ${chunkSize}`);

        for (let i = 0; i < words.length; i += chunkSize) {
          // Check if stream was cancelled
          if (currentStreamIdRef.current !== streamId || isPausedRef.current) {
            console.log('🛑 [ONLINE] Stream cancelled');
            break;
          }

          // Build chunk
          const chunkWords = words.slice(i, i + chunkSize);
          const chunk = chunkWords.join(' ') + (i + chunkSize < words.length ? ' ' : '');

          // Accumulate content
          fullContentRef.current += chunk;
          tokenCountRef.current += chunkWords.length;

          console.log(`📝 [ONLINE] Chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(words.length/chunkSize)}: "${chunk.trim()}" (Total: ${fullContentRef.current.length} chars)`);

          // Update streaming state
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
          const speed = tokenCountRef.current / Math.max(elapsedTime, 0.1);

          setStreamingState(prev => ({
            ...prev,
            streamedContent: fullContentRef.current,
            totalTokens: tokenCountRef.current,
            streamingSpeed: speed,
            estimatedTimeRemaining: Math.max(0, (words.length - (i + chunkSize)) / speed),
          }));

          // Call chunk callback with full accumulated content
          options?.onChunk?.(fullContentRef.current, {
            totalTokens: tokenCountRef.current,
            speed,
            model,
            provider: 'online',
            chunk: chunk,
            progress: (i + chunkSize) / words.length
          });

          scrollToBottom();

          // Add streaming delay
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        console.log('✅ [ONLINE] Streaming completed successfully');
        console.log(`📊 [ONLINE] Final content length: ${fullContentRef.current.length} chars`);

        // Finalize streaming state
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          estimatedTimeRemaining: 0,
        }));

        // Call completion callback
        options?.onComplete?.(fullContentRef.current, {
          totalTokens: tokenCountRef.current,
          model,
          provider: 'online',
          executionTime: Date.now() - startTimeRef.current
        });

        resolve(fullContentRef.current);
      } else {
        throw new Error(response.error || 'No response received from Gemini API');
      }
    } catch (error) {
      console.error('❌ [ONLINE] Streaming error:', error);
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

  // Rewritten Tauri Streaming Implementation - Fixed Parameter Issue
  const executeTauriStreaming = async (
    streamId: string,
    prompt: string,
    model: string,
    options: any,
    resolve: (value: string) => void,
    reject: (reason: any) => void
  ) => {
    try {
      console.log(`🚀 [TAURI] Starting local streaming with Ollama...`);
      console.log(`📡 [TAURI] Stream ID: ${streamId}, Model: ${model}`);

      // Reset content
      fullContentRef.current = '';

      // Listen for streaming events from Tauri backend
      console.log(`👂 [TAURI] Setting up event listener for stream: ${streamId}`);
      const unlisten = await listen<StreamEvent>('llm-stream-event', (event) => {
        const { stream_id, event_type, data, metadata } = event.payload;

        console.log(`📨 [TAURI] Event received: ${event_type} for stream: ${stream_id}`);

        // Ignore events for different streams
        if (stream_id !== streamId) {
          console.log(`🚫 [TAURI] Ignoring event for different stream: ${stream_id} (expected: ${streamId})`);
          return;
        }

        switch (event_type) {
          case 'chunk':
            console.log(`📝 [TAURI] Processing chunk: "${data}" (length: ${data.length})`);
            if (!isPausedRef.current) {
              // Accumulate content
              fullContentRef.current += data;
              tokenCountRef.current += metadata?.tokens || 1;

              // Calculate metrics
              const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
              const speed = tokenCountRef.current / Math.max(elapsedTime, 0.1);

              // Update streaming state
              setStreamingState(prev => ({
                ...prev,
                streamedContent: fullContentRef.current,
                totalTokens: tokenCountRef.current,
                streamingSpeed: speed,
              }));

              console.log(`🔄 [TAURI] Calling onChunk with accumulated content: ${fullContentRef.current.length} chars`);

              // Call chunk callback with full accumulated content
              options?.onChunk?.(fullContentRef.current, {
                ...metadata,
                chunk: data,
                totalTokens: tokenCountRef.current,
                speed,
                model,
                provider: 'local'
              });

              scrollToBottom();
            } else {
              console.log(`⏸️ [TAURI] Stream paused, skipping chunk`);
            }
            break;

          case 'complete':
            console.log(`✅ [TAURI] Stream completed with final content length: ${fullContentRef.current.length}`);

            // Finalize streaming state
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              estimatedTimeRemaining: 0,
            }));

            // Call completion callback
            options?.onComplete?.(fullContentRef.current, {
              totalTokens: tokenCountRef.current,
              model,
              provider: 'local',
              executionTime: Date.now() - startTimeRef.current
            });

            resolve(fullContentRef.current);
            break;

          case 'error':
            console.error(`❌ [TAURI] Stream error: ${data}`);
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

      // Set timeout for Tauri streaming
      const timeoutId = setTimeout(() => {
        console.error('❌ [TAURI] Streaming timeout after 60 seconds');
        const errorMsg = 'Local model request timed out. The model may be loading or under heavy load. Please try again.';
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMsg,
        }));
        options?.onError?.(errorMsg);
        reject(new Error(errorMsg));
      }, 60000);

      // FIXED: Use correct parameter names for Tauri command
      console.log(`🚀 [TAURI] Invoking start_llm_stream command`);
      console.log(`📝 [TAURI] Parameters:`, {
        stream_id: streamId,
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
        model,
        system_prompt: options?.systemPrompt || null
      });

      await invoke('start_llm_stream', {
        stream_id: streamId,  // This matches the Rust parameter name
        prompt: prompt,
        model: model,
        system_prompt: options?.systemPrompt || null,
      });

      console.log(`✅ [TAURI] Command invoked successfully`);
      clearTimeout(timeoutId);

    } catch (error) {
      console.error('❌ [TAURI] Streaming error:', error);
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

  // Rewritten WebSocket Streaming Implementation
  const executeWebSocketStreaming = async (
    streamId: string,
    prompt: string,
    model: string,
    options: any,
    resolve: (value: string) => void,
    reject: (reason: any) => void
  ) => {
    try {
      console.log('🔌 [WEBSOCKET] Starting WebSocket streaming...');

      // Reset content
      fullContentRef.current = '';

      const ws = new WebSocket('ws://127.0.0.1:8000/llm/stream');
      websocketRef.current = ws;

      ws.onopen = () => {
        console.log('✅ [WEBSOCKET] Connected successfully');

        const request = {
          stream_id: streamId,
          prompt,
          model,
          system_prompt: options?.systemPrompt,
          streaming_config: settings.streamingConfig
        };

        console.log('📤 [WEBSOCKET] Sending request:', { ...request, prompt: prompt.substring(0, 100) + '...' });
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 [WEBSOCKET] Message received:', data.type, data.stream_id);

          if (data.stream_id !== streamId) {
            console.log(`🚫 [WEBSOCKET] Ignoring message for different stream: ${data.stream_id}`);
            return;
          }

          switch (data.type) {
            case 'chunk':
              console.log(`📝 [WEBSOCKET] Processing chunk: "${data.content}" (length: ${data.content.length})`);
              if (!isPausedRef.current) {
                // Accumulate content
                fullContentRef.current += data.content;
                tokenCountRef.current += data.tokens || 1;

                // Calculate metrics
                const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
                const speed = tokenCountRef.current / Math.max(elapsedTime, 0.1);

                // Update streaming state
                setStreamingState(prev => ({
                  ...prev,
                  streamedContent: fullContentRef.current,
                  totalTokens: tokenCountRef.current,
                  streamingSpeed: speed,
                }));

                console.log(`🔄 [WEBSOCKET] Calling onChunk with accumulated content: ${fullContentRef.current.length} chars`);

                // Call chunk callback with full accumulated content
                options?.onChunk?.(fullContentRef.current, {
                  ...data.metadata,
                  chunk: data.content,
                  totalTokens: tokenCountRef.current,
                  speed,
                  model,
                  provider: 'local'
                });

                scrollToBottom();
              }
              break;

            case 'complete':
              console.log(`✅ [WEBSOCKET] Stream completed with final content length: ${fullContentRef.current.length}`);

              // Finalize streaming state
              setStreamingState(prev => ({
                ...prev,
                isStreaming: false,
                estimatedTimeRemaining: 0,
              }));

              // Call completion callback
              options?.onComplete?.(fullContentRef.current, {
                totalTokens: tokenCountRef.current,
                model,
                provider: 'local',
                executionTime: Date.now() - startTimeRef.current
              });

              resolve(fullContentRef.current);
              break;

            case 'error':
              console.error(`❌ [WEBSOCKET] Stream error: ${data.error}`);
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
          console.error('❌ [WEBSOCKET] Message parsing error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ [WEBSOCKET] Connection error:', error);
        const errorMessage = 'WebSocket connection failed - ensure Python backend is running';
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }));
        options?.onError?.(errorMessage);
        reject(new Error(errorMessage));
      };

      ws.onclose = () => {
        console.log('🔌 [WEBSOCKET] Connection closed');
        websocketRef.current = null;
      };

    } catch (error) {
      console.error('❌ [WEBSOCKET] Streaming error:', error);
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
    
    if (TAURI_ENV.isTauri && TAURI_ENV.hasInvoke && currentStreamIdRef.current) {
      try {
        await invoke('stop_llm_stream', { stream_id: currentStreamIdRef.current });
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
