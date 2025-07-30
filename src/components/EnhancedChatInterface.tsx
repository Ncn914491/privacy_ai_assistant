import React, { useEffect, useState, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import ModelStatusBadge from './ModelStatusBadge';
import HardwareStatusBadge from './HardwareStatusBadge';
import ThinkingIndicator from './ThinkingIndicator';
import EnhancedVoiceModal from './EnhancedVoiceModal';
import EnhancedPluginPanel from './EnhancedPluginPanel';
import RealtimeVoiceConversation from './RealtimeVoiceConversation';
import SystemSettingsPanel from './SystemSettingsPanel';
import SystemPromptPanel from './SystemPromptPanel';
import ContextWindowIndicator from './ContextWindowIndicator';
import { useEnhancedChatStore } from '../stores/enhancedChatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/chatStore';
import { useEnhancedStreaming } from '../hooks/useEnhancedStreaming';
import { useEnhancedVoice } from '../hooks/useEnhancedVoice';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';
import { PluginRunner } from '../core/agents/pluginRunner';
import { PluginLoaderImpl } from '../core/plugins/loader';
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
  Square,
  FileText
} from 'lucide-react';
import { cn } from '../utils/cn';

const EnhancedChatInterface: React.FC = () => {
  const [modelHealth, setModelHealth] = useState<ModelHealthStatus | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showPluginPanel, setShowPluginPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showSystemPromptPanel, setShowSystemPromptPanel] = useState(false);
  const [showRealtimeVoice, setShowRealtimeVoice] = useState(false);
  const [globalTTSEnabled, setGlobalTTSEnabled] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('globalTTSEnabled');
    return saved ? JSON.parse(saved) : false;
  });
  const [contextNotification, setContextNotification] = useState<string | null>(null);
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
    chatSessions,
    addMessageWithMetadata,
    addMessageDirect,
    updateMessage,
    setLoading,
    isLoading,
    activeChatId,
    initializeStore,
    isInitialized,
    // Context management
    tokenCount,
    maxTokens,
    isOptimizing,
    lastOptimization,
    calculateTokenUsage,
    pruneOldMessages,
    clearAllContext,
    updateTokenCount
  } = useEnhancedChatStore();

  const { settings } = useSettingsStore();
  const { llmPreferences, setPreferredProvider, pluginsEnabled, setPluginsEnabled } = useAppStore();

  // Enhanced hooks
  const streaming = useEnhancedStreaming();
  const voice = useEnhancedVoice();

  // Context management handlers
  const handlePruneContext = useCallback(async () => {
    setContextNotification('Optimizing memory...');
    try {
      await pruneOldMessages();
      setContextNotification('Memory optimized');
      setTimeout(() => setContextNotification(null), 3000);
    } catch (error) {
      console.error('Failed to prune context:', error);
      setContextNotification('Optimization failed');
      setTimeout(() => setContextNotification(null), 3000);
    }
  }, [pruneOldMessages]);

  const handleClearContext = useCallback(() => {
    setContextNotification('Clearing all memory...');
    clearAllContext();
    setContextNotification('Memory cleared');
    setTimeout(() => setContextNotification(null), 3000);
  }, [clearAllContext]);

  // Update token count when messages change
  useEffect(() => {
    updateTokenCount();
  }, [messages, updateTokenCount]);

  // Enhanced tool context integration
  const getToolContext = useCallback(() => {
    try {
      const toolContext = JSON.parse(localStorage.getItem('toolContext') || '{}');
      console.log('🛠️ [CHAT] Retrieved tool context:', toolContext);

      // Format tool context for better LLM understanding
      if (Object.keys(toolContext).length > 0) {
        return {
          ...toolContext,
          formattedContext: formatToolContextForLLM(toolContext)
        };
      }

      return {};
    } catch (error) {
      console.error('❌ [CHAT] Failed to retrieve tool context:', error);
      return {};
    }
  }, []);

  // Format tool context for LLM consumption
  const formatToolContextForLLM = useCallback((context: any): string => {
    if (!context || Object.keys(context).length === 0) {
      return '';
    }

    let formatted = '\n\n--- TOOL CONTEXT ---\n';

    if (context.toolName) {
      formatted += `Tool: ${context.toolName}\n`;
    }

    if (context.timestamp) {
      formatted += `Last Updated: ${new Date(context.timestamp).toLocaleString()}\n`;
    }

    if (context.data && Array.isArray(context.data)) {
      formatted += `\nTool Data (${context.data.length} items):\n`;
      context.data.forEach((item: any, index: number) => {
        formatted += `${index + 1}. ${item.title || 'Untitled'}\n`;
        if (item.content) {
          formatted += `   ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}\n`;
        }
      });
    }

    if (context.context) {
      formatted += `\nAdditional Context:\n${context.context}\n`;
    }

    formatted += '--- END TOOL CONTEXT ---\n\n';

    return formatted;
  }, []);

  // Initialize stores and plugins
  useEffect(() => {
    const initialize = async () => {
      if (!isInitialized) {
        await initializeStore();
      }

      // Load plugins if enabled
      if (pluginsEnabled) {
        try {
          const pluginLoader = new PluginLoaderImpl();
          await pluginLoader.loadAllPlugins();
          console.log('✅ Plugins loaded successfully');
        } catch (error) {
          console.error('❌ Failed to load plugins:', error);
        }
      }
    };

    initialize();

    // Fallback: Force initialization after 5 seconds to prevent permanent input blocking
    const fallbackTimer = setTimeout(() => {
      if (!isInitialized) {
        console.warn('⚠️ Forcing initialization after timeout to prevent input blocking');
        initializeStore();
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [isInitialized, initializeStore, pluginsEnabled]);

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

  // State to track the current assistant message being streamed
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null);
  const currentAssistantMessageIdRef = useRef<string | null>(null); // FIXED: Use ref for immediate access

  // Helper function to update the assistant message during streaming
  const updateAssistantMessage = useCallback((content: string, isComplete: boolean, messageId?: string) => {
    // FIXED: Use provided messageId or fall back to ref, not state
    const targetMessageId = messageId || currentAssistantMessageIdRef.current;
    
    if (!targetMessageId) {
      console.warn('❌ [CHAT] No current assistant message ID to update');
      return;
    }

    // FIXED: Ensure content is not empty
    if (!content || !content.trim()) {
      console.warn('⚠️ [CHAT] Empty content received, skipping update');
      return;
    }

    console.log(`🔄 [CHAT] Updating assistant message ${targetMessageId} with ${content.length} chars, complete: ${isComplete}`);
    
    // Update the message using the store's updateMessage function
    updateMessage(targetMessageId, {
      content: content,
      metadata: {
        isStreaming: !isComplete,
        lastUpdated: new Date()
      }
    });

    // Clear the tracking ID when streaming is complete
    if (isComplete) {
      console.log(`✅ [CHAT] Completed streaming for message ${targetMessageId}`);
      setCurrentAssistantMessageId(null);
      currentAssistantMessageIdRef.current = null;
    }
  }, [updateMessage]);

  const handleSendMessage = async (message: string, options?: { mode?: 'online' | 'offline'; model?: string }) => {
    // FIXED: Check for streaming state to prevent concurrent requests
    if (!message.trim() || isLoading || streaming.streamingState.isStreaming) {
      console.log('🚫 [CHAT] Message blocked:', {
        empty: !message.trim(),
        loading: isLoading,
        streaming: streaming.streamingState.isStreaming
      });
      return;
    }

    // FIXED: Clear any existing assistant message tracking
    if (currentAssistantMessageIdRef.current) {
      console.log('🧹 [CHAT] Clearing previous assistant message tracking');
      setCurrentAssistantMessageId(null);
      currentAssistantMessageIdRef.current = null;
    }

    try {
      setLoading(true);

      // FIXED: Add user message with metadata and ensure proper ordering
      const userMessageId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      addMessageWithMetadata(message, 'user', {
        model: options?.model || 'gemma3n:latest',
        provider: options?.mode === 'online' ? 'online' : 'local'
      });

      // Check if plugins are enabled and try plugin execution first
      if (pluginsEnabled) {
        try {
          const pluginRunner = new PluginRunner({
            enableLogging: true,
            fallbackToLLM: true,
            maxExecutionTime: 30000
          });

          const pluginResult = await pluginRunner.processInput(message, {
            chatId: activeChatId || 'default',
            userId: 'user',
            timestamp: new Date()
          });

          if (pluginResult.shouldExecutePlugin && pluginResult.pluginResult?.success) {
            // Plugin executed successfully
            const pluginResponse = pluginResult.pluginResult.message ||
                                 JSON.stringify(pluginResult.pluginResult.data, null, 2) ||
                                 'Plugin executed successfully';

            addMessageWithMetadata(pluginResponse, 'assistant', {
              model: 'plugin-system',
              provider: 'plugin'
            });

            setLoading(false);
            return; // Don't proceed to LLM if plugin handled the request
          }
        } catch (pluginError) {
          console.warn('Plugin execution failed, falling back to LLM:', pluginError);
        }
      }

      // FIXED: Create a placeholder assistant message for streaming with proper isolation
      console.log(`🏷️ [CHAT] Creating placeholder assistant message for streaming`);

      // FIXED: Generate a unique ID for the assistant message with better isolation
      const assistantMessageId = `assistant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // FIXED: Set both state and ref immediately for proper tracking
      setCurrentAssistantMessageId(assistantMessageId);
      currentAssistantMessageIdRef.current = assistantMessageId;

      console.log(`🏷️ [CHAT] Created assistant message with ID: ${assistantMessageId}`);

      // FIXED: Add the placeholder message with the specific ID and initial content
      const assistantMessage = {
        id: assistantMessageId,
        content: 'Thinking...', // FIXED: Add initial content to prevent empty box
        role: 'assistant' as const,
        timestamp: new Date(),
        metadata: {
          model: options?.model || 'gemma3n:latest',
          provider: options?.mode === 'online' ? 'online' : 'local',
          isStreaming: true,
          isPlaceholder: true // FIXED: Mark as placeholder for proper handling
        }
      };

      // FIXED: Add message directly to store using the new function
      addMessageDirect(assistantMessage);

      // FIXED: Wait a moment for the message to be added to the store
      await new Promise(resolve => setTimeout(resolve, 50));

      // REWRITTEN: Start streaming with enhanced error handling and logging
      console.log('🚀 [CHAT] Starting LLM streaming...');
      console.log('🔧 [CHAT] Stream options:', {
        mode: options?.mode || 'offline',
        model: options?.model || 'gemma3n:latest',
        systemPrompt: settings.systemInstructions.systemPrompt ? 'present' : 'none'
      });

      // Get tool context for LLM integration
      const toolContext = getToolContext();

      // FIXED: Capture the message ID in closure to ensure proper isolation
      const capturedMessageId = assistantMessageId;

      await streaming.startStream(message, {
        mode: options?.mode || 'offline',
        model: options?.model || 'gemma3n:latest',
        systemPrompt: settings.systemInstructions.systemPrompt,
        toolContext: toolContext,
        onChunk: (accumulatedContent: string, metadata?: any) => {
          console.log(`📝 [CHAT] Chunk received for message ${capturedMessageId} - Content length: ${accumulatedContent.length} chars`);
          console.log(`📊 [CHAT] Metadata:`, metadata);

          // FIXED: Use captured message ID to ensure proper message targeting
          if (accumulatedContent && accumulatedContent.trim()) {
            updateAssistantMessage(accumulatedContent, false, capturedMessageId);
          }
        },
        onComplete: (finalContent: string, metadata?: any) => {
          console.log(`✅ [CHAT] Streaming completed for message ${capturedMessageId} - Final length: ${finalContent.length} chars`);
          console.log(`📊 [CHAT] Final metadata:`, metadata);

          // FIXED: Use captured message ID to ensure proper message targeting
          updateAssistantMessage(finalContent || 'No response generated', true, capturedMessageId);

          // FIXED: Trigger TTS if voice output is enabled OR global TTS is enabled
          const shouldSpeak = (settings.voiceConfig.ttsEnabled && settings.voiceConfig.autoPlayTTS) || globalTTSEnabled;
          if (shouldSpeak && finalContent && finalContent.trim()) {
            console.log('🔊 [CHAT] Triggering TTS for completed response (Global TTS:', globalTTSEnabled, ')');
            voice.speakText(finalContent, { interrupt: false }).catch(error => {
              console.error('❌ [CHAT] TTS failed:', error);
            });
          }
        },
        onError: (error: string) => {
          console.error('❌ [CHAT] Streaming error for message', capturedMessageId, ':', error);

          // FIXED: Show detailed error message with captured message ID
          const errorMessage = `❌ **Streaming Error**: ${error}\n\n` +
                              `**Troubleshooting:**\n` +
                              `• Check your internet connection for online models\n` +
                              `• Ensure Ollama is running for local models\n` +
                              `• Try switching between online/offline modes\n\n` +
                              `Please try again or contact support if the issue persists.`;

          updateAssistantMessage(errorMessage, true, capturedMessageId);
        }
      });

      console.log('🏁 [CHAT] Streaming request initiated successfully');

    } catch (error) {
      console.error('❌ [CHAT] Error in handleSendMessage:', error);
      
      // FIXED: Show error message in chat with current message ID
      const errorMessage = `❌ **Error**: ${error instanceof Error ? error.message : String(error)}`;
      updateAssistantMessage(errorMessage, true, currentAssistantMessageIdRef.current);
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

  const handleGlobalTTSToggle = () => {
    const newState = !globalTTSEnabled;
    setGlobalTTSEnabled(newState);
    localStorage.setItem('globalTTSEnabled', JSON.stringify(newState));
    console.log('🔊 Global TTS toggled:', newState ? 'enabled' : 'disabled');
  };

  // Effect to persist global TTS setting
  useEffect(() => {
    localStorage.setItem('globalTTSEnabled', JSON.stringify(globalTTSEnabled));
  }, [globalTTSEnabled]);

  const handleStreamingControl = async () => {
    if (streaming.streamingState.isStreaming) {
      console.log('⏹️ [CHAT] Stopping stream and cleaning up states...');

      try {
        // Stop the stream
        await streaming.stopStream();

        // Force clear all loading states
        setLoading(false);
        setCurrentAssistantMessageId(null);
        currentAssistantMessageIdRef.current = null;

        // If there's a current assistant message, mark it as complete
        if (currentAssistantMessageIdRef.current) {
          updateMessage(currentAssistantMessageIdRef.current, {
            metadata: {
              isStreaming: false,
              lastUpdated: new Date()
            }
          });
        }

        console.log('✅ [CHAT] Stream stopped and states cleaned up');
      } catch (error) {
        console.error('❌ [CHAT] Error stopping stream:', error);
        // Force clear states even if stop fails
        setLoading(false);
        setCurrentAssistantMessageId(null);
        currentAssistantMessageIdRef.current = null;
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900" data-chat-container>
      {/* Enhanced Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
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

                {/* Context Window Indicator */}
                <ContextWindowIndicator
                  tokenCount={tokenCount}
                  maxTokens={maxTokens}
                  onPruneRequested={handlePruneContext}
                  onClearContext={handleClearContext}
                  isOptimizing={isOptimizing}
                  lastOptimization={lastOptimization}
                  className="w-64"
                />
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
                  "p-2 rounded-lg transition-all duration-200 sidebar-button",
                  voice.voiceState.isRecording
                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-md"
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

            {/* Global TTS Toggle */}
            <button
              type="button"
              onClick={handleGlobalTTSToggle}
              className={cn(
                "p-2 rounded-lg transition-all duration-200 border-2 sidebar-button focus-enhanced",
                globalTTSEnabled
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600 shadow-md"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600"
              )}
              title={globalTTSEnabled ? "Global TTS: ON - All AI responses will be read aloud" : "Global TTS: OFF - Click to enable automatic speech for all AI responses"}
            >
              {globalTTSEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

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

            {/* System Prompt Editor */}
            <button
              type="button"
              onClick={() => setShowSystemPromptPanel(true)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                settings.systemInstructions.systemPrompt
                  ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
              title="System Prompt Editor"
            >
              <FileText className="w-4 h-4" />
            </button>

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

        {/* Context Notification */}
        {contextNotification && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg animate-fade-in">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">{contextNotification}</span>
            </div>
          </div>
        )}

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
        id="chat-window"
        className="flex-1 overflow-y-auto p-4 space-y-4 chat-container scroll-smooth"
        data-chat-container
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

            // Message content is updated in real-time during streaming via updateMessage
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
        
        {/* FIXED: Only show ThinkingIndicator when loading, not when streaming */}
        {/* Streaming responses are displayed in real-time within MessageBubble to prevent duplicates */}
        {isLoading && !streaming.streamingState.isStreaming && (
          <ThinkingIndicator
            isVisible={true}
            isStreaming={false}
            streamingText=""
          />
        )}

        {/* Stop Button for Streaming - Show as floating button when streaming */}
        {streaming.streamingState.isStreaming && (
          <div className="fixed bottom-20 right-6 z-50">
            <button
              type="button"
              onClick={handleStreamingControl}
              className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-105"
              title="Stop AI response generation"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <rect x="6" y="6" width="8" height="8" rx="1" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Enhanced Input Area */}
      <InputArea
        onSendMessage={handleSendMessage}
        onVoiceRecord={settings.voiceConfig.sttEnabled ? handleVoiceRecord : undefined}
        onRealtimeVoiceToggle={() => setShowRealtimeVoice(true)}
        onVoiceInput={(text: string) => {
          console.log('🎤 Voice input received:', text);
          // The voice input handler already sends the message, so we don't need to do anything here
        }}
        disabled={false}
        isLoading={isLoading || streaming.streamingState.isStreaming}
        placeholder={!isInitialized ? "Initializing..." : "Type your message..."}
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

      {/* System Prompt Panel */}
      <SystemPromptPanel
        isOpen={showSystemPromptPanel}
        onClose={() => setShowSystemPromptPanel(false)}
      />

      {/* Realtime Voice Conversation */}
      <RealtimeVoiceConversation
        isOpen={showRealtimeVoice}
        onClose={() => setShowRealtimeVoice(false)}
      />
    </div>
  );
};

export default EnhancedChatInterface;
