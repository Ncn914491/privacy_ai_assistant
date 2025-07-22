import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import {
  Message,
  ChatState,
  ChatActions,
  UserPreferences,
  PreferenceActions,
  AppState,
  SystemInfo,
  AppVersion,
  ChatSession,
  ChatSessionSummary,
  MultiChatState,
  ChatSessionActions
} from '../types';

// Generate unique ID for messages
const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Mock messages for testing
const mockMessages: Message[] = [
  {
    id: generateId(),
    content: "Hello! I'm your privacy-first AI assistant. I run completely offline to protect your privacy.",
    role: 'assistant',
    timestamp: new Date(),
  },
  {
    id: generateId(),
    content: "How can I help you today?",
    role: 'user',
    timestamp: new Date(),
  },
];

// Default preferences
const defaultPreferences: UserPreferences = {
  theme: 'system',
  sidebarCollapsed: false,
  fontSize: 'medium',
  enableNotifications: true,
  enableSounds: false,
  autoSave: true,
};

// Chat store
interface ChatStore extends ChatState, ChatActions {}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: mockMessages,
      isLoading: false,
      error: null,
      currentInput: '',

      addMessage: (content: string, role: 'user' | 'assistant', customId?: string | number) => {
        const newMessage: Message = {
          id: customId ? customId.toString() : generateId(),
          content,
          role,
          timestamp: new Date(),
        };

        set((state) => ({
          messages: [...state.messages, newMessage],
        }));
      },

      updateMessage: (id: string, updates: Partial<Message>) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        }));
      },

      deleteMessage: (id: string) => {
        set((state) => ({
          messages: state.messages.filter((msg) => msg.id !== id),
        }));
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
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        messages: state.messages,
        currentInput: state.currentInput,
      }),
    }
  )
);

// App store for global state
interface AppStore extends AppState, PreferenceActions {
  setSystemInfo: (info: SystemInfo) => void;
  setAppVersion: (version: AppVersion) => void;
  setInitialized: (initialized: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      isInitialized: false,
      systemInfo: null,
      appVersion: null,
      preferences: defaultPreferences,

      setSystemInfo: (info: SystemInfo) => {
        set({ systemInfo: info });
      },

      setAppVersion: (version: AppVersion) => {
        set({ appVersion: version });
      },

      setInitialized: (initialized: boolean) => {
        set({ isInitialized: initialized });
      },

      setTheme: (theme) => {
        set((state) => ({
          preferences: { ...state.preferences, theme },
        }));
      },

      setSidebarCollapsed: (collapsed) => {
        set((state) => ({
          preferences: { ...state.preferences, sidebarCollapsed: collapsed },
        }));
      },

      setFontSize: (fontSize) => {
        set((state) => ({
          preferences: { ...state.preferences, fontSize },
        }));
      },

      toggleNotifications: () => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            enableNotifications: !state.preferences.enableNotifications,
          },
        }));
      },

      toggleSounds: () => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            enableSounds: !state.preferences.enableSounds,
          },
        }));
      },

      toggleAutoSave: () => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            autoSave: !state.preferences.autoSave,
          },
        }));
      },

      resetPreferences: () => {
        set({ preferences: defaultPreferences });
      },
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        preferences: state.preferences,
      }),
    }
  )
);

// ===== MULTI-CHAT SESSION STORE =====

interface MultiChatStore extends MultiChatState, ChatActions, ChatSessionActions {}

