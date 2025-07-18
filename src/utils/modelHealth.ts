import { invoke } from '@tauri-apps/api/core';

export interface ModelHealthStatus {
  isAvailable: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  error: string | null;
}

export class ModelHealthChecker {
  private static instance: ModelHealthChecker;
  private status: ModelHealthStatus = {
    isAvailable: false,
    isChecking: false,
    lastChecked: null,
    error: null,
  };
  private listeners: Array<(status: ModelHealthStatus) => void> = [];

  private constructor() {}

  static getInstance(): ModelHealthChecker {
    if (!ModelHealthChecker.instance) {
      ModelHealthChecker.instance = new ModelHealthChecker();
    }
    return ModelHealthChecker.instance;
  }

  subscribe(listener: (status: ModelHealthStatus) => void): () => void {
    this.listeners.push(listener);
    // Immediately call with current status
    listener(this.status);
    
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.status));
  }

  async checkHealth(): Promise<boolean> {
    if (this.status.isChecking) {
      return this.status.isAvailable;
    }

    this.status = {
      ...this.status,
      isChecking: true,
      error: null,
    };
    this.notifyListeners();

    try {
      console.log('Checking model health...');
      const isHealthy = await invoke<boolean>('check_llm_health');
      
      this.status = {
        isAvailable: isHealthy,
        isChecking: false,
        lastChecked: new Date(),
        error: isHealthy ? null : 'Model is not responding',
      };
      
      console.log('Model health check result:', isHealthy);
      this.notifyListeners();
      return isHealthy;
    } catch (error) {
      console.error('Model health check failed:', error);
      
      this.status = {
        isAvailable: false,
        isChecking: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error),
      };
      
      this.notifyListeners();
      return false;
    }
  }

  getStatus(): ModelHealthStatus {
    return { ...this.status };
  }

  async startPeriodicCheck(intervalMs: number = 30000): Promise<void> {
    // Initial check
    await this.checkHealth();
    
    // Set up periodic checks
    setInterval(async () => {
      await this.checkHealth();
    }, intervalMs);
  }
}

// Export singleton instance
export const modelHealthChecker = ModelHealthChecker.getInstance();
