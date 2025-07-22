import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, User, Bot } from 'lucide-react';
import { Message } from '../types';
import { cn } from '../utils/cn';

interface MessageBubbleProps {
  message: Message;
  onCopy?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const formatTimestamp = (timestamp: Date | string | number | undefined): string => {
    if (!timestamp) return 'Unknown';
    
    const time = new Date(timestamp);
    
    // Validate the timestamp
    if (isNaN(time.getTime())) {
      return 'Invalid time';
    }
    
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(time);
  };

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={cn(
        'group flex w-full gap-3 px-4 py-3 animate-fade-in',
        isUser && 'flex-row-reverse',
        isAssistant && 'flex-row'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium',
          isUser && 'bg-primary-600',
          isAssistant && 'bg-gray-600 dark:bg-gray-500'
        )}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message Content */}
      <div className={cn('flex-1 min-w-0', isUser && 'flex flex-col items-end')}>
        {/* Message Bubble */}
        <div
          className={cn(
            'relative max-w-[70%] rounded-2xl px-4 py-2 shadow-sm',
            isUser && 'bg-primary-600 text-white',
            isAssistant && 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          )}
        >
          {/* Loading State */}
          {message.isLoading && (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <div className="loading-dots">
                <div></div>
                <div></div>
                <div></div>
              </div>
              <span className="text-sm">Thinking...</span>
            </div>
          )}

          {/* Error State */}
          {message.error && (
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
              <span className="text-sm">Error: {message.error}</span>
            </div>
          )}

          {/* Message Content */}
          {!message.isLoading && !message.error && (
            <div className="prose prose-sm max-w-none">
              {isAssistant ? (
                <ReactMarkdown
                  className={cn(
                    'markdown-content',
                    'prose-headings:text-gray-900 dark:prose-headings:text-gray-100',
                    'prose-p:text-gray-700 dark:prose-p:text-gray-300',
                    'prose-strong:text-gray-900 dark:prose-strong:text-gray-100',
                    'prose-code:text-gray-800 dark:prose-code:text-gray-200',
                    'prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800'
                  )}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              )}
            </div>
          )}

          {/* Copy Button */}
          {!message.isLoading && !message.error && (
            <button
              onClick={handleCopy}
              className={cn(
                'absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200',
                'hover:bg-black/10 dark:hover:bg-white/10',
                'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
              )}
              aria-label="Copy message"
            >
              {copied ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <Copy size={14} className="text-gray-500 dark:text-gray-400" />
              )}
            </button>
          )}
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            'mt-1 text-xs text-gray-500 dark:text-gray-400',
            isUser && 'text-right'
          )}
        >
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
