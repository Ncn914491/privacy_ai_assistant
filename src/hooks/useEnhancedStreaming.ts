import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { TAURI_ENV } from '../utils/tauriDetection';
import { ModelProvider, llmRouter } from '../core/agents/llmRouter';
import { geminiApi } from '../services/geminiApi';
import { useAppStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';

// Utility function to format tool context for LLM
const formatToolContext = (toolContext: any): string => {
  if (!toolContext) return '';

  if (typeof toolContext === 'string') {
    return toolContext;
  }

  if (Array.isArray(toolContext)) {
    return toolContext.map((item, index) => `${index + 1}. ${JSON.stringify(item)}`).join('\n');
  }

  if (typeof toolContext === 'object') {
    return Object.entries(toolContext)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
  }

  return String(toolContext);
};

// Helper function to determine if web search is needed
const shouldPerformWebSearch = async (prompt: string): Promise<boolean> => {
  const searchKeywords = [
    'what is', 'who is', 'when did', 'where is', 'how to',
    'latest', 'recent', 'current', 'news', 'today',
    'search', 'find', 'lookup', 'research',
    'definition', 'meaning', 'explain',
    'weather', 'stock', 'price', 'rate'
  ];

  const lowerPrompt = prompt.toLowerCase();
  return searchKeywords.some(keyword => lowerPrompt.includes(keyword));
};

// Helper function to format web search results
const formatWebSearchContext = (searchResults: any): string => {
  if (!searchResults.results || searchResults.results.length === 0) {
    return '';
  }

  let context = `Web search results for "${searchResults.query}":\n\n`;

  searchResults.results.slice(0, 3).forEach((result: any, index: number) => {
    context += `${index + 1}. ${result.title}\n`;
    context += `   Source: ${result.source}\n`;
    context += `   URL: ${result.url}\n`;
    context += `   Summary: ${result.snippet}\n\n`;
  });

  context += `Search completed in ${searchResults.search_time_ms}ms using sources: ${searchResults.sources_used.join(', ')}\n`;

  return context;
};

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
      toolContext?: any;
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
      toolContext?: any;
      onChunk?: (chunk: string, metadata?: any) => void;
      onComplete?: (fullContent: string, metadata?: any) => void;
      onError?: (error: string) => void;
    }
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🚀 [STREAMING] Starting new stream request...');

        // FIXED: Stop any existing stream with proper cleanup
        if (currentStreamIdRef.current) {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
            error: null
          }));
          currentStreamIdRef.current = null;
        }

        // FIXED: Generate unique stream ID with better isolation
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentStreamIdRef.current = streamId;
        fullContentRef.current = '';
        startTimeRef.current = Date.now();
        tokenCountRef.current = 0;
        isPausedRef.current = false;

        // FIXED: Initialize streaming state with proper isolation
        setStreamingState({
          isStreaming: true,
          streamedContent: '',
          error: null,
          currentStreamId: streamId,
          totalTokens: 0,
          streamingSpeed: 0,
          estimatedTimeRemaining: 0,
        });

        // FIXED: Force local mode and gemma3n:latest model only
        const mode = 'offline'; // Always use offline/local mode
        const model = 'gemma3n:latest'; // EXCLUSIVE: Always use gemma3n:latest model

        // ENHANCED: Prepare enhanced prompt with system prompt, tool context, and web search
        let enhancedPrompt = prompt;

        // Check if query requires web search
        const needsWebSearch = await shouldPerformWebSearch(prompt);
        let webSearchContext = '';

        if (needsWebSearch) {
          try {
            console.log('🔍 [STREAMING] Query requires web search, fetching context...');
            const searchResults = await invoke('search_web', { query: prompt }) as any;

            if (searchResults.results && searchResults.results.length > 0) {
              webSearchContext = formatWebSearchContext(searchResults);
              console.log('✅ [STREAMING] Web search context added:', webSearchContext.length, 'characters');
            }
          } catch (error) {
            console.warn('⚠️ [STREAMING] Web search failed:', error);
          }
        }

        if (options?.systemPrompt) {
          enhancedPrompt = `${options.systemPrompt}\n\nUser: ${prompt}`;
        }

        // Add web search context if available
        if (webSearchContext) {
          enhancedPrompt = `${enhancedPrompt}\n\nWeb Search Context:\n${webSearchContext}`;
        }

        // FIXED: Add tool context if available with proper formatting
        if (options?.toolContext) {
          const formattedContext = formatToolContext(options.toolContext);
          if (formattedContext) {
            enhancedPrompt = `${enhancedPrompt}\n\nContext: ${formattedContext}`;
          }
        }

        console.log('🔧 [STREAMING] Enhanced prompt prepared:', {
          originalLength: prompt.length,
          enhancedLength: enhancedPrompt.length,
          hasSystemPrompt: !!options?.systemPrompt,
          hasToolContext: !!options?.toolContext
        });

        // ENHANCED: Execute streaming with hybrid model routing
        if (TAURI_ENV.isTauri) {
          console.log('🔧 [STREAMING] Using hybrid model routing...');

          // Get optimal model selection
          const complexity = llmRouter.calculateComplexity(enhancedPrompt, options?.toolContext);
          const routingDecision = await llmRouter.selectOptimalModel(complexity);

          console.log('🤖 [STREAMING] Routing decision:', routingDecision);

          let result: string;

          if (routingDecision.selectedProvider === ModelProvider.ONLINE_GEMINI) {
            // Use online Gemini API
            result = await executeGeminiStreaming(enhancedPrompt, {
              systemPrompt: options?.systemPrompt,
              onChunk: (chunk: string, metadata?: any) => {
                if (options?.onChunk) {
                  try {
                    options.onChunk(chunk, metadata);
                  } catch (error) {
                    console.error('❌ [STREAMING] Error in onChunk callback:', error);
                  }
                }
              },
            onComplete: (fullContent: string, metadata?: any) => {
              // FIXED: Ensure complete callback is called with proper isolation
              if (options?.onComplete) {
                try {
                  options.onComplete(fullContent, metadata);
                } catch (error) {
                  console.error('❌ [STREAMING] Error in onComplete callback:', error);
                }
              }
            },
              onError: async (error: string) => {
                // Try fallback if available
                if (routingDecision.fallbackProvider === ModelProvider.LOCAL_GEMMA3N) {
                  console.log('🔄 [STREAMING] Attempting fallback to local model...');
                  try {
                    const fallbackResult = await executeTauriStreaming(enhancedPrompt, {
                      model: 'gemma3n:latest',
                      systemPrompt: options?.systemPrompt,
                      onChunk: options?.onChunk,
                      onComplete: options?.onComplete,
                      onError: options?.onError
                    });
                    return fallbackResult;
                  } catch (fallbackError) {
                    console.error('❌ [STREAMING] Fallback also failed:', fallbackError);
                  }
                }

                if (options?.onError) {
                  try {
                    options.onError(error);
                  } catch (callbackError) {
                    console.error('❌ [STREAMING] Error in onError callback:', callbackError);
                  }
                }
              }
            });
          } else {
            // Use local Tauri streaming
            result = await executeTauriStreaming(enhancedPrompt, {
              model: routingDecision.model,
              systemPrompt: options?.systemPrompt,
              onChunk: (chunk: string, metadata?: any) => {
                if (options?.onChunk) {
                  try {
                    options.onChunk(chunk, metadata);
                  } catch (error) {
                    console.error('❌ [STREAMING] Error in onChunk callback:', error);
                  }
                }
              },
              onComplete: (fullContent: string, metadata?: any) => {
                if (options?.onComplete) {
                  try {
                    options.onComplete(fullContent, metadata);
                  } catch (error) {
                    console.error('❌ [STREAMING] Error in onComplete callback:', error);
                  }
                }
              },
              onError: (error: string) => {
                if (options?.onError) {
                  try {
                    options.onError(error);
                  } catch (callbackError) {
                    console.error('❌ [STREAMING] Error in onError callback:', callbackError);
                  }
                }
              }
            });
          }
          
          // FIXED: Resolve with the result from Tauri streaming
          resolve(result);
        } else {
          console.log('🔧 [STREAMING] Using online streaming...');
          // FIXED: executeOnlineStreaming handles resolve/reject internally
          await executeOnlineStreaming(streamId, enhancedPrompt, model, options, resolve, reject);
        }

      } catch (error) {
        console.error('❌ [STREAMING] Error in startStream:', error);
        
        // FIXED: Ensure error callback is called with proper isolation
        if (options?.onError) {
          try {
            options.onError(error instanceof Error ? error.message : String(error));
          } catch (callbackError) {
            console.error('❌ [STREAMING] Error in onError callback:', callbackError);
          }
        }
        
        reject(error);
      }
    });
  }, []);

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

        // Enhanced streaming: Use word-level streaming for better token-by-token effect
        const chunks = response.response.split(' ').map(word => word + ' ');
        chunks[chunks.length - 1] = chunks[chunks.length - 1].trim(); // Remove trailing space from last word
        const chunkSize = Math.max(1, settings.streamingConfig?.chunkSize || 1);
        const delayMs = Math.max(10, settings.streamingConfig?.delayMs || 30);

        console.log(`🔄 [ONLINE] Streaming ${chunks.length} words in chunks of ${chunkSize}`);

        for (let i = 0; i < chunks.length; i += chunkSize) {
          // Check if stream was cancelled
          if (currentStreamIdRef.current !== streamId || isPausedRef.current) {
            console.log('🛑 [ONLINE] Stream cancelled');
            break;
          }

          // Build chunk
          const chunkItems = chunks.slice(i, i + chunkSize);
          const chunk = chunkItems.join('');

          // Accumulate content
          fullContentRef.current += chunk;
          tokenCountRef.current += (chunkItems.filter(item => item.trim()).length);

          console.log(`📝 [ONLINE] Chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(chunks.length/chunkSize)}: "${chunk.trim()}" (Total: ${fullContentRef.current.length} chars)`);

          // Update streaming state
          const elapsedTime = (Date.now() - startTimeRef.current) / 1000;
          const speed = tokenCountRef.current / Math.max(elapsedTime, 0.1);

          setStreamingState(prev => ({
            ...prev,
            streamedContent: fullContentRef.current,
            totalTokens: tokenCountRef.current,
            streamingSpeed: speed,
            estimatedTimeRemaining: Math.max(0, (chunks.length - (i + chunkSize)) / speed),
          }));

          // Call chunk callback with full accumulated content
          options?.onChunk?.(fullContentRef.current, {
            totalTokens: tokenCountRef.current,
            speed,
            model,
            provider: 'online',
            chunk: chunk,
            progress: (i + chunkSize) / chunks.length
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

  // Enhanced Gemini Streaming Implementation
  const executeGeminiStreaming = async (
    prompt: string,
    options?: {
      systemPrompt?: string;
      onChunk?: (chunk: string, metadata?: any) => void;
      onComplete?: (fullContent: string, metadata?: any) => void;
      onError?: (error: string) => void;
    }
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      console.log('🌐 [GEMINI STREAMING] Starting Gemini streaming...');

      try {
        // Reset content accumulation for each new stream
        fullContentRef.current = '';
        tokenCountRef.current = 0;
        startTimeRef.current = Date.now();

        const streamId = `gemini_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentStreamIdRef.current = streamId;

        console.log(`🌐 [GEMINI STREAMING] Stream ID: ${streamId}`);

        // Set streaming state immediately
        setStreamingState({
          isStreaming: true,
          streamedContent: '',
          error: null,
          currentStreamId: streamId,
          totalTokens: 0,
          streamingSpeed: 0,
          estimatedTimeRemaining: 0,
        });

        // Start Gemini streaming
        const result = await geminiApi.startStream(prompt, {
          streamId,
          systemPrompt: options?.systemPrompt,
          onChunk: (accumulatedContent: string, metadata?: any) => {
            if (!isPausedRef.current && currentStreamIdRef.current === streamId) {
              fullContentRef.current = accumulatedContent;
              tokenCountRef.current = metadata?.tokens || Math.ceil(accumulatedContent.length / 4);

              // Calculate streaming speed
              const elapsed = Date.now() - startTimeRef.current;
              const speed = elapsed > 0 ? (tokenCountRef.current / elapsed) * 1000 : 0;

              // Update streaming state
              setStreamingState(prev => ({
                ...prev,
                streamedContent: accumulatedContent,
                totalTokens: tokenCountRef.current,
                streamingSpeed: speed,
                estimatedTimeRemaining: 0
              }));

              // Call chunk callback
              options?.onChunk?.(accumulatedContent, {
                ...metadata,
                totalTokens: tokenCountRef.current,
                speed,
                model: 'gemini-1.5-flash',
                provider: 'online_gemini'
              });

              scrollToBottom();
            }
          },
          onComplete: (fullContent: string, metadata?: any) => {
            console.log('✅ [GEMINI STREAMING] Stream completed successfully');

            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              streamedContent: fullContent,
              totalTokens: metadata?.tokens || tokenCountRef.current
            }));

            options?.onComplete?.(fullContent, {
              ...metadata,
              model: 'gemini-1.5-flash',
              provider: 'online_gemini'
            });

            currentStreamIdRef.current = null;
            resolve(fullContent);
          },
          onError: (error: string) => {
            console.error('❌ [GEMINI STREAMING] Stream failed:', error);

            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              error: error
            }));

            options?.onError?.(error);
            currentStreamIdRef.current = null;
            reject(new Error(error));
          }
        });

      } catch (error) {
        console.error('❌ [GEMINI STREAMING] Streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }));

        options?.onError?.(errorMessage);
        currentStreamIdRef.current = null;
        reject(error);
      }
    });
  };

  // Rewritten Tauri Streaming Implementation - Fixed Parameter Issue
  const executeTauriStreaming = async (
    prompt: string,
    options?: {
      model?: string;
      systemPrompt?: string;
      onChunk?: (chunk: string, metadata?: any) => void;
      onComplete?: (fullContent: string, metadata?: any) => void;
      onError?: (error: string) => void;
    }
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      console.log('🚀 [TAURI STREAMING] Starting Tauri streaming...');
      
      try {
        // FIXED: Reset content accumulation for each new stream
        fullContentRef.current = '';
        tokenCountRef.current = 0;
        startTimeRef.current = Date.now();
        
        const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentStreamIdRef.current = streamId;

        console.log(`📡 [TAURI STREAMING] Stream ID: ${streamId}`);

        // FIXED: Set streaming state immediately
        setStreamingState({
          isStreaming: true,
          streamedContent: '',
          error: null,
          currentStreamId: streamId,
          totalTokens: 0,
          streamingSpeed: 0,
          estimatedTimeRemaining: 0,
        });

        // Start the stream
        await invoke('start_llm_stream', {
          streamId: streamId,
          prompt: prompt,
          model: options?.model || 'gemma3n:latest',
          systemPrompt: options?.systemPrompt || null
        });

        console.log('✅ [TAURI STREAMING] Stream started successfully');

        // FIXED: Listen for events with proper content accumulation
        const unlisten = await listen<StreamEvent>('llm-stream-event', (event) => {
          const { stream_id, event_type, data, metadata } = event.payload;
          
          // FIXED: Verify this event is for our stream
          if (stream_id !== streamId) {
            console.log(`🚫 [TAURI STREAMING] Ignoring event for different stream: ${stream_id} (expected: ${streamId})`);
            return;
          }

          console.log(`📨 [TAURI STREAMING] Processing ${event_type} event`);

          switch (event_type) {
            case 'chunk':
              console.log(`📝 [TAURI STREAMING] Processing chunk: "${data}" (length: ${data.length})`);
              if (!isPausedRef.current) {
                // FIXED: Accumulate content properly
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

                console.log(`🔄 [TAURI STREAMING] Calling onChunk with accumulated content: ${fullContentRef.current.length} chars`);

                // Call chunk callback with full accumulated content
                options?.onChunk?.(fullContentRef.current, {
                  ...metadata,
                  chunk: data,
                  totalTokens: tokenCountRef.current,
                  speed,
                  model: options?.model || 'gemma3n:latest',
                  provider: 'local'
                });

                scrollToBottom();
              } else {
                console.log(`⏸️ [TAURI STREAMING] Stream paused, skipping chunk`);
              }
              break;

            case 'complete':
              console.log('✅ [TAURI STREAMING] Stream completed');
              
              setStreamingState(prev => ({
                ...prev,
                isStreaming: false,
                currentStreamId: null,
              }));

              currentStreamIdRef.current = null;
              
              // FIXED: Call complete callback with final accumulated content
              options?.onComplete?.(fullContentRef.current, {
                totalTokens: tokenCountRef.current,
                model: options?.model || 'gemma3n:latest',
                provider: 'local'
              });

              // FIXED: Resolve the promise with the final content
              resolve(fullContentRef.current);
              break;

            case 'error':
              console.error('❌ [TAURI STREAMING] Stream error:', data);
              
              setStreamingState(prev => ({
                ...prev,
                isStreaming: false,
                error: data,
                currentStreamId: null,
              }));

              currentStreamIdRef.current = null;
              
              // FIXED: Call error callback
              options?.onError?.(data);
              
              // FIXED: Reject the promise
              reject(new Error(data));
              break;
          }
        });

        unlistenRef.current = unlisten;

      } catch (error) {
        console.error('❌ [TAURI STREAMING] Error:', error);
        
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          error: error instanceof Error ? error.message : String(error),
          currentStreamId: null,
        }));

        currentStreamIdRef.current = null;
        
        // FIXED: Call error callback
        options?.onError?.(error instanceof Error ? error.message : String(error));
        
        // FIXED: Reject the promise
        reject(error);
      }
    });
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
