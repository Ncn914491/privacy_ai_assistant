import { invoke } from '@tauri-apps/api/core';
import { LLMProvider, LLMModel, LLMConfig, LLMRoutingPreferences, NetworkStatus } from '../../types';

export interface LLMResponse {
  success: boolean;
  response?: string;
  error?: string;
  provider: LLMProvider;
  model: LLMModel;
  executionTime: number;
  tokenCount?: number;
}

export interface LLMRouterConfig {
  preferences: LLMRoutingPreferences;
  networkCheckInterval: number;
  requestTimeout: number;
}

/**
 * LLM Router - Routes requests between local Gemma 3n and online Gemini API
 */
export class LLMRouter {
  private config: LLMRouterConfig;
  private networkStatus: NetworkStatus;
  private networkCheckTimer?: NodeJS.Timeout;

  constructor(config?: Partial<LLMRouterConfig>) {
    this.config = {
      preferences: {
        preferredProvider: 'local',
        fallbackProvider: 'local', // Changed from 'online' to 'local'
        autoSwitchOnOffline: false, // Disabled online switching
        useOnlineForComplexQueries: false,
        // Removed geminiApiKey - no longer using online APIs
      },
      networkCheckInterval: 30000, // 30 seconds
      requestTimeout: 60000, // Increased to 60 seconds for local models
      ...config
    };

    this.networkStatus = {
      isOnline: typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true,
      lastChecked: new Date()
    };

    this.initializeNetworkMonitoring();
  }



  /**
   * Route a request to the appropriate LLM provider
   */
  async routeRequest(prompt: string, systemPrompt?: string, forceProvider?: LLMProvider): Promise<LLMResponse> {
    // EXCLUSIVE: Force local provider only
    const provider: LLMProvider = 'local';
    const model = this.getModelForProvider(provider);
    
    console.log(`🚀 [LLM ROUTER] Routing to ${provider} provider with model: ${model}`);
    
    try {
      // EXCLUSIVE: Only local execution
      return await this.executeLocalRequest(prompt, systemPrompt, model);
    } catch (error) {
      console.error(`❌ [LLM ROUTER] ${provider} request failed:`, error);
      return {
        success: false,
        response: '',
        model,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute a local LLM request via Tauri
   */
  private async executeLocalRequest(prompt: string, systemPrompt?: string, model: string = 'gemma3n:latest'): Promise<LLMResponse> {
    try {
      console.log(`🖥️ [LLM ROUTER] Executing local request with model: ${model}`);
      
      // Use Tauri invoke for local requests
      const response = await invoke('generate_llm_response', { prompt });
      
      return {
        success: true,
        response,
        model,
        provider: 'local'
      };
    } catch (error) {
      console.error('❌ [LLM ROUTER] Local request failed:', error);
      throw error;
    }
  }

  /**
   * Determine which provider to use based on preferences and context
   */
  private determineProvider(prompt: string, forceProvider?: LLMProvider): LLMProvider {
    // If provider is forced, use it
    if (forceProvider) {
      return forceProvider;
    }

    // Check for explicit provider tags in prompt (only local supported now)
    if (prompt.includes('[use_local]') || prompt.includes('[use_gemma]')) {
      return 'local';
    }

    // All requests now use local models only
    return 'local';

    // If offline and auto-switch is enabled, use local
    if (!this.networkStatus.isOnline && this.config.preferences.autoSwitchOnOffline) {
      return 'local';
    }

    // Check if this is a complex query that should use online
    if (this.config.preferences.useOnlineForComplexQueries && this.isComplexQuery(prompt)) {
      return this.networkStatus.isOnline ? 'online' : 'local';
    }

    // Use preferred provider
    return this.config.preferences.preferredProvider;
  }

  /**
   * Determine if a query is complex and might benefit from online model
   */
  private isComplexQuery(prompt: string): boolean {
    const complexityIndicators = [
      'analyze', 'explain in detail', 'comprehensive', 'research',
      'compare', 'contrast', 'pros and cons', 'advantages and disadvantages',
      'step by step', 'tutorial', 'guide', 'how to', 'what is the difference',
      'summarize', 'translate', 'code review', 'debug', 'optimize'
    ];

    const lowerPrompt = prompt.toLowerCase();
    const indicatorCount = complexityIndicators.filter(indicator => 
      lowerPrompt.includes(indicator)
    ).length;

    // Consider complex if it has multiple indicators or is very long
    return indicatorCount >= 2 || prompt.length > 500;
  }

  /**
   * Get the model name for a provider (local only now)
   */
  private getModelForProvider(provider: LLMProvider): LLMModel {
    return 'gemma3n:latest'; // EXCLUSIVE: Only gemma3n:latest model
  }

  /**
   * Check network status - simplified for Tauri environment
   */
  private async checkNetworkStatus(): Promise<void> {
    try {
      // In Tauri, we'll use a simpler approach
      // Try to make a quick request to a reliable endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch('https://www.google.com/generate_204', {
          method: 'HEAD',
          signal: controller.signal,
          cache: 'no-cache',
          mode: 'no-cors' // Important for Tauri
        });
        clearTimeout(timeoutId);
        this.networkStatus.isOnline = true;
      } catch (error) {
        clearTimeout(timeoutId);
        // If the request fails, we're likely offline
        this.networkStatus.isOnline = false;
      }

      this.networkStatus.lastChecked = new Date();
    } catch (error) {
      console.error('Network status check failed:', error);
      this.networkStatus.isOnline = false;
      this.networkStatus.lastChecked = new Date();
    }
  }

  /**
   * Initialize network monitoring
   */
  private initializeNetworkMonitoring(): void {
    // Listen to browser online/offline events - safe for Tauri environment
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
      window.addEventListener('online', () => {
        this.networkStatus.isOnline = true;
        this.networkStatus.lastChecked = new Date();
        console.log('Network status: Online');
      });

      window.addEventListener('offline', () => {
        this.networkStatus.isOnline = false;
        this.networkStatus.lastChecked = new Date();
        console.log('Network status: Offline');
      });
    }

    // Periodic network check
    this.networkCheckTimer = setInterval(() => {
      this.checkNetworkStatus();
    }, this.config.networkCheckInterval);
  }

  /**
   * Update router preferences
   */
  updatePreferences(preferences: Partial<LLMRoutingPreferences>): void {
    this.config.preferences = { ...this.config.preferences, ...preferences };
    console.log('LLM router preferences updated:', this.config.preferences);
  }

  /**
   * Get current preferences
   */
  getPreferences(): LLMRoutingPreferences {
    return { ...this.config.preferences };
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Test connectivity to both providers
   */
  async testConnectivity(): Promise<{
    local: { available: boolean; error?: string };
    online: { available: boolean; error?: string };
  }> {
    const results = {
      local: { available: false, error: undefined as string | undefined },
      online: { available: false, error: undefined as string | undefined }
    };

    // Test local provider
    try {
      const localResponse = await invoke<boolean>('check_llm_health');
      results.local.available = localResponse;
    } catch (error) {
      results.local.error = error instanceof Error ? error.message : String(error);
    }

    // Online provider no longer supported - using local only
    results.online.available = false;
    results.online.error = 'Online API support removed - using local models only';

    return results;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.networkCheckTimer) {
      clearInterval(this.networkCheckTimer);
      this.networkCheckTimer = undefined;
    }
  }
}

// Export singleton instance
export const llmRouter = new LLMRouter();

// Export class for custom instances
export default LLMRouter;