export const useMultiChatStore = create<MultiChatStore>()(
  persist(
    (set, get) => ({
      // Existing chat state
      messages: [],
      isLoading: false,
      error: null,
      currentInput: '',

      // Multi-chat state
      activeChatId: null,
      chatSessions: {},
      chatSummaries: [],

      // Existing chat actions
      addMessage: (content: string, role: 'user' | 'assistant', customId?: string | number) => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) {
          console.warn('No active chat session');
          return;
        }

        const newMessage: Message = {
          id: customId ? customId.toString() : generateId(),
          content,
          role,
          timestamp: new Date(),
        };

        set((state) => {
          const updatedSession = state.chatSessions[activeChatId];
          if (updatedSession) {
            updatedSession.messages = [...updatedSession.messages, newMessage];
            updatedSession.updatedAt = new Date();
          }

          return {
            messages: [...state.messages, newMessage],
            chatSessions: {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            }
          };
        });

        // Save to backend with model information
        get().saveMessageToBackend(activeChatId, content, role);
      },

      // New method for saving messages to backend
      saveMessageToBackend: async (chatId: string, content: string, role: 'user' | 'assistant') => {
        try {
          const session = get().chatSessions[chatId];
          const model = session?.metadata?.model || 'gemma3n:latest';

          await invoke('add_message_to_chat', {
            chatId,
            content,
            role,
            model
          });
        } catch (error) {
          console.error('Failed to save message to backend:', error);
        }
      },

      updateMessage: (id: string, updates: Partial<Message>) => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) return;

        set((state) => {
          const updatedMessages = state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          );

          const updatedSession = state.chatSessions[activeChatId];
          if (updatedSession) {
            updatedSession.messages = updatedMessages;
            updatedSession.updatedAt = new Date();
          }

          return {
            messages: updatedMessages,
            chatSessions: {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            }
          };
        });

        // Save to backend
        get().saveChatSession(activeChatId);
      },

      deleteMessage: (id: string) => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) return;

        set((state) => {
          const updatedMessages = state.messages.filter((msg) => msg.id !== id);

          const updatedSession = state.chatSessions[activeChatId];
          if (updatedSession) {
            updatedSession.messages = updatedMessages;
            updatedSession.updatedAt = new Date();
          }

          return {
            messages: updatedMessages,
            chatSessions: {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            }
          };
        });

        // Save to backend
        get().saveChatSession(activeChatId);
      },

      clearMessages: () => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) return;

        set((state) => {
          const updatedSession = state.chatSessions[activeChatId];
          if (updatedSession) {
            updatedSession.messages = [];
            updatedSession.updatedAt = new Date();
          }

          return {
            messages: [],
            chatSessions: {
              ...state.chatSessions,
              [activeChatId]: updatedSession
            }
          };
        });

        // Save to backend
        get().saveChatSession(activeChatId);
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

      // Multi-chat session actions
      createNewChat: async (title?: string): Promise<string> => {
        try {
          const response = await invoke<{chat_id: string, title: string, success: boolean, error?: string}>('create_chat_session', {
            title: title || undefined
          });

          if (response.success) {
            const newSession: ChatSession = {
              id: response.chat_id,
              title: response.title,
              messages: [],
              createdAt: new Date(),
              updatedAt: new Date(),
              metadata: {
                model: 'gemma3n:latest',
                tokenCount: 0,
                messageCount: 0,
                lastActivity: new Date(),
                tags: [],
                isArchived: false
              }
            };

            set((state) => ({
              chatSessions: {
                ...state.chatSessions,
                [response.chat_id]: newSession
              },
              activeChatId: response.chat_id,
              messages: [],
              currentInput: ''
            }));

            // Refresh chat list
            await get().loadChatSessions();

            return response.chat_id;
          } else {
            throw new Error(response.error || 'Failed to create chat session');
          }
        } catch (error) {
          console.error('Failed to create new chat:', error);
          set({ error: `Failed to create new chat: ${error}` });
          throw error;
        }
      },

      switchToChat: async (chatId: string): Promise<void> => {
        try {
          // Load session from backend if not in memory
          let session = get().chatSessions[chatId];

          if (!session) {
            const response = await invoke<{session: ChatSession | null, success: boolean, error?: string}>('get_chat_session', {
              chatId
            });

            if (response.success && response.session) {
              session = {
                ...response.session,
                createdAt: new Date(response.session.createdAt),
                updatedAt: new Date(response.session.updatedAt),
                messages: response.session.messages.map(msg => ({
                  ...msg,
                  timestamp: new Date(msg.timestamp)
                }))
              };

              set((state) => ({
                chatSessions: {
                  ...state.chatSessions,
                  [chatId]: session!
                }
              }));
            } else {
              throw new Error(response.error || 'Chat session not found');
            }
          }

          // Switch to the chat
          set({
            activeChatId: chatId,
            messages: session.messages,
            currentInput: ''
          });

        } catch (error) {
          console.error('Failed to switch to chat:', error);
          set({ error: `Failed to switch to chat: ${error}` });
          throw error;
        }
      },

      renameChat: async (chatId: string, newTitle: string): Promise<void> => {
        try {
          const response = await invoke<{success: boolean, error?: string}>('rename_chat_session', {
            chatId,
            newTitle
          });

          if (response.success) {
            set((state) => {
              const updatedSession = state.chatSessions[chatId];
              if (updatedSession) {
                updatedSession.title = newTitle;
                updatedSession.updatedAt = new Date();
              }

              return {
                chatSessions: {
                  ...state.chatSessions,
                  [chatId]: updatedSession
                }
              };
            });

            // Refresh chat list
            await get().loadChatSessions();
          } else {
            throw new Error(response.error || 'Failed to rename chat');
          }
        } catch (error) {
          console.error('Failed to rename chat:', error);
          set({ error: `Failed to rename chat: ${error}` });
          throw error;
        }
      },

      deleteChat: async (chatId: string): Promise<void> => {
        try {
          const response = await invoke<{success: boolean, error?: string}>('delete_chat_session', {
            chatId
          });

          if (response.success) {
            set((state) => {
              const { [chatId]: deleted, ...remainingSessions } = state.chatSessions;
              const newActiveChatId = state.activeChatId === chatId ? null : state.activeChatId;

              return {
                chatSessions: remainingSessions,
                activeChatId: newActiveChatId,
                messages: newActiveChatId ? state.messages : [],
                chatSummaries: state.chatSummaries.filter(s => s.id !== chatId)
              };
            });

            // If we deleted the active chat, clear messages
            if (get().activeChatId === null) {
              set({ messages: [] });
            }
          } else {
            throw new Error(response.error || 'Failed to delete chat');
          }
        } catch (error) {
          console.error('Failed to delete chat:', error);
          set({ error: `Failed to delete chat: ${error}` });
          throw error;
        }
      },

      archiveChat: async (chatId: string): Promise<void> => {
        try {
          // This would need to be implemented in the backend
          console.log('Archive chat not yet implemented:', chatId);
        } catch (error) {
          console.error('Failed to archive chat:', error);
          throw error;
        }
      },

      loadChatSessions: async (): Promise<void> => {
        try {
          const response = await invoke<{sessions: ChatSessionSummary[], success: boolean, error?: string}>('list_chat_sessions');

          if (response.success) {
            const summaries = response.sessions.map(summary => ({
              ...summary,
              lastActivity: new Date(summary.lastActivity),
              createdAt: new Date(summary.createdAt)
            }));

            set({ chatSummaries: summaries });
          } else {
            throw new Error(response.error || 'Failed to load chat sessions');
          }
        } catch (error) {
          console.error('Failed to load chat sessions:', error);
          set({ error: `Failed to load chat sessions: ${error}` });
          throw error;
        }
      },

      saveChatSession: async (chatId: string): Promise<void> => {
        try {
          const session = get().chatSessions[chatId];
          if (!session) return;

          // The session is automatically saved when messages are added via the backend
          // This is a placeholder for any additional save logic
          console.log('Session auto-saved:', chatId);
        } catch (error) {
          console.error('Failed to save chat session:', error);
        }
      },

      duplicateChat: async (chatId: string): Promise<string> => {
        try {
          const session = get().chatSessions[chatId];
          if (!session) {
            throw new Error('Chat session not found');
          }

          const newChatId = await get().createNewChat(`${session.title} (Copy)`);

          // Copy messages to new chat
          for (const message of session.messages) {
            await invoke('add_message_to_chat', {
              chatId: newChatId,
              content: message.content,
              role: message.role,
              model: session.metadata?.model || 'gemma3n:latest'
            });
          }

          return newChatId;
        } catch (error) {
          console.error('Failed to duplicate chat:', error);
          throw error;
        }
      },

      // Generate context-aware LLM response
      generateContextAwareResponse: async (prompt: string, systemPrompt?: string): Promise<string> => {
        const state = get();
        const activeChatId = state.activeChatId;

        if (!activeChatId) {
          throw new Error('No active chat session');
        }

        try {
          // First add the user message
          get().addMessage(prompt, 'user');

          // Generate response using context-aware endpoint
          const session = state.chatSessions[activeChatId];
          const model = session?.metadata?.model || 'gemma3n:latest';

          const response = await invoke<{response: string, success: boolean, error?: string}>('generate_chat_llm_response', {
            chatId: activeChatId,
            prompt,
            model,
            systemPrompt,
            stream: false
          });

          if (response.success) {
            // The backend automatically adds the assistant message, so we need to refresh the session
            await get().switchToChat(activeChatId);
            return response.response;
          } else {
            throw new Error(response.error || 'Failed to generate response');
          }
        } catch (error) {
          console.error('Failed to generate context-aware response:', error);
          throw error;
        }
      }
    }),
    {
      name: 'multi-chat-storage',
      partialize: (state) => ({
        activeChatId: state.activeChatId,
        chatSummaries: state.chatSummaries,
        currentInput: state.currentInput,
      }),
    }
  )
);
