import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, Settings } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/utils/cn';

interface DiagnosticStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'checking' | 'success' | 'error';
  error?: string;
  details?: string;
  critical: boolean;
}

interface StartupDiagnosticProps {
  onDiagnosticComplete: (success: boolean, results: DiagnosticStep[]) => void;
  className?: string;
}

export const StartupDiagnostic: React.FC<StartupDiagnosticProps> = ({
  onDiagnosticComplete,
  className = ''
}) => {
  const [steps, setSteps] = useState<DiagnosticStep[]>([
    {
      id: 'tauri',
      name: 'Tauri Environment',
      description: 'Testing desktop environment connection',
      status: 'pending',
      critical: true
    },
    {
      id: 'backend',
      name: 'Backend Commands',
      description: 'Verifying Rust backend availability',
      status: 'pending',
      critical: true
    },
    {
      id: 'ollama',
      name: 'Ollama Service',
      description: 'Checking LLM service connection',
      status: 'pending',
      critical: true
    },
    {
      id: 'gemma',
      name: 'Gemma 3n Model',
      description: 'Testing model response capability',
      status: 'pending',
      critical: true
    },
    {
      id: 'audio',
      name: 'Audio System',
      description: 'Testing microphone and speakers',
      status: 'pending',
      critical: false
    }
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const updateStep = (id: string, updates: Partial<DiagnosticStep>) => {
    setSteps(prev => prev.map(step => 
      step.id === id ? { ...step, ...updates } : step
    ));
  };

  const logDiagnostic = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    console.log(`${emoji} ${message}`);
  };

  const testTauriEnvironment = async (): Promise<boolean> => {
    updateStep('tauri', { status: 'checking' });
    
    try {
      // Check if Tauri is available
      if (typeof window === 'undefined' || !window.__TAURI__) {
        logDiagnostic('Tauri environment not available - running in browser mode', 'error');
        updateStep('tauri', { 
          status: 'error', 
          error: 'Running in browser mode',
          details: 'Limited functionality available. Desktop features disabled.'
        });
        // Return true to allow partial functionality
        return true;
      }

      // Test basic Tauri connection
      const result = await invoke<string>('test_tauri_connection');
      logDiagnostic(`Tauri connection: ${result}`, 'success');
      
      updateStep('tauri', { 
        status: 'success',
        details: result
      });
      return true;
    } catch (error) {
      logDiagnostic(`Tauri connection failed: ${error}`, 'error');
      updateStep('tauri', { 
        status: 'error', 
        error: 'Connection failed',
        details: 'Some features may not work. ' + (error instanceof Error ? error.message : String(error))
      });
      // Return true to allow partial functionality
      return true;
    }
  };

  const testBackendCommands = async (): Promise<boolean> => {
    updateStep('backend', { status: 'checking' });
    
    try {
      const diagnostic = await invoke<any>('get_diagnostic_info');
      logDiagnostic(`Backend diagnostic: ${JSON.stringify(diagnostic, null, 2)}`, 'success');
      
      updateStep('backend', { 
        status: 'success',
        details: `${diagnostic.commands_available.length} commands available`
      });
      return true;
    } catch (error) {
      logDiagnostic(`Backend commands failed: ${error}`, 'error');
      updateStep('backend', { 
        status: 'error', 
        error: 'Backend commands not available',
        details: 'Basic chat functionality may still work. ' + (error instanceof Error ? error.message : String(error))
      });
      // Return true to allow partial functionality
      return true;
    }
  };

  const testOllamaService = async (): Promise<boolean> => {
    updateStep('ollama', { status: 'checking' });
    
    try {
      const isHealthy = await invoke<boolean>('check_llm_health');
      
      if (isHealthy) {
        logDiagnostic('Ollama service is healthy', 'success');
        updateStep('ollama', { 
          status: 'success',
          details: 'Service responding at localhost:11434'
        });
        return true;
      } else {
        logDiagnostic('Ollama service is not responding', 'error');
        updateStep('ollama', { 
          status: 'error', 
          error: 'Service not responding',
          details: 'AI chat disabled. Please start Ollama service and ensure it\'s running on localhost:11434'
        });
        return false;
      }
    } catch (error) {
      logDiagnostic(`Ollama service check failed: ${error}`, 'error');
      updateStep('ollama', { 
        status: 'error', 
        error: 'Service check failed',
        details: 'AI chat disabled. Install Ollama from https://ollama.ai and start the service'
      });
      return false;
    }
  };

  const testGemmaModel = async (): Promise<boolean> => {
    updateStep('gemma', { status: 'checking' });
    
    try {
      const response = await invoke<string>('generate_llm_response', { 
        prompt: 'Hello, respond with just "OK"' 
      });
      
      if (response && response.trim().length > 0) {
        logDiagnostic(`Gemma 3n model responding: ${response.slice(0, 50)}...`, 'success');
        updateStep('gemma', { 
          status: 'success',
          details: 'Model responding correctly'
        });
        return true;
      } else {
        logDiagnostic('Gemma 3n model returned empty response', 'error');
        updateStep('gemma', { 
          status: 'error', 
          error: 'Empty response from model',
          details: 'AI chat disabled. Model may not be loaded properly'
        });
        return false;
      }
    } catch (error) {
      logDiagnostic(`Gemma 3n model test failed: ${error}`, 'error');
      updateStep('gemma', { 
        status: 'error', 
        error: 'Model test failed',
        details: 'AI chat disabled. Install with: ollama pull gemma3n'
      });
      return false;
    }
  };

  const testAudioSystem = async (): Promise<boolean> => {
    updateStep('audio', { status: 'checking' });
    
    try {
      const result = await invoke<string>('test_audio_devices');
      
      if (result && result.includes('Input') && result.includes('Output')) {
        logDiagnostic(`Audio system OK: ${result}`, 'success');
        updateStep('audio', { 
          status: 'success',
          details: result
        });
        return true;
      } else {
        logDiagnostic(`Audio system limited: ${result}`, 'error');
        updateStep('audio', { 
          status: 'error', 
          error: 'Audio devices not available',
          details: 'Voice features may not work properly'
        });
        return false;
      }
    } catch (error) {
      logDiagnostic(`Audio system test failed: ${error}`, 'error');
      updateStep('audio', { 
        status: 'error', 
        error: 'Audio test failed',
        details: 'Voice features will be disabled'
      });
      return false;
    }
  };

  const runDiagnostic = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    logDiagnostic('Starting comprehensive system diagnostic...', 'info');
    
    // Run tests in sequence
    await testTauriEnvironment();
    await testBackendCommands();
    await testOllamaService();
    await testGemmaModel();
    await testAudioSystem();
    
    // Determine overall success - allow partial functionality
    const criticalSteps = steps.filter(s => s.critical);
    const hasAtLeastOneSuccess = criticalSteps.some(s => s.status === 'success');
    const allCriticalSuccess = criticalSteps.every(s => s.status === 'success');
    
    setIsRunning(false);
    
    if (allCriticalSuccess) {
      logDiagnostic('Diagnostic complete. All critical systems operational', 'success');
    } else if (hasAtLeastOneSuccess) {
      logDiagnostic('Diagnostic complete. Partial functionality available', 'info');
    } else {
      logDiagnostic('Diagnostic complete. No critical systems available', 'error');
    }
    
    // Allow partial functionality if at least one critical system works
    onDiagnosticComplete(hasAtLeastOneSuccess, steps);
  };

  useEffect(() => {
    // Auto-start diagnostic after component mounts
    const timer = setTimeout(() => {
      runDiagnostic();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  const getStepIcon = (step: DiagnosticStep) => {
    switch (step.status) {
      case 'checking':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const criticalErrors = steps.filter(s => s.critical && s.status === 'error');
  const allComplete = steps.every(s => s.status !== 'pending' && s.status !== 'checking');

  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-lg shadow-lg', className)}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            System Diagnostic
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title="Toggle details"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={runDiagnostic}
              disabled={isRunning}
              className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              title="Retry diagnostic"
            >
              <RefreshCw className={cn('w-4 h-4 mr-1', isRunning && 'animate-spin')} />
              {isRunning ? 'Running...' : 'Retry'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(step)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {step.name}
                    {step.critical && <span className="ml-1 text-red-500">*</span>}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {step.status === 'checking' && 'Checking...'}
                    {step.status === 'success' && 'OK'}
                    {step.status === 'error' && 'Failed'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {step.description}
                </p>
                {step.error && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-300">
                    {step.error}
                  </div>
                )}
                {showDetails && step.details && (
                  <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                    {step.details}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {allComplete && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            {criticalErrors.length === 0 ? (
              <div className="text-center text-green-600 dark:text-green-400">
                <CheckCircle className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">All critical systems operational</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Privacy AI Assistant is ready to use
                </p>
              </div>
            ) : (
              <div className="text-center text-yellow-600 dark:text-yellow-400">
                <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                <p className="font-medium">Partial functionality available</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {criticalErrors.length} issue(s) detected. Some features may be limited.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StartupDiagnostic;
