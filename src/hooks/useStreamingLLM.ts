import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface StreamingState {
  isStreaming: boolean;
  currentStreamId: string | null;
  streamedContent: string;
  error: string | null;
}

interface UseStreamingLLMReturn {
  streamingState: StreamingState;
  startStream: (prompt: string) => Promise<void>;
  stopStream: () => Promise<void>;
  resetStream: () => void;
}

export const useStreamingLLM = (): UseStreamingLLMReturn => {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentStreamId: null,
    streamedContent: '',
    error: null,
  });

  const unlistenRef = useRef<(() => void) | null>(null);

  const startStream = useCallback(async (prompt: string) => {
    try {
      console.log('🚀 Starting LLM stream for prompt:', prompt);
      console.log('🔍 Prompt length:', prompt.length);

      // Reset state
      setStreamingState({
        isStreaming: true,
        currentStreamId: null,
        streamedContent: '',
        error: null,
      });

      // Start the stream with detailed error handling
      console.log('📞 Calling start_llm_stream command...');
      const streamId = await invoke<string>('start_llm_stream', { prompt });
      console.log('📡 Stream started successfully with ID:', streamId);

      setStreamingState(prev => ({
        ...prev,
        currentStreamId: streamId,
      }));

      // Listen for stream events
      const eventName = `llm_stream_${streamId}`;
      console.log('🎧 Setting up listener for event:', eventName);

      const unlisten = await listen(eventName, (event) => {
        console.log('📤 Raw stream event received:', event);

        const payload = event.payload as { stream_id: string; event_type: string; data: string };
        console.log('📤 Parsed stream event:', payload);

        switch (payload.event_type) {
          case 'chunk':
            console.log('📝 Adding chunk to content:', payload.data);
            setStreamingState(prev => {
              const newContent = prev.streamedContent + payload.data;
              console.log('📝 Updated content length:', newContent.length);
              return {
                ...prev,
                streamedContent: newContent,
              };
            });
            break;

          case 'complete':
            console.log('✅ Stream completed');
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
            }));
            if (unlistenRef.current) {
              unlistenRef.current();
              unlistenRef.current = null;
            }
            break;

          case 'error':
            console.error('❌ Stream error:', payload.data);
            setStreamingState(prev => ({
              ...prev,
              isStreaming: false,
              error: payload.data,
            }));
            if (unlistenRef.current) {
              unlistenRef.current();
              unlistenRef.current = null;
            }
            break;

          default:
            console.warn('⚠️ Unknown stream event type:', payload.event_type);
        }
      });

      unlistenRef.current = unlisten;

    } catch (error) {
      console.error('❌ Failed to start stream:', error);
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));

      let errorMessage = 'Failed to start stream';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
      }

      console.error('❌ Final error message:', errorMessage);

      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
      }));

      // Re-throw the error so the caller can handle it
      throw new Error(errorMessage);
    }
  }, []);

  const stopStream = useCallback(async () => {
    if (!streamingState.currentStreamId) return;

    try {
      console.log('⏹️ Stopping stream:', streamingState.currentStreamId);
      await invoke('stop_llm_stream', { streamId: streamingState.currentStreamId });
      
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
      }));

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    } catch (error) {
      console.error('❌ Failed to stop stream:', error);
    }
  }, [streamingState.currentStreamId]);

  const resetStream = useCallback(() => {
    setStreamingState({
      isStreaming: false,
      currentStreamId: null,
      streamedContent: '',
      error: null,
    });

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
  }, []);

  return {
    streamingState,
    startStream,
    stopStream,
    resetStream,
  };
};
