import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { cn } from '../utils/cn';
import VoiceRecordingModal from './VoiceRecordingModal';

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const InputArea: React.FC<InputAreaProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Type your message...",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { currentInput, setCurrentInput, isLoading } = useChatStore();
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const maxChars = 4000;

  useEffect(() => {
    setCharCount(currentInput.length);
  }, [currentInput]);

  useEffect(() => {
    // Auto-focus on mount
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxChars) {
      setCurrentInput(value);
      autoResizeTextarea();
    }
  };

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendMessage = () => {
    if (currentInput.trim() && !disabled && !isLoading) {
      onSendMessage(currentInput.trim());
      setCurrentInput('');

      // Enhanced focus and scroll handling after message send
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';

        // Use requestAnimationFrame to ensure DOM updates before focusing
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }
    }
  };

  const handleMicToggle = () => {
    if (disabled || isLoading) {
      console.log('Voice input blocked: system not ready');
      return;
    }
    setIsVoiceModalOpen(true);
  };

  const handleVoiceTranscriptionComplete = (text: string) => {
    setCurrentInput(text);
    // Auto-focus the textarea after transcription
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const canSend = currentInput.trim().length > 0 && !disabled && !isLoading;

  return (
    <div className="sticky bottom-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-10">
      <div className="max-w-4xl mx-auto p-4">
        {/* Character Counter */}
        {charCount > maxChars * 0.8 && (
          <div className="flex justify-end mb-2">
            <span
              className={cn(
                'text-xs px-2 py-1 rounded-full',
                charCount > maxChars * 0.9
                  ? 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30'
                  : 'text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30'
              )}
            >
              {charCount}/{maxChars}
            </span>
          </div>
        )}

        {/* Input Container */}
        <div className="flex items-end gap-3">
          {/* Microphone Button */}
          <div className="relative">
            <button
              type="button"
              onClick={handleMicToggle}
              disabled={disabled || isLoading}
              className={cn(
                'flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                disabled || isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                  : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95'
              )}
              aria-label="Voice input"
              title={disabled ? "Model not connected - Voice input unavailable" : "Click to record voice message"}
            >
              <Mic size={20} className="drop-shadow-sm" />
            </button>
            {disabled && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">🚫</span>
              </div>
            )}
          </div>

          {/* Text Input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={currentInput}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={disabled ? "Model not connected - Please check system status" : placeholder}
              disabled={disabled || isLoading}
              className={cn(
                'w-full px-4 py-3 pr-14 rounded-xl border-2 border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                'placeholder-gray-500 dark:placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                'transition-all duration-200 resize-none shadow-sm',
                'min-h-[52px] max-h-[200px]',
                (disabled || isLoading) && 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-700'
              )}
              rows={1}
            />

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!canSend}
              className={cn(
                'absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
                'transform hover:scale-105 active:scale-95',
                canSend
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed hover:scale-100'
              )}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Enter</kbd>
            <span>to send</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">•</span>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">Shift+Enter</kbd>
            <span>new line</span>
          </div>
          {!disabled && (
            <>
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1">
                <span>🎤</span>
                <span>Click mic for voice input</span>
              </div>
            </>
          )}
          {isLoading && (
            <>
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>AI is thinking...</span>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Voice Recording Modal */}
      <VoiceRecordingModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTranscriptionComplete={handleVoiceTranscriptionComplete}
      />
    </div>
  );
};

export default InputArea;
