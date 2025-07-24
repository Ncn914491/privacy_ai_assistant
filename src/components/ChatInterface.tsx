import React, { useEffect, useState, useRef } from 'react';
import MessageBubble from './MessageBubble';
// VOICE COMPONENTS TEMPORARILY DISABLED - Unstable audio/mic/formatting bugs
// import { VoiceRecordingModal } from './VoiceRecordingModal';
// import RealtimeVoiceModal from './RealtimeVoiceModal';
// import RealtimeConversationModal from './RealtimeConversationModal';
// import AudioDiagnosticPanel from './AudioDiagnosticPanel';
import InputArea from './InputArea';
import ModelStatusBadge from './ModelStatusBadge';
import HardwareStatusBadge from './HardwareStatusBadge';
import ThinkingIndicator from './ThinkingIndicator';
import StartupDiagnostic from './StartupDiagnostic';
import { useMultiChatStore, useAppStore } from '../stores/chatStore';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';
import { useAdaptiveStreaming } from '../hooks/useAdaptiveStreaming';
import { Settings, WifiOff, Cpu, Globe, Package } from 'lucide-react';
import PluginPanel from './PluginPanel';

const ChatInterface: React.FC = () => {
  // VOICE COMPONENTS TEMPORARILY DISABLED - Unstable audio/mic/formatting bugs
  // const [showVoiceModal, setShowVoiceModal] = useState(false);
  // const [showRealtimeVoiceModal, setShowRealtimeVoiceModal] = useState(false);
  // const [showRealtimeConversationModal, setShowRealtimeConversationModal] = useState(false);
  // const [showAudioDiagnostic, setShowAudioDiagnostic] = useState(false);
  const [systemReady, setSystemReady] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(true);
  const [modelHealth, setModelHealth] = useState<ModelHealthStatus | null>(null);

  const {
    messages,
    addMessage,
    setLoading,
    isLoading,
    executePlugin
  } = useMultiChatStore();

  const {
    llmPreferences,
    setPreferredProvider,
    pluginsEnabled,
    setPluginsEnabled
  } = useAppStore();

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const [networkStatus, setNetworkStatus] = useState(() => {
    // Safe check for navigator.onLine in Tauri environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    // Default to true if navigator.onLine is not available (Tauri environment)
    return true;
  });

  // Initialize adaptive streaming hook
  const streaming = useAdaptiveStreaming();

  // Streaming state
  const isStreaming = streaming.streamingState.isStreaming;
  const streamingText = streaming.streamingState.streamedContent;

  // Plugin panel state
  const [showPluginPanel, setShowPluginPanel] = useState(false);

  // Subscribe to model health status
  useEffect(() => {
    const unsubscribe = modelHealthChecker.subscribe((status) => {
      setModelHealth(status);
    });

    // Start periodic health checks
    modelHealthChecker.startPeriodicCheck(15000);

    return unsubscribe;
  }, []);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setNetworkStatus(true);
    const handleOffline = () => setNetworkStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    try {
      setLoading(true);

      // Add user message
      addMessage(message, 'user');

      // First, try to execute a plugin if applicable
      const pluginResult = await executePlugin(message);

      if (pluginResult && pluginResult.success) {
        // Plugin executed successfully, add its response
        const pluginResponse = pluginResult.message || 'Plugin executed successfully.';
        addMessage(pluginResponse, 'assistant');
      } else {
        // No plugin matched or plugin failed, use streaming LLM
        try {
          // Start streaming response
          const fullResponse = await streaming.startStream(
            message,
            // onChunk callback - streaming content is handled by the streaming hook
            (chunk: string) => {
              console.log('📝 Streaming chunk received:', chunk);
            },
            // onComplete callback
            (fullContent: string) => {
              console.log('✅ Streaming completed, full content length:', fullContent.length);
            }
          );

          // Add the complete response as an assistant message
          addMessage(fullResponse, 'assistant');
        } catch (llmError) {
          console.error('LLM routing failed:', llmError);

          // Create a more specific error message based on the error type
          let errorMessage = 'I encountered an issue processing your message. ';
          const errorStr = llmError instanceof Error ? llmError.message : String(llmError);

          if (errorStr.toLowerCase().includes('connect') || errorStr.toLowerCase().includes('unavailable')) {
            errorMessage += '🔌 **Connection Issue**: Cannot connect to the local AI service (Ollama). Please ensure:\n\n';
            errorMessage += '• Ollama is installed and running\n';
            errorMessage += '• The Gemma 3n model is available (`ollama pull gemma3n`)\n';
            errorMessage += '• The service is accessible at http://localhost:11434\n\n';
            errorMessage += 'You can also try using online mode by adding `[use_online]` to your message.';
          } else if (errorStr.toLowerCase().includes('timeout')) {
            errorMessage += '⏱️ **Timeout**: The AI model is taking too long to respond. This might be due to:\n\n';
            errorMessage += '• High system load\n';
            errorMessage += '• Large model loading time\n';
            errorMessage += '• Complex query processing\n\n';
            errorMessage += 'Try a simpler query or wait a moment before trying again.';
          } else if (errorStr.toLowerCase().includes('model') && errorStr.toLowerCase().includes('not found')) {
            errorMessage += '🤖 **Model Not Found**: The Gemma 3n model is not available. Please install it with:\n\n';
            errorMessage += '```bash\nollama pull gemma3n\n```\n\n';
            errorMessage += 'Or try online mode with `[use_online]` in your message.';
          } else {
            errorMessage += `❌ **Error Details**: ${errorStr}\n\n`;
            errorMessage += 'Try using online mode by adding `[use_online]` to your message, or check the system status above.';
          }

          addMessage(errorMessage, 'assistant');
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorStr = error instanceof Error ? error.message : String(error);
      addMessage(`❌ **Unexpected Error**: ${errorStr}\n\nPlease try again or check the system status above.`, 'assistant');
    } finally {
      setLoading(false);
    }
  };

  // VOICE FUNCTIONS TEMPORARILY DISABLED - Unstable audio/mic/formatting bugs
  // const handleVoiceRecord = () => {
  //   setShowVoiceModal(true);
  // };

  // const handleVoiceTranscription = (text: string) => {
  //   if (text.trim()) {
  //     handleSendMessage(text);
  //   }
  // };

  // const handleVoiceRecordingStateChange = (isRecording: boolean) => {
  //   // Handle recording state changes if needed
  //   console.log('Voice recording state:', isRecording);
  // };

  const handleDiagnosticComplete = (success: boolean) => {
    console.log('Diagnostic complete:', { success });
    setSystemReady(success);

    // Auto-hide diagnostic after 3 seconds if successful
    if (success) {
      setTimeout(() => {
        setShowDiagnostic(false);
      }, 3000);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 pb-4">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Privacy AI Assistant
          </h1>
          
          <div className="flex items-center space-x-2">
            <ModelStatusBadge
              status={modelHealth || {
                isAvailable: false,
                isChecking: false,
                lastChecked: null,
                error: 'Not initialized',
                connectionState: 'disconnected' as const,
                modelName: 'gemma3n:latest',
                serviceUrl: 'http://localhost:11434',
                lastSuccessfulCheck: null
              }}
              onRefresh={() => modelHealthChecker.forceCheck()}
            />
            <HardwareStatusBadge />

            {/* LLM Provider Status */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {llmPreferences.preferredProvider === 'local' ? (
                <Cpu className="w-4 h-4 text-blue-600" />
              ) : (
                <Globe className="w-4 h-4 text-green-600" />
              )}
              <span className="text-sm font-medium">
                {llmPreferences.preferredProvider === 'local' ? 'Local (Gemma 3n)' : 'Online (Gemini)'}
              </span>
              {!networkStatus && (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
            </div>

            {/* Plugin Status & Manager Button */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${pluginsEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  Plugins {pluginsEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPluginPanel(true)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Plugin Manager"
              >
                <Package className="w-4 h-4" />
              </button>
            </div>

            {/* Provider Toggle */}
            <button
              type="button"
              onClick={() => setPreferredProvider(llmPreferences.preferredProvider === 'local' ? 'online' : 'local')}
              className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              title={`Switch to ${llmPreferences.preferredProvider === 'local' ? 'online' : 'local'} provider`}
              disabled={!networkStatus && llmPreferences.preferredProvider === 'local'}
            >
              {networkStatus ? (
                llmPreferences.preferredProvider === 'local' ? 'Use Online' : 'Use Local'
              ) : (
                'Offline'
              )}
            </button>

            {/* Plugin Toggle */}
            <button
              type="button"
              onClick={() => setPluginsEnabled(!pluginsEnabled)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                pluginsEnabled
                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={`${pluginsEnabled ? 'Disable' : 'Enable'} plugins`}
            >
              {pluginsEnabled ? 'Disable Plugins' : 'Enable Plugins'}
            </button>

            {/* Diagnostic Toggle */}
            <button
              type="button"
              onClick={() => setShowDiagnostic(!showDiagnostic)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title="Toggle diagnostic"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Startup Diagnostic */}
      {showDiagnostic && (
        <StartupDiagnostic onDiagnosticComplete={handleDiagnosticComplete} />
      )}

      {/* Chat Messages */}
      <div 
        ref={chatWindowRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <p className="text-lg mb-2">Welcome to Privacy AI Assistant</p>
            <p className="text-sm">Start a conversation by typing a message or using voice input</p>
          </div>
        ) : (
          messages.map((message, index) => {
            // Check if this is the last assistant message and we're streaming
            const isLastAssistantMessage = message.role === 'assistant' && index === messages.length - 1;
            const shouldShowStreaming = isStreaming && isLastAssistantMessage;

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={shouldShowStreaming}
                streamingText={shouldShowStreaming ? streamingText : ''}
              />
            );
          })
        )}
        
        {/* Thinking Indicator */}
        {(isLoading || isStreaming) && (
          <ThinkingIndicator
            isVisible={isLoading || isStreaming}
            isStreaming={isStreaming}
            streamingText={streamingText}
          />
        )}
      </div>

      {/* Input Area */}
      <InputArea
        onSendMessage={handleSendMessage}
        // VOICE FUNCTIONALITY - Conditionally enabled based on feature flags
        // onVoiceRecord={isVoiceEnabled ? handleVoiceRecord : undefined}
        disabled={!systemReady}
        isLoading={isLoading}
      />

      {/* VOICE MODALS TEMPORARILY DISABLED - Unstable audio/mic/formatting bugs */}
      {/* Voice Recording Modal */}
      {/* {showVoiceModal && (
        <VoiceRecordingModal
          isOpen={showVoiceModal}
          onClose={() => setShowVoiceModal(false)}
          onTranscriptionComplete={handleVoiceTranscription}
          onRecordingStateChange={handleVoiceRecordingStateChange}
        />
      )} */}

      {/* Real-time Voice Recording Modal */}
      {/* {showRealtimeVoiceModal && (
        <RealtimeVoiceModal
          isOpen={showRealtimeVoiceModal}
          onClose={() => setShowRealtimeVoiceModal(false)}
          onTranscriptionComplete={handleVoiceTranscription}
          onRecordingStateChange={handleVoiceRecordingStateChange}
        />
      )} */}

      {/* Real-time Conversation Modal */}
      {/* {showRealtimeConversationModal && (
        <RealtimeConversationModal
          isOpen={showRealtimeConversationModal}
          onClose={() => setShowRealtimeConversationModal(false)}
        />
      )} */}

      {/* Audio Diagnostic Panel */}
      {/* {showAudioDiagnostic && (
        <AudioDiagnosticPanel
          isOpen={showAudioDiagnostic}
          onClose={() => setShowAudioDiagnostic(false)}
        />
      )} */}

      {/* Plugin Management Panel */}
      <PluginPanel
        isOpen={showPluginPanel}
        onClose={() => setShowPluginPanel(false)}
      />
    </div>
  );
};

export default ChatInterface;
