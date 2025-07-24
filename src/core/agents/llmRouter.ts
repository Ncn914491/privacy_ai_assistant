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
        fallbackProvider: 'online',
        autoSwitchOnOffline: true,
        useOnlineForComplexQueries: false,
        geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyC757g1ptvolgutJo4JvHofjpAvhQXFoLM'
      },
      networkCheckInterval: 30000, // 30 seconds
      requestTimeout: 30000, // 30 seconds
      ...config
    };

    this.networkStatus = {
      isOnline: typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true,
      lastChecked: new Date()
    };

    this.initializeNetworkMonitoring();
  }



  /**
   * Route an LLM request based on preferences and network status
   */
  async routeRequest(
    prompt: string, 
    systemPrompt?: string,
    forceProvider?: LLMProvider
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    try {
      // Update network status
      await this.checkNetworkStatus();

      // Determine which provider to use
      const provider = this.determineProvider(prompt, forceProvider);
      const model = this.getModelForProvider(provider);

      console.log(`Routing LLM request to ${provider} (${model})`);

      // Execute the request
      const response = await this.executeRequest(provider, model, prompt, systemPrompt);
      
      return {
        ...response,
        provider,
        model,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('LLM routing error:', error);
      
      // Try fallback if primary failed
      if (!forceProvider) {
        const fallbackProvider = this.config.preferences.fallbackProvider;
        if (fallbackProvider !== this.config.preferences.preferredProvider) {
          console.log(`Attempting fallback to ${fallbackProvider}`);
          return await this.routeRequest(prompt, systemPrompt, fallbackProvider);
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: forceProvider || this.config.preferences.preferredProvider,
        model: this.getModelForProvider(forceProvider || this.config.preferences.preferredProvider),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Execute request with specific provider
   */
  private async executeRequest(
    provider: LLMProvider,
    model: LLMModel,
    prompt: string,
    systemPrompt?: string
  ): Promise<Omit<LLMResponse, 'provider' | 'model' | 'executionTime'>> {
    if (provider === 'local') {
      return await this.executeLocalRequest(prompt, systemPrompt);
    } else {
      return await this.executeOnlineRequest(prompt, systemPrompt);
    }
  }

  /**
   * Execute local Gemma 3n request via Ollama
   */
  private async executeLocalRequest(
    prompt: string,
    systemPrompt?: string
  ): Promise<Omit<LLMResponse, 'provider' | 'model' | 'executionTime'>> {
    try {
      // Combine system prompt with user prompt if provided
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

      // Use the correct Tauri command that matches the backend implementation
      const response = await invoke<string>('generate_llm_response', {
        prompt: fullPrompt
      });

      if (!response || response.trim().length === 0) {
        throw new Error('Received empty response from local LLM service');
      }

      return {
        success: true,
        response: response
      };
    } catch (error) {
      console.error('Local LLM request failed:', error);

      // Provide more specific error messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Connection refused') || errorMessage.includes('connect')) {
        throw new Error('Cannot connect to Ollama service. Please ensure Ollama is running on localhost:11434 and the Gemma 3n model is available.');
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        throw new Error('Request timed out. The local AI model may be loading or under heavy load.');
      } else if (errorMessage.includes('model') && errorMessage.includes('not found')) {
        throw new Error('Gemma 3n model not found. Please install it with: ollama pull gemma3n');
      } else {
        throw new Error(`Local LLM error: ${errorMessage}`);
      }
    }
  }

  /**
   * Execute online Gemini API request
   */
  private async executeOnlineRequest(
    prompt: string, 
    systemPrompt?: string
  ): Promise<Omit<LLMResponse, 'provider' | 'model' | 'executionTime'>> {
    try {
      if (!this.networkStatus.isOnline) {
        throw new Error('Network is offline');
      }

      if (!this.config.preferences.geminiApiKey) {
        throw new Error('Gemini API key not configured');
      }

      // Prepare the request payload
      const messages = [];
      
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });

      // Make request to Gemini API - using selected model or default to 2.5 Flash
      const selectedModel = this.config.preferences.selectedOnlineModel || 'gemini-2.5-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=` + this.config.preferences.geminiApiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        }),
        signal: AbortSignal.timeout(this.config.requestTimeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response from Gemini API');
      }

      const content = data.candidates[0].content?.parts?.[0]?.text;
      if (!content) {
        throw new Error('Invalid response format from Gemini API');
      }

      return {
        success: true,
        response: content,
        tokenCount: data.usageMetadata?.totalTokenCount
      };

    } catch (error) {
      console.error('Online LLM request failed:', error);
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

    // Check for explicit provider tags in prompt
    if (prompt.includes('[use_online]') || prompt.includes('[use_gemini]')) {
      return 'online';
    }
    
    if (prompt.includes('[use_local]') || prompt.includes('[use_gemma]')) {
      return 'local';
    }

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
   * Get the model name for a provider
   */
  private getModelForProvider(provider: LLMProvider): LLMModel {
    return provider === 'local' ? 'gemma3n' : 'gemini-api';
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

    // Test online provider
    try {
      await this.checkNetworkStatus();
      if (this.networkStatus.isOnline && this.config.preferences.geminiApiKey) {
        // Quick test request to Gemini API - using selected model or default to 2.5 Flash
        const selectedModel = this.config.preferences.selectedOnlineModel || 'gemini-2.5-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=` + this.config.preferences.geminiApiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hello' }] }],
            generationConfig: { maxOutputTokens: 1 }
          }),
          signal: AbortSignal.timeout(5000)
        });
        results.online.available = response.ok;
        if (!response.ok) {
          results.online.error = `HTTP ${response.status}`;
        }
      } else {
        results.online.error = this.networkStatus.isOnline ? 'No API key' : 'Offline';
      }
    } catch (error) {
      results.online.error = error instanceof Error ? error.message : String(error);
    }

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
