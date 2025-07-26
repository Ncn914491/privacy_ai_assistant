import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Store } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import {
  Message,
  ChatSession,
  ChatSessionSummary,
  MultiChatState,
  ChatActions,
  ChatSessionActions,
  LLMProvider,
  PluginResult
} from '../types';

// Generate unique ID for messages and chats
const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Tauri store instance for chat persistence
let chatStore: Store | null = null;

const initChatStore = async () => {
  if (!chatStore) {
    try {
      chatStore = new Store('chats.json');
    } catch (error) {
      console.warn('Failed to initialize chat store, using localStorage fallback:', error);
    }
  }
  return chatStore;
};

interface EnhancedChatState extends MultiChatState {
  isInitialized: boolean;
  lastSyncTime: Date | null;
}

interface EnhancedChatActions extends ChatActions, ChatSessionActions {
  // Enhanced session management
  initializeStore: () => Promise<void>;
  syncWithTauriStore: () => Promise<void>;
  createNewChatWithTitle: (title: string) => Promise<string>;
  bulkImportChats: (chats: ChatSession[]) => Promise<void>;
  searchChats: (query: string) => ChatSessionSummary[];
  getRecentChats: (limit?: number) => ChatSessionSummary[];
  
  // Enhanced message management
  addMessageWithMetadata: (
    content: string, 
    role: 'user' | 'assistant', 
    metadata?: { model?: string; provider?: LLMProvider; tokens?: number }
  ) => void;
  
  // Plugin integration
  executePluginWithContext: (input: string, context?: any) => Promise<PluginResult | null>;
  
  // Export/Import functionality
  exportAllChats: () => Promise<string>;
  importChatsFromJson: (jsonData: string) => Promise<void>;
}

interface EnhancedChatStore extends EnhancedChatState, EnhancedChatActions {}

