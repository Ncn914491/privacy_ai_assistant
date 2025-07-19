export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isLoading?: boolean;
  error?: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentInput: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  fontSize: 'small' | 'medium' | 'large';
  enableNotifications: boolean;
  enableSounds: boolean;
  autoSave: boolean;
}

export interface SystemInfo {
  os: string;
  arch: string;
  version: string;
  timestamp: string;
}

export interface AppVersion {
  version: string;
  name: string;
  build_date: string;
}

export interface AppState {
  isInitialized: boolean;
  systemInfo: SystemInfo | null;
  appVersion: AppVersion | null;
  preferences: UserPreferences;
}

export type Theme = 'light' | 'dark' | 'system';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
}

export interface ChatActions {
  addMessage: (content: string, role: 'user' | 'assistant', customId?: string | number) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentInput: (input: string) => void;
}

export interface PreferenceActions {
  setTheme: (theme: Theme) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setFontSize: (size: 'small' | 'medium' | 'large') => void;
  toggleNotifications: () => void;
  toggleSounds: () => void;
  toggleAutoSave: () => void;
  resetPreferences: () => void;
}

export interface SttResult {
  text: string;
  confidence: number;
  success: boolean;
}
