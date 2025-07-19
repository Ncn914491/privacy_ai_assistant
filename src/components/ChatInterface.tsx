import React, { useEffect, useState } from 'react';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import ModelStatusBadge from './ModelStatusBadge';
import ThinkingIndicator from './ThinkingIndicator';
import StartupDiagnostic from './StartupDiagnostic';
import { useChatStore } from '../stores/chatStore';
import { invoke } from '@tauri-apps/api/core';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';
import { AlertTriangle, Settings } from 'lucide-react';
import { TAURI_ENV } from '../utils/tauriDetection';

const ChatInterface: React.FC = () => {
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const { messages, addMessage, setLoading, isLoading } = useChatStore();
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

  const handleDiagnosticComplete = (success: boolean, results: any[]) => {
    console.log('Diagnostic complete:', { success, results });
    setSystemReady(success);
    setDiagnosticResults(results);
    
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

  const handleSendMessage = async (content: string) => {
    addMessage(content, 'user');
    setLoading(true);
    
    try {
      // Check if running in Tauri environment
      if (!TAURI_ENV.isTauri) {
        console.warn('⚠️ Running in browser mode - some features may be limited');
        // Don't throw error - allow limited functionality
        // throw new Error('Tauri environment not available. Please run the app in desktop mode.');
      }
      
      // First check if model is available
      const isHealthy = await modelHealthChecker.checkHealth();
      
      if (!isHealthy) {
        throw new Error('Gemma 3n model is not running. Please start it via Ollama.');
      }
      
      console.log('Sending request to generate_llm_response...');

      let response: string;
      try {
        response = await invoke<string>('generate_llm_response', { prompt: content });
      } catch (invokeError) {
        if (!TAURI_ENV.isTauri) {
          // In browser mode, provide a mock response
          response = "I'm running in browser mode with limited functionality. The Gemma 3n model is not available in this environment. Please run the desktop application for full AI capabilities.";
        } else {
          throw invokeError;
        }
      }

      if (!response || response.trim().length === 0) {
        throw new Error('Empty or malformed response from the model.');
      }
      
      console.log('Received response from LLM:', response.substring(0, 100) + '...');
addMessage(response.trim(), 'assistant');
      if (ttsEnabled) {
        invoke('run_piper_tts', { text: response.trim() }).catch((error) => {
          console.error('TTS Error:', error);
        });
      }
    } catch (error) {
      console.error('Error invoking LLM:', error);
      const errorMessage = getErrorMessage(error instanceof Error ? error.message : String(error));
      addMessage(errorMessage, 'assistant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Status Badge */}
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
        </div>
        
        {/* Controls */}
        <div className="flex items-center space-x-4">
          {/* Diagnostic Toggle */}
          <button
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
        disabled={!systemReady || !modelHealth.isAvailable}
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
                onClick={() => setShowDiagnostic(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;

