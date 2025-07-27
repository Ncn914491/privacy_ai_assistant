import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Wifi, WifiOff, ChevronDown, MessageCircle } from 'lucide-react';
import { cn } from '../utils/cn';
import { useAppStore } from '../stores/chatStore';
import { llmRouter } from '../core/agents/llmRouter';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import VoiceChat from './VoiceChat';

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  onVoiceRecord?: () => void; // Made optional - voice functionality temporarily disabled
  onRealtimeVoiceToggle?: () => void; // New prop for realtime voice conversation
  onVoiceInput?: (text: string) => void; // New prop for voice-to-text input
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

const InputArea: React.FC<InputAreaProps> = ({
  onSendMessage,
  onVoiceRecord,
  onRealtimeVoiceToggle,
  onVoiceInput,
  disabled = false,
  isLoading = false,
  placeholder = "Type your message..."
}) => {
  const [currentInput, setCurrentInput] = useState('');
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Feature flags for voice functionality
  const { isVoiceEnabled } = useFeatureFlags();

  // EXCLUSIVE: Only gemma3n:latest model - no model selection needed
  const currentModel = 'gemma3n:latest';

  // Connection status state - safe for Tauri environment
  const [isOnline, setIsOnline] = useState(() => {
    // Safe check for navigator.onLine in Tauri environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    // Default to true if navigator.onLine is not available (Tauri environment)
    return true;
  });

  // Handler functions
  const handleSendMessage = () => {
    if (currentInput.trim() && !disabled && !isLoading) {
      onSendMessage(currentInput.trim());
      setCurrentInput('');

      // Enhanced focus and scroll handling after message send
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Voice chat handlers
  const handleVoiceToggle = () => {
    setShowVoiceChat(!showVoiceChat);
  };

  const handleTranscriptUpdate = (transcript: string, isUser: boolean) => {
    if (isUser) {
      // User speech - add to input or send directly
      setCurrentInput(transcript);
      onSendMessage(transcript);
    } else {
      // AI response - this will be handled by the main chat interface
      console.log('🤖 [Voice] AI response:', transcript);
    }
  };

  const handleVoiceInputToggle = () => {
    if (isVoiceInputActive) {
      // Stop voice input
      setIsVoiceInputActive(false);
    } else {
      // Start voice input
      setIsVoiceInputActive(true);

      // Use Web Speech API for voice input
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          console.log('🎤 Voice input started');
          setIsVoiceInputActive(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          console.log('🎤 Voice input result:', transcript);
          setCurrentInput(transcript);

          // If onVoiceInput callback is provided, call it
          if (onVoiceInput) {
            onVoiceInput(transcript);
          }

          // Auto-send the message
          setTimeout(() => {
            onSendMessage(transcript);
            setCurrentInput('');
          }, 500);
        };

        recognition.onerror = (event: any) => {
          console.error('🎤 Voice input error:', event.error);
          setIsVoiceInputActive(false);
        };

        recognition.onend = () => {
          console.log('🎤 Voice input ended');
          setIsVoiceInputActive(false);
        };

        recognition.start();
      } else {
        console.error('Speech recognition not supported');
        alert('Speech recognition is not supported in this browser');
        setIsVoiceInputActive(false);
      }
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [currentInput]);

  // Monitor connection status safely for Tauri environment
  useEffect(() => {
    const updateConnectionStatus = () => {
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
        setIsOnline(navigator.onLine);
      }
    };

    // Only add event listeners if they're available
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      window.addEventListener('online', updateConnectionStatus);
      window.addEventListener('offline', updateConnectionStatus);

      return () => {
        window.removeEventListener('online', updateConnectionStatus);
        window.removeEventListener('offline', updateConnectionStatus);
      };
    }
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      // No dropdowns to close
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 pb-8">
      {/* Model & Mode Selection Controls */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center space-x-4">
          {/* Mode Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
            <button
              onClick={() => {}} // No mode toggle
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                "bg-gray-300 dark:bg-gray-600" // Always gray
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  "translate-x-1" // Always at the left
                )}
              />
            </button>
            <div className="flex items-center space-x-1">
              <Wifi className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Offline</span>
            </div>
          </div>

          {/* Model Selection */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Model:</span>
            <div className="relative">
              <button
                onClick={() => {}} // No model selection
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <span>{currentModel}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {/* No dropdowns to show */}
            </div>
          </div>
        </div>

        {/* Connection Status Indicator */}
        <div className="flex items-center space-x-1">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isOnline ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isOnline ? "Connected" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex items-end space-x-2">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className={cn(
              "w-full resize-none border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2",
              "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
              "placeholder-gray-500 dark:placeholder-gray-400",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            rows={1}
            style={{ 
              minHeight: '40px', 
              maxHeight: '120px',
              overflow: 'hidden'
            }}
          />
        </div>
        
        {/* VOICE CHAT TOGGLE BUTTON */}
        {isVoiceEnabled && (
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={disabled}
            className={cn(
              "p-2 rounded-lg transition-colors",
              showVoiceChat
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            title={showVoiceChat ? "Close voice chat" : "Open voice chat"}
          >
            <Mic className="w-5 h-5" />
          </button>
        )}

        {/* REALTIME VOICE CONVERSATION BUTTON */}
        {isVoiceEnabled && onRealtimeVoiceToggle && (
          <button
            type="button"
            onClick={onRealtimeVoiceToggle}
            disabled={disabled}
            className={cn(
              "p-2 rounded-lg transition-colors bg-purple-600 text-white hover:bg-purple-700",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            title="Start realtime voice conversation"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
        )}

        {/* Voice Input Button */}
        <button
          type="button"
          onClick={handleVoiceInputToggle}
          disabled={disabled}
          className={cn(
            "p-2 rounded-lg transition-colors",
            isVoiceInputActive
              ? "bg-red-600 text-white hover:bg-red-700 animate-pulse"
              : "bg-green-600 text-white hover:bg-green-700",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          title={isVoiceInputActive ? "Stop voice input" : "Start voice input (click and speak)"}
        >
          <Mic className={cn("w-5 h-5", isVoiceInputActive && "animate-pulse")} />
        </button>

        <button
          type="button"
          onClick={handleSendMessage}
          disabled={disabled || isLoading || !currentInput.trim()}
          className={cn(
            "p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors duration-200"
          )}
          title="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      {/* Voice Chat Component */}
      {showVoiceChat && (
        <div className="mt-4">
          <VoiceChat
            isVisible={showVoiceChat}
            onToggle={handleVoiceToggle}
            onTranscriptUpdate={handleTranscriptUpdate}
            className="border border-gray-200 dark:border-gray-700 rounded-lg"
          />
        </div>
      )}
    </div>
  );
};

export default InputArea;
