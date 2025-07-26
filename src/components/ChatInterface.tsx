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
import { useEnhancedChatStore } from '../stores/enhancedChatStore';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';
import { useEnhancedStreaming } from '../hooks/useEnhancedStreaming';
import { Settings, WifiOff, Cpu, Globe, Package, Edit3 } from 'lucide-react';
import EnhancedSidebar from './EnhancedSidebar';
import SystemSettingsPanel from './SystemSettingsPanel';
import { useSettingsStore } from '../stores/settingsStore';

const ChatInterface: React.FC = () => {
  // VOICE COMPONENTS TEMPORARILY DISABLED - Unstable audio/mic/formatting bugs
  // const [showVoiceModal, setShowVoiceModal] = useState(false);
  // const [showRealtimeVoiceModal, setShowRealtimeVoiceModal] = useState(false);
  // const [showRealtimeConversationModal, setShowRealtimeConversationModal] = useState(false);
  // const [showAudioDiagnostic, setShowAudioDiagnostic] = useState(false);
  const [systemReady, setSystemReady] = useState(true); // Start as ready, diagnostic is informational
  const [showDiagnostic, setShowDiagnostic] = useState(true);
  const [modelHealth, setModelHealth] = useState<ModelHealthStatus | null>(null);

  const {
    messages,
    addMessage,
    updateMessage,
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

  // Enhanced chat store for history
  const enhancedChatStore = useEnhancedChatStore();

  const chatWindowRef = useRef<HTMLDivElement>(null);
  const [networkStatus, setNetworkStatus] = useState(() => {
    // Safe check for navigator.onLine in Tauri environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    // Default to true if navigator.onLine is not available (Tauri environment)
    return true;
  });

  // Initialize enhanced streaming hook
  const streaming = useEnhancedStreaming();

  // Streaming state
  const isStreaming = streaming.streamingState.isStreaming;
  const streamingText = streaming.streamingState.streamedContent;

  // Enhanced sidebar state
  const [showSidebar, setShowSidebar] = useState(true);

  // System settings state
  const [showSystemSettings, setShowSystemSettings] = useState(false);

  // Settings store
  const { settings } = useSettingsStore();

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

  // Auto-scroll to bottom when new messages arrive or streaming content updates
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

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
          // Add a placeholder assistant message for streaming
          const assistantMessageId = `assistant-${Date.now()}`;
          addMessage('', 'assistant', assistantMessageId);

          // Get tool context for LLM integration
          const getToolContext = () => {
            try {
              return JSON.parse(localStorage.getItem('toolContext') || '{}');
            } catch {
              return {};
            }
          };

          // Start enhanced streaming response with system prompt and tool context
          const fullResponse = await streaming.startStream(message, {
            mode: 'offline', // Force offline mode for Gemma 3n
            model: 'gemma3n',
            systemPrompt: settings.systemInstructions.systemPrompt,
            toolContext: getToolContext(),
            onChunk: (accumulatedContent: string, metadata?: any) => {
              console.log('📝 Streaming chunk received, length:', accumulatedContent.length);
              // Update the placeholder message with accumulated content in real-time
              updateMessage(assistantMessageId, {
                content: accumulatedContent
              });
            },
            onComplete: (fullContent: string, metadata?: any) => {
              console.log('✅ Streaming completed, final length:', fullContent.length);
              // Update the placeholder message with the final content
              updateMessage(assistantMessageId, {
                content: fullContent
              });
            },
            onError: (error: string) => {
              console.error('❌ Streaming error:', error);
              // Update the placeholder message with error
              updateMessage(assistantMessageId, {
                content: `Error: ${error}`
              });
            }
          });
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
            errorMessage += 'Please check the system status indicators above for more information.';
          } else if (errorStr.toLowerCase().includes('timeout')) {
            errorMessage += '⏱️ **Timeout**: The AI model is taking too long to respond. This might be due to:\n\n';
            errorMessage += '• High system load\n';
            errorMessage += '• Large model loading time\n';
            errorMessage += '• Complex query processing\n\n';
            errorMessage += 'Try a simpler query or wait a moment before trying again.';
          } else if (errorStr.toLowerCase().includes('model') && errorStr.toLowerCase().includes('not found')) {
            errorMessage += '🤖 **Model Not Found**: The Gemma 3n model is not available. Please install it with:\n\n';
            errorMessage += '```bash\nollama pull gemma3n\n```\n\n';
            errorMessage += 'Please ensure the model is properly installed and Ollama is running.';
          } else {
            errorMessage += `❌ **Error Details**: ${errorStr}\n\n`;
            errorMessage += 'Please check the system status indicators above for more information.';
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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Enhanced Sidebar */}
      {showSidebar && <EnhancedSidebar />}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 pb-4">
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

            {/* Gemma 3n Status */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className={`w-2 h-2 rounded-full ${
                modelHealth?.isAvailable ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <Cpu className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">
                Gemma 3n: {modelHealth?.isAvailable ? 'Active' : 'Offline'}
              </span>
            </div>

            {/* Plugin Status & Manager Button */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className={`w-2 h-2 rounded-full ${pluginsEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm font-medium">
                  Plugins {pluginsEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

            </div>



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

            {/* System Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowSystemSettings(true)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title="System Settings & Prompts"
            >
              <Edit3 className="w-4 h-4" />
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
                streamingText=""
              />
            );
          })
        )}

        {/* Thinking Indicator - only show when loading, not when streaming */}
        {isLoading && !isStreaming && (
          <ThinkingIndicator
            isVisible={true}
            isStreaming={false}
            streamingText=""
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

      </div>

      {/* System Settings Panel */}
      <SystemSettingsPanel
        isOpen={showSystemSettings}
        onClose={() => setShowSystemSettings(false)}
      />
    </div>
  );
};

export default ChatInterface;
