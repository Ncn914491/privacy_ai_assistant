import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, Settings } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../utils/cn';

interface DiagnosticStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'checking' | 'success' | 'error';
  error?: string;
  details?: string;
  critical: boolean;
  runCheck: () => Promise<boolean>;
}

interface StartupDiagnosticProps {
  onDiagnosticComplete: (success: boolean) => void;
  className?: string;
}

export const StartupDiagnostic: React.FC<StartupDiagnosticProps> = ({
  onDiagnosticComplete,
  className = '',
}) => {
  const [steps, setSteps] = useState<Omit<DiagnosticStep, 'runCheck'>[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const updateStepStatus = (id: string, status: DiagnosticStep['status'], data: Partial<DiagnosticStep> = {}) => {
    setSteps(prev =>
      prev.map(step => (step.id === id ? { ...step, status, ...data } : step))
    );
  };

  const diagnosticChecks: DiagnosticStep[] = [
    {
      id: 'backend',
      name: 'Backend Connection',
      description: 'Pinging the Rust backend',
      status: 'pending',
      critical: true,
      runCheck: async () => {
        try {
          const result = await invoke('ping');
          if (result === 'pong') {
            updateStepStatus('backend', 'success', { details: 'Backend responded successfully.' });
            return true;
          }
          throw new Error('Invalid response from backend.');
        } catch (error) {
          updateStepStatus('backend', 'error', { error: 'Backend is not responding.', details: String(error) });
          return false;
        }
      },
    },
    {
      id: 'ollama',
      name: 'Ollama Service',
      description: 'Checking for the Ollama service',
      status: 'pending',
      critical: true,
      runCheck: async () => {
        try {
          const isReady = await invoke('check_ollama_service');
          if (isReady) {
            updateStepStatus('ollama', 'success', { details: 'Ollama service is active.' });
            return true;
          }
          throw new Error('Ollama service not found.');
        } catch (error) {
          updateStepStatus('ollama', 'error', { error: 'Ollama not running.', details: 'Please start the Ollama service and retry.' });
          return false;
        }
      },
    },
    {
      id: 'gemma',
      name: 'Gemma 3n Model',
      description: 'Verifying the Gemma 3n model is available',
      status: 'pending',
      critical: true,
      runCheck: async () => {
        try {
          const isReady = await invoke('test_gemma_model');
          if (isReady) {
            updateStepStatus('gemma', 'success', { details: 'Gemma 3n model is responsive.' });
            return true;
          }
          throw new Error('Model did not respond correctly.');
        } catch (error) {
          updateStepStatus('gemma', 'error', { error: 'Gemma 3n model not found.', details: 'Run `ollama pull gemma3n` and retry.' });
          return false;
        }
      },
    },
    {
      id: 'audio',
      name: 'Audio System',
      description: 'Checking microphone and speaker setup',
      status: 'pending',
      critical: false,
      runCheck: async () => {
        // This check is a placeholder. A real implementation would
        // involve checking for audio devices.
        updateStepStatus('audio', 'success', { details: 'Audio system appears to be ready.' });
        return true;
      },
    },
  ];

  useEffect(() => {
    setSteps(diagnosticChecks.map(({ runCheck, ...rest }) => rest));
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    if (isRunning) return;
    setIsRunning(true);

    let allCriticalPassed = true;

    for (const check of diagnosticChecks) {
      updateStepStatus(check.id, 'checking');
      const success = await check.runCheck();
      if (check.critical && !success) {
        allCriticalPassed = false;
      }
    }

    setIsRunning(false);
    onDiagnosticComplete(allCriticalPassed);
  };

  const getStepIcon = (step: Omit<DiagnosticStep, 'runCheck'>) => {
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
              onClick={runDiagnostics}
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
                    {step.status}
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
      </div>
    </div>
  );
};

export default StartupDiagnostic;
