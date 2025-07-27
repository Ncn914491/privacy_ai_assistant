import { invoke } from '@tauri-apps/api/core';
import { LLMProvider, LLMModel, LLMConfig, LLMRoutingPreferences, NetworkStatus } from '../../types';

// Enhanced model provider types for hybrid configuration
export enum ModelProvider {
  LOCAL_GEMMA3N = 'local_gemma3n',
  ONLINE_GEMINI = 'online_gemini',
  HYBRID_AUTO = 'hybrid_auto'
}

export interface ConnectivityStatus {
  isOnline: boolean;
  latency: number;
  lastCheck: Date;
  geminiApiReachable: boolean;
}

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

  // Enhanced hybrid configuration
  private currentProvider: ModelProvider = ModelProvider.LOCAL_GEMMA3N;
  private connectivityStatus: ConnectivityStatus = {
    isOnline: false,
    latency: 0,
    lastCheck: new Date(),
    geminiApiReachable: false
  };

  private readonly LOCAL_MODEL = 'gemma3n:latest';
  private readonly ONLINE_MODEL = 'gemini-1.5-flash';
  private readonly GEMINI_API_KEY = 'AIzaSyC757g1ptvolgutJo4JvHofjpAvhQXFoLM';

  constructor(config?: Partial<LLMRouterConfig>) {
    this.config = {
      preferences: {
        preferredProvider: 'local',
        fallbackProvider: 'local',
        autoSwitchOnOffline: true, // Enable auto-switching for hybrid mode
        useOnlineForComplexQueries: true, // Enable online for complex queries
      },
      networkCheckInterval: 30000, // 30 seconds
      requestTimeout: 60000, // 60 seconds timeout
      ...config
    };

    this.networkStatus = {
      isOnline: typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true,
      lastChecked: new Date()
    };

    this.initializeNetworkMonitoring();
    this.initializeConnectivityMonitoring();
  }



  /**
   * Route a request to the appropriate LLM provider with hybrid support
   */
  async routeRequest(prompt: string, systemPrompt?: string, forceProvider?: LLMProvider): Promise<LLMResponse> {
    const complexity = this.calculateComplexity(prompt);
    const optimalModel = await this.selectOptimalModel(complexity, forceProvider as any);

    console.log(`🚀 [LLM ROUTER] Routing decision:`, optimalModel);

    try {
      if (optimalModel.selectedProvider === ModelProvider.ONLINE_GEMINI) {
        return await this.executeOnlineRequest(prompt, systemPrompt, optimalModel.model);
      } else {
        return await this.executeLocalRequest(prompt, systemPrompt, optimalModel.model);
      }
    } catch (error) {
      console.error(`❌ [LLM ROUTER] ${optimalModel.selectedProvider} request failed:`, error);

      // Try fallback if available
      if (optimalModel.fallbackProvider) {
        console.log(`🔄 [LLM ROUTER] Attempting fallback to ${optimalModel.fallbackProvider}`);
        try {
          if (optimalModel.fallbackProvider === ModelProvider.LOCAL_GEMMA3N) {
            return await this.executeLocalRequest(prompt, systemPrompt, this.LOCAL_MODEL);
          }
        } catch (fallbackError) {
          console.error(`❌ [LLM ROUTER] Fallback also failed:`, fallbackError);
        }
      }

      return {
        success: false,
        response: '',
        provider: 'local',
        model: this.LOCAL_MODEL,
        executionTime: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Select the optimal model based on connectivity and complexity
   */
  public async selectOptimalModel(
    complexity: number = 0.5,
    forceProvider?: ModelProvider
  ): Promise<{
    selectedProvider: ModelProvider;
    model: string;
    reason: string;
    estimatedResponseTime: number;
    fallbackProvider?: ModelProvider;
  }> {
    console.log('🤖 [LLM Router] Selecting optimal model...', { complexity, forceProvider });

    // If provider is forced, use it
    if (forceProvider) {
      return this.createRoutingDecision(forceProvider, complexity, 'User forced selection');
    }

    // Update connectivity status
    await this.checkConnectivity();

    // Auto-selection logic based on current provider setting
    switch (this.currentProvider) {
      case ModelProvider.LOCAL_GEMMA3N:
        return this.createRoutingDecision(
          ModelProvider.LOCAL_GEMMA3N,
          complexity,
          'Local-only mode selected'
        );

      case ModelProvider.ONLINE_GEMINI:
        if (this.connectivityStatus.isOnline && this.connectivityStatus.geminiApiReachable) {
          return this.createRoutingDecision(
            ModelProvider.ONLINE_GEMINI,
            complexity,
            'Online-only mode with good connectivity'
          );
        } else {
          return this.createRoutingDecision(
            ModelProvider.LOCAL_GEMMA3N,
            complexity,
            'Online mode requested but connectivity failed, falling back to local',
            ModelProvider.ONLINE_GEMINI
          );
        }

      case ModelProvider.HYBRID_AUTO:
        return this.selectHybridModel(complexity);

      default:
        return this.createRoutingDecision(
          ModelProvider.LOCAL_GEMMA3N,
          complexity,
          'Default fallback to local model'
        );
    }
  }

  /**
   * Execute a local LLM request via Tauri
   */
  private async executeLocalRequest(prompt: string, systemPrompt?: string, model: string = 'gemma3n:latest'): Promise<LLMResponse> {
    const startTime = Date.now();
    try {
      console.log(`🖥️ [LLM ROUTER] Executing local request with model: ${model}`);

      // Use Tauri invoke for local requests
      const response = await invoke('generate_llm_response', { prompt });

      return {
        success: true,
        response,
        model,
        provider: 'local',
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('❌ [LLM ROUTER] Local request failed:', error);
      throw error;
    }
  }

  /**
   * Execute an online request using Google Gemini API
   */
  private async executeOnlineRequest(prompt: string, systemPrompt?: string, model: string = 'gemini-1.5-flash'): Promise<LLMResponse> {
    const startTime = Date.now();
    try {
      console.log(`🌐 [LLM ROUTER] Executing online request with model: ${model}`);

      // Import Google Generative AI dynamically
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.GEMINI_API_KEY);
      const geminiModel = genAI.getGenerativeModel({ model });

      // Combine system prompt and user prompt
      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\nUser: ${prompt}`
        : prompt;

      const result = await geminiModel.generateContent(fullPrompt);
      const response = result.response.text();

      return {
        success: true,
        response,
        model,
        provider: 'online',
        executionTime: Date.now() - startTime,
        tokenCount: response.length // Approximate token count
      };
    } catch (error) {
      console.error('❌ [LLM ROUTER] Online request failed:', error);
      throw error;
    }
  }

  /**
   * Hybrid model selection logic
   */
  private async selectHybridModel(complexity: number): Promise<{
    selectedProvider: ModelProvider;
    model: string;
    reason: string;
    estimatedResponseTime: number;
    fallbackProvider?: ModelProvider;
  }> {
    const { isOnline, latency, geminiApiReachable } = this.connectivityStatus;

    // Prefer online for complex queries if connectivity is good
    if (isOnline && geminiApiReachable && latency < 2000) {
      if (complexity > 0.7) {
        return this.createRoutingDecision(
          ModelProvider.ONLINE_GEMINI,
          complexity,
          `High complexity (${complexity.toFixed(2)}) with good connectivity (${latency}ms)`,
          ModelProvider.LOCAL_GEMMA3N
        );
      }
    }

    // Use local for simple queries or poor connectivity
    return this.createRoutingDecision(
      ModelProvider.LOCAL_GEMMA3N,
      complexity,
      isOnline
        ? `Low complexity (${complexity.toFixed(2)}) or poor connectivity (${latency}ms)`
        : 'Offline mode detected',
      isOnline && geminiApiReachable ? ModelProvider.ONLINE_GEMINI : undefined
    );
  }

  /**
   * Create a routing decision object
   */
  private createRoutingDecision(
    provider: ModelProvider,
    complexity: number,
    reason: string,
    fallbackProvider?: ModelProvider
  ): {
    selectedProvider: ModelProvider;
    model: string;
    reason: string;
    estimatedResponseTime: number;
    fallbackProvider?: ModelProvider;
  } {
    const model = provider === ModelProvider.ONLINE_GEMINI ? this.ONLINE_MODEL : this.LOCAL_MODEL;
    const estimatedResponseTime = this.estimateResponseTime(provider, complexity);

    return {
      selectedProvider: provider,
      model,
      reason,
      estimatedResponseTime,
      fallbackProvider
    };
  }

  /**
   * Estimate response time based on provider and complexity
   */
  private estimateResponseTime(provider: ModelProvider, complexity: number): number {
    const baseTime = provider === ModelProvider.ONLINE_GEMINI
      ? 1500 + this.connectivityStatus.latency
      : 800;

    return Math.round(baseTime * (1 + complexity * 0.5));
  }

  /**
   * Calculate query complexity based on prompt characteristics
   */
  public calculateComplexity(prompt: string, context?: any): number {
    let complexity = 0.3; // Base complexity

    // Length factor
    const lengthFactor = Math.min(prompt.length / 1000, 0.3);
    complexity += lengthFactor;

    // Keyword-based complexity detection
    const complexKeywords = [
      'analyze', 'compare', 'explain', 'summarize', 'research',
      'code', 'programming', 'algorithm', 'technical', 'detailed',
      'comprehensive', 'complex', 'advanced', 'professional'
    ];

    const keywordMatches = complexKeywords.filter(keyword =>
      prompt.toLowerCase().includes(keyword)
    ).length;

    complexity += (keywordMatches / complexKeywords.length) * 0.3;

    // Context factor
    if (context && Object.keys(context).length > 0) {
      complexity += 0.1;
    }

    return Math.min(complexity, 1.0);
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
   * Check connectivity status for hybrid routing
   */
  private async checkConnectivity(): Promise<void> {
    const startTime = Date.now();

    try {
      // Check basic internet connectivity
      const isOnline = navigator.onLine;

      if (isOnline) {
        // Test Gemini API reachability with a simple request
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': this.GEMINI_API_KEY
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        const latency = Date.now() - startTime;

        this.connectivityStatus = {
          isOnline: true,
          latency,
          lastCheck: new Date(),
          geminiApiReachable: response.ok
        };

        console.log('🌐 [LLM Router] Connectivity check:', this.connectivityStatus);
      } else {
        this.connectivityStatus = {
          isOnline: false,
          latency: 0,
          lastCheck: new Date(),
          geminiApiReachable: false
        };
      }
    } catch (error) {
      console.warn('⚠️ [LLM Router] Connectivity check failed:', error);
      this.connectivityStatus = {
        isOnline: navigator.onLine,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        geminiApiReachable: false
      };
    }
  }

  /**
   * Initialize connectivity monitoring for hybrid mode
   */
  private initializeConnectivityMonitoring(): void {
    // Check connectivity every 30 seconds
    setInterval(() => {
      this.checkConnectivity();
    }, 30000);

    // Initial check
    this.checkConnectivity();

    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('🌐 [LLM Router] Network came online');
      this.checkConnectivity();
    });

    window.addEventListener('offline', () => {
      console.log('🌐 [LLM Router] Network went offline');
      this.connectivityStatus.isOnline = false;
      this.connectivityStatus.geminiApiReachable = false;
    });
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
   * Set the current provider preference
   */
  public setProvider(provider: ModelProvider): void {
    console.log(`🤖 [LLM Router] Provider changed: ${this.currentProvider} → ${provider}`);
    this.currentProvider = provider;
  }

  /**
   * Get current provider
   */
  public getCurrentProvider(): ModelProvider {
    return this.currentProvider;
  }

  /**
   * Get connectivity status
   */
  public getConnectivityStatus(): ConnectivityStatus {
    return { ...this.connectivityStatus };
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
