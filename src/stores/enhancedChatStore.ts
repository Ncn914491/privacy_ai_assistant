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
  // Context window management
  tokenCount: number;
  maxTokens: number;
  isOptimizing: boolean;
  lastOptimization: Date | null;
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

  addMessageDirect: (message: Message) => void;
  
  // Plugin integration
  executePluginWithContext: (input: string, context?: any) => Promise<PluginResult | null>;
  
  // Export/Import functionality
  exportAllChats: () => Promise<string>;
  importChatsFromJson: (jsonData: string) => Promise<void>;

  // Context window management
  calculateTokenUsage: (messages?: Message[]) => number;
  pruneOldMessages: () => Promise<void>;
  clearAllContext: () => void;
  updateTokenCount: () => void;
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
      // Context window management
      tokenCount: 0,
      maxTokens: 32768,
      isOptimizing: false,
      lastOptimization: null,

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
          set({
            error: `Failed to initialize: ${error}`,
            isInitialized: true // Set to true to prevent UI from being stuck in loading state
          });
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
        console.log(`🔄 [ENHANCED STORE] Updating message ${id} with:`, updates);
        
        set((state) => {
          // FIXED: Update messages array with proper ordering and validation
          const updatedMessages = state.messages.map(msg => {
            if (msg.id === id) {
              // FIXED: Ensure we don't overwrite critical fields unless explicitly provided
              const updatedMessage = {
                ...msg,
                ...updates,
                timestamp: updates.timestamp || msg.timestamp,
                // FIXED: Preserve existing metadata unless explicitly updated
                metadata: updates.metadata ? { ...msg.metadata, ...updates.metadata } : msg.metadata
              };
              
              console.log(`✅ [ENHANCED STORE] Updated message ${id}:`, {
                oldContent: msg.content?.substring(0, 50) + '...',
                newContent: updatedMessage.content?.substring(0, 50) + '...',
                role: updatedMessage.role
              });
              
              return updatedMessage;
            }
            return msg;
          });

          // FIXED: Also update in the active chat session with proper ordering and validation
          const { activeChatId, chatSessions } = state;
          let updatedChatSessions = state.chatSessions;
          
          if (activeChatId && chatSessions[activeChatId]) {
            const currentSession = chatSessions[activeChatId];
            const updatedSessionMessages = currentSession.messages.map(msg => {
              if (msg.id === id) {
                // FIXED: Ensure consistent updates between messages array and session
                const updatedMessage = {
                  ...msg,
                  ...updates,
                  timestamp: updates.timestamp || msg.timestamp,
                  metadata: updates.metadata ? { ...msg.metadata, ...updates.metadata } : msg.metadata
                };
                
                console.log(`✅ [ENHANCED STORE] Updated session message ${id}:`, {
                  oldContent: msg.content?.substring(0, 50) + '...',
                  newContent: updatedMessage.content?.substring(0, 50) + '...',
                  role: updatedMessage.role
                });
                
                return updatedMessage;
              }
              return msg;
            });

            const updatedSession = {
              ...currentSession,
              messages: updatedSessionMessages,
              updatedAt: new Date(),
              metadata: {
                ...currentSession.metadata,
                lastActivity: new Date()
              }
            };

            updatedChatSessions = {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            };
          }

          console.log(`✅ [ENHANCED STORE] Successfully updated message ${id} in both arrays`);

          return {
            messages: updatedMessages,
            chatSessions: updatedChatSessions
          };
        });

        // FIXED: Save to persistent storage with proper error handling
        try {
          const { activeChatId, chatSessions } = get();
          if (activeChatId && chatSessions[activeChatId]) {
            get().saveChatSession(activeChatId, chatSessions[activeChatId]);
          }
        } catch (error) {
          console.error('❌ [ENHANCED STORE] Failed to save updated message:', error);
        }
      },

      // Add message directly with full control
      addMessageDirect: (message: Message) => {
        const state = get();
        const activeChatId = state.activeChatId;

        console.log(`📝 [ENHANCED STORE] Adding message directly:`, {
          id: message.id,
          role: message.role,
          contentLength: message.content.length,
          activeChatId
        });

        // FIXED: Check if message already exists to prevent duplicates
        const messageExists = state.messages.some(msg => msg.id === message.id);
        if (messageExists) {
          console.log(`⚠️ [ENHANCED STORE] Message ${message.id} already exists, skipping`);
          return;
        }

        set((state) => {
          // FIXED: Add to current messages with proper ordering
          const updatedMessages = [...state.messages, message];

          // FIXED: Also add to active chat session if exists with proper isolation
          let updatedChatSessions = state.chatSessions;
          
          if (activeChatId && state.chatSessions[activeChatId]) {
            const currentSession = state.chatSessions[activeChatId];
            
            // FIXED: Check if message already exists in session to prevent duplicates
            const sessionMessageExists = currentSession.messages.some(msg => msg.id === message.id);
            if (!sessionMessageExists) {
              const updatedSession = {
                ...currentSession,
                messages: [...currentSession.messages, message],
                updatedAt: new Date(),
                metadata: {
                  ...currentSession.metadata,
                  messageCount: currentSession.messages.length + 1,
                  lastActivity: new Date()
                }
              };

              updatedChatSessions = {
                ...state.chatSessions,
                [activeChatId]: updatedSession
              };

              console.log(`✅ [ENHANCED STORE] Added message ${message.id} to session ${activeChatId}`);
            } else {
              console.log(`⚠️ [ENHANCED STORE] Message ${message.id} already exists in session, skipping`);
            }
          }

          console.log(`✅ [ENHANCED STORE] Added message ${message.id} to messages array`);

          return {
            messages: updatedMessages,
            chatSessions: updatedChatSessions
          };
        });

        // Save to persistent storage
        if (activeChatId && state.chatSessions[activeChatId]) {
          get().saveChatSession(activeChatId, state.chatSessions[activeChatId]);
        }
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
        const state = get();
        const session = state.chatSessions[chatId];

        if (!session) {
          console.error('Chat session not found:', chatId);
          return;
        }

        // Set as active chat
        set({
          activeChatId: chatId,
          messages: session.messages || []
        });

        console.log('Switched to chat:', chatId, 'with', session.messages?.length || 0, 'messages');
      },

      renameChat: async (chatId: string, newTitle: string): Promise<void> => {
        const state = get();
        const session = state.chatSessions[chatId];

        if (!session) {
          console.error('Chat session not found:', chatId);
          return;
        }

        // Update session title
        const updatedSession = {
          ...session,
          title: newTitle.trim(),
          updatedAt: new Date()
        };

        // Update in sessions
        set((state) => ({
          chatSessions: {
            ...state.chatSessions,
            [chatId]: updatedSession
          }
        }));

        // Update in summaries
        set((state) => ({
          chatSummaries: state.chatSummaries.map(summary =>
            summary.id === chatId
              ? { ...summary, title: newTitle.trim(), updatedAt: new Date() }
              : summary
          )
        }));

        // Save to persistent storage
        get().saveChatSession(chatId, updatedSession);

        console.log('Renamed chat:', chatId, 'to:', newTitle);
      },

      deleteChat: async (chatId: string): Promise<void> => {
        const state = get();

        if (!state.chatSessions[chatId]) {
          console.error('Chat session not found:', chatId);
          return;
        }

        // Remove from sessions
        const { [chatId]: deletedSession, ...remainingSessions } = state.chatSessions;

        set({
          chatSessions: remainingSessions,
          chatSummaries: state.chatSummaries.filter(summary => summary.id !== chatId),
          // If this was the active chat, clear it
          activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
          messages: state.activeChatId === chatId ? [] : state.messages
        });

        // Remove from persistent storage
        try {
          const store = await initChatStore();
          if (store) {
            await store.delete(`chat-${chatId}`);
          }
        } catch (error) {
          console.warn('Failed to delete from persistent storage:', error);
        }

        console.log('Deleted chat:', chatId);
      },

      archiveChat: async (chatId: string): Promise<void> => {
        const state = get();
        const session = state.chatSessions[chatId];

        if (!session) {
          console.error('Chat session not found:', chatId);
          return;
        }

        // Mark session as archived
        const archivedSession = {
          ...session,
          metadata: {
            ...session.metadata,
            archived: true,
            archivedAt: new Date()
          },
          updatedAt: new Date()
        };

        // Update in sessions
        set((state) => ({
          chatSessions: {
            ...state.chatSessions,
            [chatId]: archivedSession
          }
        }));

        // Update in summaries (mark as archived)
        set((state) => ({
          chatSummaries: state.chatSummaries.map(summary =>
            summary.id === chatId
              ? {
                  ...summary,
                  metadata: { ...summary.metadata, archived: true },
                  updatedAt: new Date()
                }
              : summary
          )
        }));

        // Save to persistent storage
        get().saveChatSession(chatId, archivedSession);

        console.log('Archived chat:', chatId);
      },

      loadChatSessions: async (): Promise<void> => {
        // Implementation will be added
      },

      saveChatSession: async (chatId: string, session?: ChatSession): Promise<void> => {
        try {
          const state = get();
          const sessionToSave = session || state.chatSessions[chatId];
          
          if (!sessionToSave) {
            console.warn(`No session found to save for chatId: ${chatId}`);
            return;
          }

          // Update the session in state if provided
          if (session) {
            set((state) => ({
              chatSessions: {
                ...state.chatSessions,
                [chatId]: session
              }
            }));
          }

          // Sync with Tauri store
          await get().syncWithTauriStore();
          
          // Try to save to backend if available
          try {
            await invoke('save_chat_session', {
              chatId,
              session: sessionToSave
            });
          } catch (error) {
            console.warn('Backend unavailable for saving session:', error);
          }
        } catch (error) {
          console.error('Failed to save chat session:', error);
        }
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

      // Context window management methods
      calculateTokenUsage: (messages?: Message[]): number => {
        const state = get();
        const messagesToCount = messages || state.messages;

        if (!messagesToCount || messagesToCount.length === 0) {
          return 0;
        }

        // Estimate tokens using 4 characters per token approximation
        let totalTokens = 0;

        messagesToCount.forEach(message => {
          // Count tokens in message content
          totalTokens += Math.ceil(message.content.length / 4);

          // Add small overhead for message metadata
          totalTokens += 10; // Role, timestamp, etc.
        });

        // Add tokens for system instructions and context
        const systemInstructionsTokens = 100; // Estimated
        const contextOverheadTokens = 50; // Estimated

        totalTokens += systemInstructionsTokens + contextOverheadTokens;

        return totalTokens;
      },

      updateTokenCount: (): void => {
        const state = get();
        const newTokenCount = state.calculateTokenUsage();

        set({ tokenCount: newTokenCount });

        // Auto-prune if we're at 90% capacity
        if (newTokenCount >= state.maxTokens * 0.9) {
          console.log('🧹 [Context] Auto-pruning triggered at 90% capacity');
          state.pruneOldMessages();
        }
      },

      pruneOldMessages: async (): Promise<void> => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId || state.isOptimizing) {
          return;
        }

        set({ isOptimizing: true });

        try {
          console.log('🧹 [Context] Starting message pruning...');

          const currentSession = state.chatSessions[activeChatId];
          if (!currentSession || !currentSession.messages) {
            return;
          }

          const messages = [...currentSession.messages];
          const totalMessages = messages.length;

          if (totalMessages <= 10) {
            // Don't prune if we have very few messages
            return;
          }

          // Preserve system instructions (if any)
          const systemMessages = messages.filter(msg => msg.role === 'system');

          // Get the last 5 message pairs (10 messages)
          const recentMessages = messages.slice(-10);

          // Find current conversation thread (messages from last 30 minutes)
          const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
          const currentThreadMessages = messages.filter(msg =>
            new Date(msg.timestamp) > thirtyMinutesAgo
          );

          // Combine preserved messages (remove duplicates)
          const preservedMessageIds = new Set();
          const preservedMessages: Message[] = [];

          // Add system messages
          systemMessages.forEach(msg => {
            if (!preservedMessageIds.has(msg.id)) {
              preservedMessages.push(msg);
              preservedMessageIds.add(msg.id);
            }
          });

          // Add recent messages
          recentMessages.forEach(msg => {
            if (!preservedMessageIds.has(msg.id)) {
              preservedMessages.push(msg);
              preservedMessageIds.add(msg.id);
            }
          });

          // Add current thread messages
          currentThreadMessages.forEach(msg => {
            if (!preservedMessageIds.has(msg.id)) {
              preservedMessages.push(msg);
              preservedMessageIds.add(msg.id);
            }
          });

          // Sort preserved messages by timestamp
          preservedMessages.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          const prunedCount = totalMessages - preservedMessages.length;

          // Update the session with pruned messages
          const updatedSession = {
            ...currentSession,
            messages: preservedMessages,
            lastActivity: new Date()
          };

          set({
            chatSessions: {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            },
            messages: preservedMessages,
            lastOptimization: new Date()
          });

          // Update token count
          const newTokenCount = state.calculateTokenUsage(preservedMessages);
          set({ tokenCount: newTokenCount });

          console.log(`✅ [Context] Pruned ${prunedCount} messages, kept ${preservedMessages.length}`);
          console.log(`📊 [Context] Token count reduced to ${newTokenCount}`);

        } catch (error) {
          console.error('❌ [Context] Failed to prune messages:', error);
        } finally {
          set({ isOptimizing: false });
        }
      },

      clearAllContext: (): void => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) {
          return;
        }

        console.log('🗑️ [Context] Clearing all context...');

        // Clear messages for active chat
        const updatedSession = {
          ...state.chatSessions[activeChatId],
          messages: [],
          lastActivity: new Date()
        };

        set({
          chatSessions: {
            ...state.chatSessions,
            [activeChatId]: updatedSession
          },
          messages: [],
          tokenCount: 0,
          lastOptimization: new Date()
        });

        console.log('✅ [Context] All context cleared');
      }
    }),
    {
      name: 'enhanced-chat-storage',
      partialize: (state) => ({
        activeChatId: state.activeChatId,
        chatSessions: state.chatSessions,
        chatSummaries: state.chatSummaries,
        currentInput: state.currentInput,
        tokenCount: state.tokenCount,
        lastOptimization: state.lastOptimization,
      }),
    }
  )
);
