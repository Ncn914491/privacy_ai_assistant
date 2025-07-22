import React, { useEffect, useState, useRef } from 'react';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import ModelStatusBadge from './ModelStatusBadge';
import HardwareStatusBadge from './HardwareStatusBadge';
import ThinkingIndicator from './ThinkingIndicator';
import StartupDiagnostic from './StartupDiagnostic';
import { useMultiChatStore } from '../stores/chatStore';
import { invoke } from '@tauri-apps/api/core';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';
import { AlertTriangle, Settings } from 'lucide-react';
import { TAURI_ENV } from '../utils/tauriDetection';
import { SttResult } from '../types';
import { useStreamingLLM } from '../hooks/useStreamingLLM';
import { usePythonBackendLLM } from '../hooks/usePythonBackendLLM';
import { startVoicePipelineDebug, debugVoiceSteps, finishVoicePipelineDebug } from '../utils/voicePipelineDebug';

import VoiceRecordingModal from './VoiceRecordingModal';
import RealtimeVoiceModal from './RealtimeVoiceModal_improved';
import ErrorBoundary from './ErrorBoundary';


const ChatInterface: React.FC = () => {
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showRealtimeVoiceModal, setShowRealtimeVoiceModal] = useState(false);
  const { messages, addMessage, updateMessage, setLoading, isLoading, generateContextAwareResponse, activeChatId } = useMultiChatStore();
  const { streamingState, stopStream } = useStreamingLLM();
  const currentStreamingMessageId = useRef<string | null>(null);

  // Python backend integration
  const {
    backendHealth,
    startBackend,
    checkBackendHealth,
    sendPrompt,
    getAvailableModels
  } = usePythonBackendLLM();

  // Python backend streaming (removed unused import)

  // Monitor streaming state for debugging (keeping this for fallback)
  useEffect(() => {
    console.log('🔍 Streaming state changed:', {
      isStreaming: streamingState.isStreaming,
      contentLength: streamingState.streamedContent.length,
      error: streamingState.error,
      currentMessageId: currentStreamingMessageId.current
    });

    // This is now mainly for debugging - real updates happen via callbacks
    if (currentStreamingMessageId.current && streamingState.error) {
      console.error('❌ Streaming error detected in useEffect:', streamingState.error);
      updateMessage(currentStreamingMessageId.current, {
        content: getErrorMessage(streamingState.error)
      });
      currentStreamingMessageId.current = null;
    }
  }, [streamingState, updateMessage]);

  const [modelHealth, setModelHealth] = useState<ModelHealthStatus>({
    isAvailable: false,
    isChecking: false,
    lastChecked: null,
    error: null,
    connectionState: 'disconnected',
    modelName: 'Gemma 3n',
    serviceUrl: 'http://localhost:11434',
    lastSuccessfulCheck: null,
  });
  const [systemReady, setSystemReady] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(true);
  const [, setDiagnosticResults] = useState<any[]>([]);

  useEffect(() => {
    const scrollToBottom = () => {
      const chatWindow = document.getElementById('chat-window');
      if (chatWindow) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
      }
    };

    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Subscribe to model health status
    const unsubscribe = modelHealthChecker.subscribe((status) => {
      setModelHealth(status);
    });

    // Start periodic health checks
    modelHealthChecker.startPeriodicCheck(15000); // Check every 15 seconds

    return unsubscribe;
  }, []);

  const handleDiagnosticComplete = (success: boolean) => {
    console.log('Diagnostic complete:', { success });
    setSystemReady(success);
    setDiagnosticResults([]); // Set empty array since we don't get results anymore

    // Auto-hide diagnostic after 3 seconds if successful
    if (success) {
      setTimeout(() => {
        setShowDiagnostic(false);
      }, 3000);
    }
  };

  const getErrorMessage = (error: string): string => {
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('connect') || errorLower.includes('connection')) {
      return 'Model not available. Please ensure Gemma 3n is running via Ollama.';
    }
    
    if (errorLower.includes('timeout')) {
      return 'Request timed out. The model is taking too long to respond.';
    }
    
    if (errorLower.includes('empty') || errorLower.includes('malformed')) {
      return 'Empty or malformed response from the model.';
    }
    
    if (errorLower.includes('gemma') || errorLower.includes('ollama')) {
      return 'Gemma 3n model is not running. Please start it via Ollama.';
    }
    
    return `Error: ${error}`;
  };

  // 🧪 Test function for streaming
  const handleTestStreaming = async () => {
    try {
      console.log('🧪 Testing streaming functionality...');

      // Add a test message that will be updated in real-time
      const testMessageId = Date.now();
      addMessage('🧪 Starting streaming test...', 'assistant', testMessageId);
      let testContent = '';

      // Start the test stream with direct event listening
      const streamId = await invoke<string>('test_streaming');
      console.log('✅ Test streaming started with ID:', streamId);

      // Listen for test streaming events directly
      const { listen } = await import('@tauri-apps/api/event');
      const eventName = `llm_stream_${streamId}`;
      console.log('🎧 Listening for test events on:', eventName);

      const unlisten = await listen(eventName, (event) => {
        console.log('📤 Test event received:', event);
        const payload = event.payload as { stream_id: string; event_type: string; data: string };

        switch (payload.event_type) {
          case 'chunk':
            console.log('📝 Test chunk received:', payload.data);
            testContent += payload.data;
            updateMessage(testMessageId.toString(), { content: `🧪 Test: ${testContent}` });
            break;
          case 'complete':
            console.log('✅ Test streaming completed');
            updateMessage(testMessageId.toString(), { content: `✅ Test completed: ${testContent}` });
            unlisten();
            break;
          case 'error':
            console.error('❌ Test streaming error:', payload.data);
            updateMessage(testMessageId.toString(), { content: `❌ Test failed: ${payload.data}` });
            unlisten();
            break;
        }
      });

    } catch (error) {
      console.error('❌ Streaming test failed:', error);
      addMessage(`❌ Streaming test failed: ${error}`, 'assistant');
    }
  };

  // 🧪 Test function for Vosk installation
  const handleTestVosk = async () => {
    try {
      console.log('🧪 Testing Vosk installation...');
      const result = await invoke<string>('test_vosk_installation');
      console.log('✅ Vosk test result:', result);
      addMessage(`✅ Vosk test: ${result}`, 'assistant');
    } catch (error) {
      console.error('❌ Vosk test failed:', error);
      addMessage(`❌ Vosk test failed: ${error}`, 'assistant');
    }
  };

  // 🧪 Test function for voice-to-LLM pipeline
  const handleTestVoicePipeline = async () => {
    try {
      console.log('🧪 Testing voice-to-LLM pipeline...');

      // Simulate a voice transcription
      const testTranscription = "Hello, this is a test of the voice to LLM pipeline";
      console.log('🎤 Simulating voice transcription:', testTranscription);

      // Call the voice transcription handler directly
      handleVoiceTranscription(testTranscription);

    } catch (error) {
      console.error('❌ Voice pipeline test failed:', error);
      addMessage(`❌ Voice pipeline test failed: ${error}`, 'assistant');
    }
  };

  // 🐍 Test Python backend
  const handleTestPythonBackend = async () => {
    try {
      console.log('🐍 Testing Python backend...');
      addMessage('🐍 Testing Python backend...', 'assistant');

      // Start backend if not running
      if (!backendHealth) {
        console.log('🚀 Starting Python backend...');
        addMessage('🚀 Starting Python backend...', 'assistant');
        await startBackend();
      }

      // Check health
      const isHealthy = await checkBackendHealth();
      if (isHealthy) {
        addMessage('✅ Python backend is healthy and ready', 'assistant');

        // Get available models
        const models = await getAvailableModels();
        addMessage(`📋 Available models: ${models.map(m => m.name).join(', ')}`, 'assistant');

        // Test LLM request
        console.log('🤖 Testing LLM request...');
        addMessage('🤖 Testing LLM request...', 'assistant');
        const response = await sendPrompt('Say "Hello from Python backend!"');
        addMessage(`🤖 LLM Response: ${response}`, 'assistant');
      } else {
        addMessage('❌ Python backend health check failed', 'assistant');
      }

    } catch (error) {
      console.error('❌ Python backend test failed:', error);
      addMessage(`❌ Python backend test failed: ${error}`, 'assistant');
    }
  };

  // 🧪 Test function for static file STT
  const handleTestStaticSTT = async () => {
    try {
      console.log('🧪 Testing static file STT...');
      setLoading(true);

      // Add a test message to show we're testing
      addMessage('🧪 Testing STT with synthesize.wav file', 'user');

      // Call the test command
      const result = await invoke<SttResult>('test_static_file_stt', {
        filePath: null // Use default path
      });

      console.log('🧪 Static STT test result:', result);

      if (result.success && result.text && result.text.trim().length > 0) {
        // Add the transcribed text as a user message
        addMessage(`📝 Transcribed: "${result.text.trim()}"`, 'assistant');

        // Now test the full pipeline by sending this as an LLM query
        console.log('🤖 Testing full pipeline with transcribed text...');
        const llmResponse = await invoke<string>('generate_llm_response', {
          prompt: result.text.trim()
        });

        addMessage(llmResponse.trim(), 'assistant');
        console.log('✅ Full STT → LLM pipeline test successful!');
      } else {
        // Show the error details
        addMessage(`❌ STT Test Failed: ${result.text}`, 'assistant');
        console.error('❌ Static STT test failed:', result);
      }

    } catch (error) {
      console.error('❌ Static STT test error:', error);
      addMessage(`❌ STT Test Error: ${error}`, 'assistant');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (content: string): Promise<void> => {
    console.log('🚀 handleSendMessage called with content:', content);
    console.log('🚀 Content length:', content.length);

    // Check if we have an active chat session
    if (!activeChatId) {
      console.warn('⚠️ No active chat session, cannot send message');
      throw new Error('No active chat session');
    }

    setLoading(true);

    // Add a streaming message placeholder
    const streamingMessageId = Date.now();
    addMessage('🤔 Thinking...', 'assistant', streamingMessageId);

    console.log('📝 Created streaming message with ID:', streamingMessageId);

    // Store the streaming message ID immediately for stop button functionality
    currentStreamingMessageId.current = streamingMessageId.toString();

    try {
      // Check if running in Tauri environment
      if (!TAURI_ENV.isTauri) {
        console.warn('⚠️ Running in browser mode - some features may be limited');
        // In browser mode, provide a mock response
        const mockResponse = "I'm running in browser mode with limited functionality. The Gemma 3n model is not available in this environment. Please run the desktop application for full AI capabilities.";
        updateMessage(streamingMessageId.toString(), { content: mockResponse });
        debugVoiceSteps.llmResponse(mockResponse, true);
        return;
      }

      // Check if Python backend is healthy
      const isBackendHealthy = await checkBackendHealth();
      if (!isBackendHealthy) {
        console.log('🚀 Starting Python backend...');
        updateMessage(streamingMessageId.toString(), { content: '🚀 Starting AI backend...' });
        await startBackend();
      }

      console.log('🧠 Using context-aware LLM generation...');
      updateMessage(streamingMessageId.toString(), { content: '🤖 Generating context-aware response...' });

      // Use context-aware response generation
      const response = await generateContextAwareResponse(content);

      // Update the message with the response
      updateMessage(streamingMessageId.toString(), { content: response });
      debugVoiceSteps.llmResponse(response, true);
      debugVoiceSteps.uiUpdate(streamingMessageId.toString(), response);

      console.log('✅ Context-aware response generated, length:', response.length);

      // TTS for responses (skip for very long responses)
      if (ttsEnabled && response.length < 1000) {
        console.log('🔊 Starting TTS for response...');
        invoke('run_piper_tts', { text: response }).catch((error) => {
          console.error('TTS Error:', error);
        });
      } else if (response.length >= 1000) {
        console.log('⏭️ Skipping TTS for long response (length:', response.length, ')');
      }

    } catch (error) {
      console.error('❌ Error in handleSendMessage:', error);

      // Clear the streaming message ID on error
      currentStreamingMessageId.current = null;

      const errorMessage = getErrorMessage(error instanceof Error ? error.message : String(error));
      updateMessage(streamingMessageId.toString(), { content: errorMessage });
      debugVoiceSteps.llmResponse('', false, errorMessage);
      
      // Re-throw the error so the voice pipeline can handle it
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Voice input handlers
  const handleVoiceInput = () => {
    setShowRealtimeVoiceModal(true);
  };

  const handleVoiceTranscription = (transcription: string) => {
    console.log('🎤 Voice transcription received:', transcription);
    console.log('🎤 Transcription length:', transcription.length);
    console.log('🎤 Transcription content:', JSON.stringify(transcription));
    
    // Start pipeline debugging
    const debugger = startVoicePipelineDebug();
    debugVoiceSteps.sttFinalResult(transcription);

    setShowVoiceModal(false);
    setShowRealtimeVoiceModal(false);

    // Validate transcription before sending
    if (!transcription || transcription.trim().length === 0) {
      console.warn('⚠️ Empty transcription received, not sending to LLM');
      debugVoiceSteps.sttError('Empty transcription received');
      addMessage('❌ No speech detected. Please try again.', 'assistant');
      finishVoicePipelineDebug();
      return;
    }

    const cleanTranscription = transcription.trim();
    console.log('🚀 Processing voice transcription:', cleanTranscription);
    
    // Add the user's spoken message to the chat
    addMessage(cleanTranscription, 'user');
    debugVoiceSteps.uiUpdate('user_message', cleanTranscription);

    // Check system readiness - be more lenient but log warnings
    if (!systemReady) {
      console.warn('⚠️ System not ready, but attempting to process voice input anyway');
      debugger.log('system_not_ready_warning', { systemReady });
    }

    if (!modelHealth.isAvailable && modelHealth.connectionState !== 'checking') {
      console.warn('⚠️ Model not available, but attempting voice input anyway');
      debugger.log('model_not_available_warning', { modelHealth });
    }

    console.log('🚀 All checks passed, sending transcription to LLM:', cleanTranscription);
    debugVoiceSteps.llmRequestStart(cleanTranscription);

    // Send the transcribed text as a message with a small delay to ensure UI updates
    setTimeout(() => {
      console.log('🚀 Calling handleSendMessage with transcription');
      handleSendMessage(cleanTranscription).then(() => {
        debugVoiceSteps.pipelineComplete();
        const debugData = finishVoicePipelineDebug();
        if (debugData) {
          console.log('🔍 Voice pipeline debug data:', debugData);
        }
      }).catch((error) => {
        debugVoiceSteps.llmResponse('', false, error.message);
        finishVoicePipelineDebug();
      });
    }, 100);
  };

  const handleVoiceRecordingStateChange = (isRecording: boolean) => {
    console.log('🎤 Voice recording state changed:', isRecording);
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full">
        {/* Header with Status Badges */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Privacy AI Assistant
            </h1>
            <ModelStatusBadge
              status={modelHealth}
              showDetails={true}
              onRefresh={() => modelHealthChecker.forceCheck()}
            />
            <HardwareStatusBadge />
          </div>
          <div className="flex items-center space-x-2">
            {!systemReady && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-full text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>System Starting...</span>
              </div>
            )}
          </div>
        </div>:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Voice input"
            >
              🎤
            </button>
          )}

          {/* Stop Response Button - Show during loading or streaming */}
          {(streamingState.isStreaming || (isLoading && currentStreamingMessageId.current)) && (
            <button
              type="button"
              onClick={async () => {
                console.log('⏹️ Stop button clicked');
                if (streamingState.isStreaming) {
                  console.log('⏹️ Stopping active stream');
                  await stopStream();
                } else if (currentStreamingMessageId.current) {
                  console.log('⏹️ Canceling loading state');
                  // Cancel the loading state and update the message
                  setLoading(false);
                  updateMessage(currentStreamingMessageId.current, {
                    content: '❌ Response canceled by user'
                  });
                  currentStreamingMessageId.current = null;
                }
              }}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded-md hover:bg-red-600"
              title="Stop response"
            >
              ⏹️ Stop
            </button>
          )}

          {/* Test Buttons */}
          {TAURI_ENV.isTauri && (
            <>
              <button
                type="button"
                onClick={handleTestStreaming}
                disabled={isLoading || streamingState.isStreaming}
                className="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Test streaming functionality"
              >
                🧪 Test Stream
              </button>
              <button
                type="button"
                onClick={handleTestVosk}
                disabled={isLoading || streamingState.isStreaming}
                className="px-3 py-1 text-xs bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Test Vosk STT installation"
              >
                🎤 Test Vosk
              </button>
              <button
                type="button"
                onClick={handleTestVoicePipeline}
                disabled={isLoading || streamingState.isStreaming}
                className="px-3 py-1 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Test voice-to-LLM pipeline"
              >
                🔄 Test Pipeline
              </button>
              <button
                type="button"
                onClick={handleTestPythonBackend}
                disabled={isLoading || streamingState.isStreaming}
                className="px-3 py-1 text-xs bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Test Python backend integration"
              >
                🐍 Test Backend
              </button>
              <button
                type="button"
                onClick={handleTestStaticSTT}
                disabled={isLoading || streamingState.isStreaming}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Test STT with static file"
              >
                🧪 Test STT
              </button>
            </>
          )}

          {/* Diagnostic Toggle */}
          <button
            type="button"
            onClick={() => setShowDiagnostic(!showDiagnostic)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Toggle diagnostic panel"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {/* TTS Toggle */}
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={() => setTtsEnabled(!ttsEnabled)}
              disabled={!systemReady}
              className="sr-only"
            />
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              ttsEnabled && systemReady ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            } ${!systemReady ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                ttsEnabled && systemReady ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </div>
            <span className={`ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 ${
              !systemReady ? 'opacity-50' : ''
            }`}>
              🔊 Voice Output
            </span>
          </label>
        </div>
      </div>
      
      {/* System Not Ready Warning */}
      {!systemReady && !showDiagnostic && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mx-4 mt-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                System Not Ready
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Some critical components are not available. Chat and voice features are disabled.
              </p>
              <button
                type="button"
                onClick={() => setShowDiagnostic(true)}
                className="mt-2 text-sm text-yellow-800 dark:text-yellow-200 underline hover:no-underline"
              >
                View diagnostic details
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Chat window */}
      <div
        id="chat-window"
        className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900"
      >
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* Welcome message when system is ready */}
          {systemReady && messages.length === 0 && (
            <div className="text-center py-8">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                <h2 className="text-lg font-medium mb-2">Welcome to Privacy AI Assistant</h2>
                <p className="text-sm">Your offline AI assistant is ready. Start a conversation below.</p>
              </div>
            </div>
          )}
          
          {/* Messages */}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          
          {/* Thinking Indicator */}
          <ThinkingIndicator isVisible={isLoading} />
        </div>
      </div>

      {/* Input area */}
      <InputArea
        onSendMessage={handleSendMessage}
        disabled={!systemReady || !modelHealth.isAvailable || streamingState.isStreaming}
        placeholder={streamingState.isStreaming ? "AI is responding..." : "Type your message..."}
      />
      
      {/* Diagnostic Panel */}
      {showDiagnostic && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-2xl w-full mx-4">
            <StartupDiagnostic
              onDiagnosticComplete={handleDiagnosticComplete}
              className="relative"
            />
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowDiagnostic(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Recording Modal */}
      {showVoiceModal && (
        <VoiceRecordingModal
          isOpen={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          onTranscriptionComplete={handleVoiceTranscription}
          onRecordingStateChange={handleVoiceRecordingStateChange}
        />
      )}

      {/* Real-time Voice Recording Modal */}
      {showRealtimeVoiceModal && (
        <RealtimeVoiceModal
          isOpen={showRealtimeVoiceModal}
          onClose={() => setShowRealtimeVoiceModal(false)}
          onTranscriptionComplete={handleVoiceTranscription}
          onRecordingStateChange={handleVoiceRecordingStateChange}
        />
      )}
      </div>
    </ErrorBoundary>
  );
};

export default ChatInterface;

