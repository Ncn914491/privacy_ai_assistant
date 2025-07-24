import { PluginContext, PluginResult } from '../../types';
import { 
  PluginDetectionResult, 
  PluginExecutionResult, 
  ExtendedPluginContext, 
  PluginRunnerConfig 
} from '../plugins/types';
import { pluginRegistry } from '../plugins/registry';
import { pluginDetector } from '../plugins/detector';
import { pluginLoader } from '../plugins/loader';

/**
 * Plugin Runner - Central system for detecting and executing plugins
 */
export class PluginRunner {
  private config: PluginRunnerConfig;
  private isInitialized = false;

  constructor(config?: Partial<PluginRunnerConfig>) {
    this.config = {
      maxExecutionTime: 30000, // 30 seconds
      enableLogging: true,
      fallbackToLLM: true,
      keywordMatchThreshold: 0.6,
      ...config
    };
  }

  /**
   * Initialize the plugin system by loading all plugins
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Plugin runner already initialized');
      return;
    }

    try {
      console.log('Initializing plugin runner...');
      
      // Load all plugins
      const loadedPlugins = await pluginLoader.loadAllPlugins();
      
      if (this.config.enableLogging) {
        console.log(`Plugin runner initialized with ${loadedPlugins.length} plugins:`, 
          loadedPlugins.map(p => p.manifest.name));
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize plugin runner:', error);
      throw error;
    }
  }

  /**
   * Process user input and determine if a plugin should be executed
   */
  async processInput(input: string, context?: PluginContext): Promise<{
    shouldExecutePlugin: boolean;
    pluginResult?: PluginExecutionResult;
    fallbackToLLM: boolean;
    originalInput: string;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const originalInput = input;
    
    try {
      // Detect if any plugin should be triggered
      const detection = pluginDetector.detectPlugin(input);
      
      if (!detection || !detection.shouldExecute) {
        if (this.config.enableLogging) {
          console.log('No plugin detected for input:', input.substring(0, 100));
        }
        
        return {
          shouldExecutePlugin: false,
          fallbackToLLM: this.config.fallbackToLLM,
          originalInput
        };
      }

      // Execute the detected plugin
      const pluginResult = await this.executePlugin(
        detection.pluginName,
        detection.extractedInput,
        context
      );

      return {
        shouldExecutePlugin: true,
        pluginResult,
        fallbackToLLM: !pluginResult.success && this.config.fallbackToLLM,
        originalInput
      };

    } catch (error) {
      console.error('Error processing input:', error);
      
      return {
        shouldExecutePlugin: false,
        fallbackToLLM: this.config.fallbackToLLM,
        originalInput
      };
    }
  }

  /**
   * Execute a specific plugin with the given input
   */
  async executePlugin(
    pluginName: string, 
    input: string, 
    context?: PluginContext
  ): Promise<PluginExecutionResult> {
    const startTime = new Date();
    const executionId = this.generateExecutionId();
    
    const extendedContext: ExtendedPluginContext = {
      ...context,
      pluginName,
      executionId,
      startTime,
      userInput: input,
      timestamp: startTime,
    };

    try {
      // Get the plugin
      const plugin = pluginRegistry.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin "${pluginName}" not found`);
      }

      if (this.config.enableLogging) {
        console.log(`Executing plugin: ${pluginName} with input: "${input}"`);
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        plugin.run(input, extendedContext),
        this.config.maxExecutionTime
      );

      const executionTime = Date.now() - startTime.getTime();

      if (this.config.enableLogging) {
        console.log(`Plugin ${pluginName} executed in ${executionTime}ms:`, 
          result.success ? 'SUCCESS' : 'FAILED');
      }

      return {
        ...result,
        pluginName,
        executionTime,
        context: extendedContext
      };

    } catch (error) {
      const executionTime = Date.now() - startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.error(`Plugin ${pluginName} execution failed:`, error);

      return {
        success: false,
        error: `Plugin execution failed: ${errorMessage}`,
        pluginName,
        executionTime,
        context: extendedContext
      };
    }
  }

  /**
   * Get all available plugins with their capabilities
   */
  getAvailablePlugins(): Array<{
    name: string;
    description: string;
    category: string;
    triggerWords: string[];
    keywords: string[];
  }> {
    return pluginRegistry.getAll().map(plugin => ({
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      category: plugin.manifest.category,
      triggerWords: plugin.manifest.triggerWords,
      keywords: plugin.manifest.keywords
    }));
  }

  /**
   * Check if a specific plugin is available
   */
  isPluginAvailable(pluginName: string): boolean {
    return pluginRegistry.has(pluginName);
  }

  /**
   * Get plugin suggestions based on input
   */
  getPluginSuggestions(input: string): PluginDetectionResult[] {
    return pluginDetector.getPotentialMatches(input);
  }

  /**
   * Update plugin runner configuration
   */
  updateConfig(newConfig: Partial<PluginRunnerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update detector threshold if changed
    if (newConfig.keywordMatchThreshold !== undefined) {
      pluginDetector.setThreshold(newConfig.keywordMatchThreshold);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PluginRunnerConfig {
    return { ...this.config };
  }

  /**
   * Reload all plugins
   */
  async reloadPlugins(): Promise<void> {
    console.log('Reloading plugins...');
    
    try {
      await pluginLoader.reloadPlugins();
      console.log('Plugins reloaded successfully');
    } catch (error) {
      console.error('Failed to reload plugins:', error);
      throw error;
    }
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalPlugins: number;
    pluginNames: string[];
    isInitialized: boolean;
    config: PluginRunnerConfig;
  } {
    return {
      totalPlugins: pluginRegistry.count(),
      pluginNames: pluginRegistry.getPluginNames(),
      isInitialized: this.isInitialized,
      config: this.config
    };
  }
}

// Export singleton instance
export const pluginRunner = new PluginRunner();

// Export class for custom instances
export default PluginRunner;
