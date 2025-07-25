import React, { useEffect, useState, useRef } from 'react';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import ModelStatusBadge from './ModelStatusBadge';
import HardwareStatusBadge from './HardwareStatusBadge';
import ThinkingIndicator from './ThinkingIndicator';
import EnhancedVoiceModal from './EnhancedVoiceModal';
import EnhancedPluginPanel from './EnhancedPluginPanel';
import SystemSettingsPanel from './SystemSettingsPanel';
import { useEnhancedChatStore } from '../stores/enhancedChatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/chatStore';
import { useEnhancedStreaming } from '../hooks/useEnhancedStreaming';
import { useEnhancedVoice } from '../hooks/useEnhancedVoice';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';
import {
  Settings,
  WifiOff,
  Cpu,
  Globe,
  Package,
  Mic,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Square
} from 'lucide-react';
import { cn } from '../utils/cn';

const EnhancedChatInterface: React.FC = () => {
  const [modelHealth, setModelHealth] = useState<ModelHealthStatus | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showPluginPanel, setShowPluginPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [networkStatus, setNetworkStatus] = useState(() => {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  });

  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Store hooks
  const {
    messages,
    addMessageWithMetadata,
    setLoading,
    isLoading,
    activeChatId,
    initializeStore,
    isInitialized
  } = useEnhancedChatStore();

  const { settings } = useSettingsStore();
  const { llmPreferences, setPreferredProvider, pluginsEnabled, setPluginsEnabled } = useAppStore();

  // Enhanced hooks
  const streaming = useEnhancedStreaming();
  const voice = useEnhancedVoice();

  // Initialize stores
  useEffect(() => {
    if (!isInitialized) {
      initializeStore();
    }
  }, [isInitialized, initializeStore]);

  // Subscribe to model health status
  useEffect(() => {
    const unsubscribe = modelHealthChecker.subscribe((status) => {
      setModelHealth(status);
    });

    modelHealthChecker.startPeriodicCheck(15000);
    return unsubscribe;
  }, []);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setNetworkStatus(true);
    const handleOffline = () => setNetworkStatus(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (chatWindowRef.current && settings.streamingConfig.autoScroll) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, streaming.streamingState.streamedContent, settings.streamingConfig.autoScroll]);

  // Auto-play TTS for assistant messages
  useEffect(() => {
    if (settings.voiceConfig.autoPlayTTS && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && !streaming.streamingState.isStreaming) {
        voice.speakText(lastMessage.content);
      }
    }
  }, [messages, streaming.streamingState.isStreaming, settings.voiceConfig.autoPlayTTS]);

  const handleSendMessage = async (message: string, options?: { mode?: 'online' | 'offline'; model?: string }) => {
    if (!message.trim() || isLoading) return;

    try {
      setLoading(true);

      // Add user message with metadata
      addMessageWithMetadata(message, 'user', {
        model: options?.model,
        provider: options?.mode === 'online' ? 'online' : 'local'
      });

      // Start streaming response
      const fullResponse = await streaming.startStream(message, {
        mode: options?.mode,
        model: options?.model,
        systemPrompt: settings.systemInstructions.systemPrompt,
        onChunk: (chunk: string, metadata?: any) => {
          console.log('📝 Streaming chunk received:', chunk);
        },
        onComplete: (fullContent: string, metadata?: any) => {
          console.log('✅ Streaming completed');
          // Add the complete response as an assistant message
          addMessageWithMetadata(fullContent, 'assistant', {
            model: metadata?.model,
            provider: metadata?.provider,
            tokens: metadata?.totalTokens
          });
        },
        onError: (error: string) => {
          console.error('❌ Streaming error:', error);
          addMessageWithMetadata(
            `❌ **Error**: ${error}\n\nPlease try again or check your connection.`,
            'assistant'
          );
        }
      });

    } catch (error) {
      console.error('Error sending message:', error);
      const errorStr = error instanceof Error ? error.message : String(error);
      addMessageWithMetadata(
        `❌ **Unexpected Error**: ${errorStr}\n\nPlease try again or check the system status.`,
        'assistant'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceRecord = () => {
    setShowVoiceModal(true);
  };

  const handleVoiceTranscription = (text: string) => {
    if (text.trim()) {
      handleSendMessage(text);
    }
  };

  const handleToggleTTS = () => {
    if (voice.voiceState.isTTSPlaying) {
      voice.stopSpeaking();
    }
  };

  const handleStreamingControl = () => {
    if (streaming.streamingState.isStreaming) {
      streaming.stopStream();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900" data-chat-container>
      {/* Enhanced Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Privacy AI Assistant
            </h1>
            
            {/* Active Chat Indicator */}
            {activeChatId && (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                Chat Active
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {/* System Status */}
            {settings.uiPreferences.showSystemStatus && (
              <>
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
              </>
            )}

            {/* LLM Provider Status */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {llmPreferences.preferredProvider === 'local' ? (
                <Cpu className="w-4 h-4 text-blue-600" />
              ) : (
                <Globe className="w-4 h-4 text-green-600" />
              )}
              <span className="text-sm font-medium">
                {llmPreferences.preferredProvider === 'local' ? 'Local' : 'Online'}
              </span>
              {!networkStatus && <WifiOff className="w-4 h-4 text-red-500" />}
            </div>

            {/* Voice Controls */}
            {settings.voiceConfig.sttEnabled && (
              <button
                type="button"
                onClick={handleVoiceRecord}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  voice.voiceState.isRecording
                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
                title="Voice Input"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            {settings.voiceConfig.ttsEnabled && (
              <button
                type="button"
                onClick={handleToggleTTS}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  voice.voiceState.isTTSPlaying
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
                title={voice.voiceState.isTTSPlaying ? "Stop TTS" : "TTS Ready"}
              >
                {voice.voiceState.isTTSPlaying ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Streaming Controls */}
            {streaming.streamingState.isStreaming && (
              <button
                type="button"
                onClick={handleStreamingControl}
                className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                title="Stop Streaming"
              >
                <Square className="w-4 h-4" />
              </button>
            )}

            {/* Plugin Manager */}
            <button
              type="button"
              onClick={() => setShowPluginPanel(true)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                pluginsEnabled
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
              title="Plugin Manager"
            >
              <Package className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={() => setShowSettingsPanel(true)}
              className="p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="System Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Streaming Status */}
        {streaming.streamingState.isStreaming && (
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-4">
              <span>🔄 Streaming response...</span>
              <span>{streaming.streamingState.totalTokens} tokens</span>
              <span>{Math.round(streaming.streamingState.streamingSpeed)} tokens/sec</span>
            </div>
            {streaming.streamingState.estimatedTimeRemaining > 0 && (
              <span>~{Math.round(streaming.streamingState.estimatedTimeRemaining)}s remaining</span>
            )}
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <div 
        ref={chatWindowRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <p className="text-lg mb-2">Welcome to Enhanced Privacy AI Assistant</p>
            <p className="text-sm mb-4">
              Your privacy-first AI assistant with advanced features:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="font-medium mb-2">🤖 Dual AI Models</h3>
                <p className="text-xs">Switch between local Gemma and online Gemini models</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="font-medium mb-2">🎙️ Voice Features</h3>
                <p className="text-xs">Speech-to-text input and text-to-speech responses</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="font-medium mb-2">💬 Chat History</h3>
                <p className="text-xs">Persistent chat sessions with full history</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="font-medium mb-2">🔌 Plugin System</h3>
                <p className="text-xs">Extensible functionality with smart plugins</p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const isLastAssistantMessage = message.role === 'assistant' && index === messages.length - 1;
            const shouldShowStreaming = streaming.streamingState.isStreaming && isLastAssistantMessage;

            return (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={shouldShowStreaming}
                streamingText={shouldShowStreaming ? streaming.streamingState.streamedContent : ''}
              />
            );
          })
        )}
        
        {/* Enhanced Thinking Indicator */}
        {(isLoading || streaming.streamingState.isStreaming) && (
          <ThinkingIndicator
            isVisible={isLoading || streaming.streamingState.isStreaming}
            isStreaming={streaming.streamingState.isStreaming}
            streamingText={streaming.streamingState.streamedContent}
          />
        )}
      </div>

      {/* Enhanced Input Area */}
      <InputArea
        onSendMessage={handleSendMessage}
        onVoiceRecord={settings.voiceConfig.sttEnabled ? handleVoiceRecord : undefined}
        disabled={!isInitialized}
        isLoading={isLoading || streaming.streamingState.isStreaming}
        showVoiceControls={settings.voiceConfig.sttEnabled || settings.voiceConfig.ttsEnabled}
      />

      {/* Enhanced Voice Modal */}
      <EnhancedVoiceModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onTranscriptionComplete={handleVoiceTranscription}
        onSendMessage={handleSendMessage}
        autoSend={false}
      />

      {/* Enhanced Plugin Panel */}
      <EnhancedPluginPanel
        isOpen={showPluginPanel}
        onClose={() => setShowPluginPanel(false)}
      />

      {/* System Settings Panel */}
      <SystemSettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
      />
    </div>
  );
};

export default EnhancedChatInterface;
