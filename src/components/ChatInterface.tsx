import React, { useEffect } from 'react';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import { useChatStore } from '../stores/chatStore';

const ChatInterface: React.FC = () => {
  const { messages, addMessage } = useChatStore();

  useEffect(() => {
    const scrollToBottom = () => {
      const chatWindow = document.getElementById('chat-window');
      if (chatWindow) {
        chatWindow.scrollTop = chatWindow.scrollHeight;
      }
    };

    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (content: string) => {
    addMessage(content, 'user');
    // Mock AI response
    setTimeout(() => addMessage(`Echo: ${content}`, 'assistant'), 1000);
  };

  return (
    <div className="flex flex-col h-full">
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

