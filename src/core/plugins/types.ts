import { Plugin, PluginManifest, PluginResult, PluginContext } from '../../types';

// Base plugin interface that all plugins must implement
export interface BasePlugin {
  manifest: PluginManifest;
  run: (input: string, context?: PluginContext) => Promise<PluginResult>;
}

// Plugin execution context with additional metadata
export interface ExtendedPluginContext extends PluginContext {
  pluginName: string;
  executionId: string;
  startTime: Date;
  userInput: string;
}

// Plugin detection result
export interface PluginDetectionResult {
  shouldExecute: boolean;
  pluginName: string;
  confidence: number;
  matchedKeywords: string[];
  extractedInput: string;
}

// Plugin execution result with metadata
export interface PluginExecutionResult extends PluginResult {
  pluginName: string;
  executionTime: number;
  context: ExtendedPluginContext;
}

// Plugin loader interface
export interface PluginLoader {
  loadPlugin: (pluginPath: string) => Promise<Plugin>;
  loadAllPlugins: () => Promise<Plugin[]>;
  validatePlugin: (plugin: Plugin) => boolean;
}

// Plugin registry interface
export interface PluginRegistryInterface {
  register: (plugin: Plugin) => void;
  unregister: (pluginName: string) => void;
  get: (pluginName: string) => Plugin | undefined;
  getAll: () => Plugin[];
  findByKeyword: (keyword: string) => Plugin[];
  clear: () => void;
}

// Plugin runner configuration
export interface PluginRunnerConfig {
  maxExecutionTime: number;
  enableLogging: boolean;
  fallbackToLLM: boolean;
  keywordMatchThreshold: number;
}

export default BasePlugin;
