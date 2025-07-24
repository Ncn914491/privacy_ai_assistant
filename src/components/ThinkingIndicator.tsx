import React from 'react';
import { Brain, Loader2, Sparkles } from 'lucide-react';
import { cn } from '../utils/cn';

interface ThinkingIndicatorProps {
  isVisible: boolean;
  className?: string;
  streamingText?: string;
  isStreaming?: boolean;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  isVisible,
  className = '',
  streamingText = '',
  isStreaming = false
}) => {
  if (!isVisible) return null;

  // If we have streaming text, show the streaming response
  if (isStreaming && streamingText) {
    return (
      <div className={cn(
        'mx-4 mb-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/30 dark:to-blue-900/30 rounded-lg border border-green-200 dark:border-green-700',
        className
      )}>
        <div className="flex items-start space-x-3">
          {/* Streaming Icon */}
          <div className="relative mt-1">
            <Brain className="w-4 h-4 text-green-600 dark:text-green-400" />
            <div className="absolute -top-1 -right-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>

          {/* Streaming Text with Typewriter Effect */}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {streamingText}
              <span className="inline-block w-2 h-4 bg-green-500 animate-pulse ml-1"></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default thinking indicator
  return (
    <div className={cn(
      'flex items-center justify-center py-4 px-6 mx-4 mb-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg border border-blue-200 dark:border-blue-700',
      className
    )}>
      <div className="flex items-center space-x-3">
        {/* Animated Brain Icon */}
        <div className="relative">
          <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />
          <div className="absolute -top-1 -right-1">
            <Sparkles className="w-3 h-3 text-purple-500 animate-spin" />
          </div>
        </div>

        {/* Thinking Text */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            AI is thinking
          </span>

          {/* Animated Dots */}
          <div className="flex space-x-1">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
          </div>
        </div>

        {/* Spinning Loader */}
        <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
      </div>
    </div>
  );
};

export default ThinkingIndicator;
