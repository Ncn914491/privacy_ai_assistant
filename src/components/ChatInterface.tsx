import React, { useEffect, useState } from 'react';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import { useChatStore } from '../stores/chatStore';
import { invoke } from '@tauri-apps/api/core';
import { modelHealthChecker, ModelHealthStatus } from '../utils/modelHealth';

const ChatInterface: React.FC = () => {
  const { messages, addMessage, setLoading } = useChatStore();
  const [modelHealth, setModelHealth] = useState<ModelHealthStatus>({
    isAvailable: false,
    isChecking: false,
    lastChecked: null,
    error: null,
  });

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
    modelHealthChecker.startPeriodicCheck(30000); // Check every 30 seconds

    return unsubscribe;
  }, []);

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
      // First check if model is available
      const isHealthy = await modelHealthChecker.checkHealth();
      
      if (!isHealthy) {
        throw new Error('Gemma 3n model is not running. Please start it via Ollama.');
      }
      
      console.log('Sending request to generate_llm_response...');
      const response = await invoke<string>('generate_llm_response', { prompt: content });
      
      if (!response || response.trim().length === 0) {
        throw new Error('Empty or malformed response from the model.');
      }
      
      console.log('Received response from LLM:', response.substring(0, 100) + '...');
      addMessage(response.trim(), 'assistant');
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
      {/* Model Status Indicator */}
      {!modelHealth.isAvailable && (
        <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3 mx-4 mt-4 rounded">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">
                {modelHealth.isChecking ? 'Checking model status...' : 'Gemma 3n model is not running. Please start it via Ollama.'}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Chat window */}
      <div
        id="chat-window"
        className="flex-1 overflow-y-auto px-4 py-6 bg-gray-100 dark:bg-gray-900"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      {/* Input area */}
      <InputArea onSendMessage={handleSendMessage} />
    </div>
  );
};

export default ChatInterface;

