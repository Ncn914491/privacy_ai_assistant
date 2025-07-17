import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Message, 
  ChatState, 
  ChatActions, 
  UserPreferences, 
  PreferenceActions, 
  AppState,
  SystemInfo,
  AppVersion 
} from '@/types';

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
    (set, get) => ({
      messages: mockMessages,
      isLoading: false,
      error: null,
      currentInput: '',

      addMessage: (content: string, role: 'user' | 'assistant') => {
        const newMessage: Message = {
          id: generateId(),
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
    (set, get) => ({
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