export const useEnhancedChatStore = create<EnhancedChatStore>()(
  persist(
    (set, get) => ({
      // State
      messages: [],
      isLoading: false,
      error: null,
      currentInput: '',
      activeChatId: null,
      chatSessions: {},
      chatSummaries: [],
      isInitialized: false,
      lastSyncTime: null,

      // Initialize store
      initializeStore: async () => {
        try {
          console.log('🔄 Initializing enhanced chat store...');
          const store = await initChatStore();
          
          if (store) {
            // Load existing chats from Tauri store
            const savedChats = await store.get<Record<string, ChatSession>>('chat-sessions');
            const savedSummaries = await store.get<ChatSessionSummary[]>('chat-summaries');
            
            if (savedChats) {
              set({ chatSessions: savedChats });
            }
            
            if (savedSummaries) {
              set({ chatSummaries: savedSummaries });
            }
          }
          
          // Also try to load from backend
          await get().loadChatSessions();
          
          set({ 
            isInitialized: true, 
            lastSyncTime: new Date() 
          });
          
          console.log('✅ Enhanced chat store initialized');
        } catch (error) {
          console.error('❌ Failed to initialize chat store:', error);
          set({ error: `Failed to initialize: ${error}` });
        }
      },

      // Sync with Tauri store
      syncWithTauriStore: async () => {
        try {
          const store = await initChatStore();
          if (store) {
            const state = get();
            await store.set('chat-sessions', state.chatSessions);
            await store.set('chat-summaries', state.chatSummaries);
            await store.save();
            set({ lastSyncTime: new Date() });
          }
        } catch (error) {
          console.error('Failed to sync with Tauri store:', error);
        }
      },

      // Create new chat with custom title
      createNewChatWithTitle: async (title: string): Promise<string> => {
        const chatId = `chat_${generateId()}`;
        const now = new Date();
        
        const newSession: ChatSession = {
          id: chatId,
          title,
          messages: [],
          createdAt: now,
          updatedAt: now,
          metadata: {
            model: 'gemma3n:latest',
            tokenCount: 0,
            messageCount: 0,
            lastActivity: now,
            tags: [],
            isArchived: false
          }
        };

        const newSummary: ChatSessionSummary = {
          id: chatId,
          title,
          lastMessage: null,
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
          lastActivity: now
        };

        set((state) => ({
          chatSessions: {
            ...state.chatSessions,
            [chatId]: newSession
          },
          chatSummaries: [newSummary, ...state.chatSummaries],
          activeChatId: chatId,
          messages: []
        }));

        // Sync with stores
        await get().syncWithTauriStore();
        
        // Try to create in backend as well
        try {
          await invoke('create_chat_session', { title });
        } catch (error) {
          console.warn('Backend unavailable for chat creation:', error);
        }

        return chatId;
      },

      // Search chats
      searchChats: (query: string): ChatSessionSummary[] => {
        const state = get();
        const lowercaseQuery = query.toLowerCase();
        
        return state.chatSummaries.filter(summary => 
          summary.title.toLowerCase().includes(lowercaseQuery) ||
          (summary.lastMessage && summary.lastMessage.toLowerCase().includes(lowercaseQuery))
        );
      },

      // Get recent chats
      getRecentChats: (limit = 10): ChatSessionSummary[] => {
        const state = get();
        return state.chatSummaries
          .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
          .slice(0, limit);
      },

      // Enhanced message adding with metadata
      addMessageWithMetadata: (
        content: string, 
        role: 'user' | 'assistant', 
        metadata?: { model?: string; provider?: LLMProvider; tokens?: number }
      ) => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) {
          console.warn('❌ No active chat session for adding message');
          return;
        }

        const newMessage: Message = {
          id: generateId(),
          content,
          role,
          timestamp: new Date(),
        };

        set((state) => {
          const currentSession = state.chatSessions[activeChatId];
          if (!currentSession) {
            return state;
          }

          const updatedSession = {
            ...currentSession,
            messages: [...currentSession.messages, newMessage],
            updatedAt: new Date(),
            metadata: {
              ...currentSession.metadata,
              messageCount: currentSession.messages.length + 1,
              lastActivity: new Date(),
              model: metadata?.model || currentSession.metadata?.model,
              tokenCount: (currentSession.metadata?.tokenCount || 0) + (metadata?.tokens || 0)
            }
          };

          // Update summary
          const updatedSummaries = state.chatSummaries.map(summary =>
            summary.id === activeChatId
              ? {
                  ...summary,
                  lastMessage: content.substring(0, 100),
                  messageCount: updatedSession.messages.length,
                  updatedAt: new Date(),
                  lastActivity: new Date()
                }
              : summary
          );

          return {
            messages: [...state.messages, newMessage],
            chatSessions: {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            },
            chatSummaries: updatedSummaries
          };
        });

        // Auto-sync after message addition
        setTimeout(() => get().syncWithTauriStore(), 1000);
      },

      // Export all chats
      exportAllChats: async (): Promise<string> => {
        const state = get();
        const exportData = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          chatSessions: state.chatSessions,
          chatSummaries: state.chatSummaries,
          totalChats: state.chatSummaries.length,
          totalMessages: Object.values(state.chatSessions).reduce(
            (total, session) => total + session.messages.length, 
            0
          )
        };
        
        return JSON.stringify(exportData, null, 2);
      },

      // Import chats from JSON
      importChatsFromJson: async (jsonData: string): Promise<void> => {
        try {
          const importData = JSON.parse(jsonData);
          
          if (!importData.chatSessions || !importData.chatSummaries) {
            throw new Error('Invalid chat export format');
          }

          set((state) => ({
            chatSessions: {
              ...state.chatSessions,
              ...importData.chatSessions
            },
            chatSummaries: [
              ...importData.chatSummaries,
              ...state.chatSummaries
            ]
          }));

          await get().syncWithTauriStore();
        } catch (error) {
          console.error('Failed to import chats:', error);
          throw error;
        }
      },

      // Placeholder implementations for required interface methods
      // (These will be implemented in the next phase)
      addMessage: (content: string, role: 'user' | 'assistant') => {
        get().addMessageWithMetadata(content, role);
      },

      updateMessage: (id: string, updates: Partial<Message>) => {
        // Implementation will be added
      },

      deleteMessage: (id: string) => {
        // Implementation will be added
      },

      clearMessages: () => {
        set({ messages: [] });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      setCurrentInput: (input: string) => {
        set({ currentInput: input });
      },

      // Placeholder chat session methods
      createNewChat: async (title?: string): Promise<string> => {
        return get().createNewChatWithTitle(title || `New Chat ${new Date().toLocaleString()}`);
      },

      switchToChat: async (chatId: string): Promise<void> => {
        // Implementation will be added
      },

      renameChat: async (chatId: string, newTitle: string): Promise<void> => {
        // Implementation will be added
      },

      deleteChat: async (chatId: string): Promise<void> => {
        // Implementation will be added
      },

      archiveChat: async (chatId: string): Promise<void> => {
        // Implementation will be added
      },

      loadChatSessions: async (): Promise<void> => {
        // Implementation will be added
      },

      saveChatSession: async (chatId: string): Promise<void> => {
        await get().syncWithTauriStore();
      },

      duplicateChat: async (chatId: string): Promise<string> => {
        // Implementation will be added
        return '';
      },

      generateContextAwareResponse: async (prompt: string, systemPrompt?: string): Promise<string> => {
        // Implementation will be added
        return '';
      },

      saveMessageToBackend: async (chatId: string, content: string, role: 'user' | 'assistant'): Promise<void> => {
        // Implementation will be added
      },

      executePluginWithContext: async (input: string, context?: any): Promise<PluginResult | null> => {
        // Implementation will be added
        return null;
      },

      bulkImportChats: async (chats: ChatSession[]): Promise<void> => {
        // Implementation will be added
      },
    }),
    {
      name: 'enhanced-chat-storage',
      partialize: (state) => ({
        activeChatId: state.activeChatId,
        chatSessions: state.chatSessions,
        chatSummaries: state.chatSummaries,
        currentInput: state.currentInput,
      }),
    }
  )
);
