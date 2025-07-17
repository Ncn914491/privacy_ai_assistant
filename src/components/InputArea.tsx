import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/utils/cn';

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
  const [micEnabled, setMicEnabled] = useState(false);
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
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    }
  };

  const handleMicToggle = () => {
    // Placeholder for future voice integration
    setMicEnabled(!micEnabled);
    console.log('Microphone toggle - not implemented yet');
  };

  const canSend = currentInput.trim().length > 0 && !disabled && !isLoading;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Character Counter */}
        {charCount > maxChars * 0.8 && (
          <div className="text-right mb-2">
            <span
              className={cn(
                'text-xs',
                charCount > maxChars * 0.9 ? 'text-red-500' : 'text-yellow-500'
              )}
            >
              {charCount}/{maxChars}
            </span>
          </div>
        )}

        {/* Input Container */}
        <div className="relative flex items-end gap-2">
          {/* Microphone Button */}
          <button
            onClick={handleMicToggle}
            disabled={disabled || isLoading}
            className={cn(
              'flex-shrink-0 p-3 rounded-full transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
              micEnabled
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
              (disabled || isLoading) && 'opacity-50 cursor-not-allowed'
            )}
            aria-label={micEnabled ? 'Stop recording' : 'Start recording'}
            title="Voice input (coming soon)"
          >
            {micEnabled ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Text Input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={currentInput}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className={cn(
                'w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100',
                'placeholder-gray-500 dark:placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                'transition-all duration-200 resize-none',
                'min-h-[52px] max-h-[200px]',
                (disabled || isLoading) && 'opacity-50 cursor-not-allowed'
              )}
              rows={1}
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />

            {/* Send Button */}
            <button
              onClick={handleSendMessage}
              disabled={!canSend}
              className={cn(
                'absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
                canSend
                  ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          <span>Press Enter to send, Shift+Enter for new line</span>
          {isLoading && (
            <span className="ml-4 text-primary-600 dark:text-primary-400">
              • AI is thinking...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default InputArea;
