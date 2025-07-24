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

// ===== MULTI-CHAT SESSION TYPES =====

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: ChatSessionMetadata;
}

export interface ChatSessionMetadata {
  model?: string;
  tokenCount?: number;
  messageCount?: number;
  lastActivity?: Date;
  tags?: string[];
  isArchived?: boolean;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  lastMessage?: string | null;
  messageCount: number;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
  isArchived?: boolean;
}

// Extended chat state for multi-session support
export interface MultiChatState extends ChatState {
  activeChatId: string | null;
  chatSessions: Record<string, ChatSession>;
  chatSummaries: ChatSessionSummary[];
}

// Actions for multi-chat management
export interface ChatSessionActions {
  createNewChat: (title?: string) => Promise<string>;
  switchToChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, newTitle: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  archiveChat: (chatId: string) => Promise<void>;
  loadChatSessions: () => Promise<void>;
  saveChatSession: (chatId: string) => Promise<void>;
  duplicateChat: (chatId: string) => Promise<string>;
  generateContextAwareResponse: (prompt: string, systemPrompt?: string) => Promise<string>;
  saveMessageToBackend: (chatId: string, content: string, role: 'user' | 'assistant') => Promise<void>;
}

// ===== HARDWARE DETECTION TYPES =====

export interface HardwareInfo {
  hasGPU: boolean;
  gpuName?: string;
  vramTotal?: number; // in MB
  vramAvailable?: number; // in MB
  cpuCores: number;
  ramTotal?: number; // in MB
  ramAvailable?: number; // in MB
}

export type RuntimeMode = 'gpu' | 'hybrid' | 'cpu';

export interface RuntimeConfig {
  mode: RuntimeMode;
  reason: string;
  ollamaArgs?: string[];
  hardwareInfo: HardwareInfo;
}

// ===== CONTEXT MANAGEMENT TYPES =====

export interface TokenInfo {
  count: number;
  limit: number;
  percentage: number;
}

export interface ContextWindow {
  messages: Message[];
  tokenInfo: TokenInfo;
  truncatedCount: number;
}

export interface ConversationContext {
  chatId: string;
  contextWindow: ContextWindow;
  systemPrompt?: string;
  model: string;
}

// ===== PLUGIN SYSTEM TYPES =====

export interface PluginManifest {
  name: string;
  description: string;
  version: string;
  author?: string;
  keywords: string[];
  triggerWords: string[];
  category: 'productivity' | 'utility' | 'system' | 'file' | 'other';
  permissions?: string[];
  examples?: string[];
}

export interface PluginResult {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}

export interface Plugin {
  manifest: PluginManifest;
  run: (input: string, context?: PluginContext) => Promise<PluginResult>;
}

export interface PluginContext {
  chatId?: string;
  userId?: string;
  timestamp: Date;
  workingDirectory?: string;
}

export interface PluginRegistry {
  [pluginName: string]: Plugin;
}

// ===== LLM ROUTING TYPES =====

export type LLMProvider = 'local' | 'online';
export type LLMModel = 'gemma3n' | 'gemini-api';

export interface LLMConfig {
  provider: LLMProvider;
  model: LLMModel;
  apiKey?: string;
  endpoint?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMRoutingPreferences {
  preferredProvider: LLMProvider;
  fallbackProvider: LLMProvider;
  autoSwitchOnOffline: boolean;
  useOnlineForComplexQueries: boolean;
  geminiApiKey?: string;
  selectedOnlineModel?: string;
  selectedOfflineModel?: string;
}

export interface NetworkStatus {
  isOnline: boolean;
  lastChecked: Date;
  latency?: number;
}
