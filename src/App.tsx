import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ChatInterface from './components/ChatInterface';
import BrowserModeBlocker from './components/BrowserModeBlocker';
import StartupDiagnostic from './components/StartupDiagnostic'; // Import the diagnostic component
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import { AppInitializingLoader } from './components/LoadingStates';
import { FullScreenError } from './components/ErrorStates';
import { useAppStore } from './stores/chatStore';
import { cn } from './utils/cn';
import './styles/globals.css';
import { SystemInfo, AppVersion } from './types';
import { ensureEnvironment, EnvironmentCapabilities, TAURI_ENV } from './utils/tauriDetection';
import { appLogger, tauriLogger } from './utils/logger';

// Define application states
type AppState = 'initializing' | 'diagnostics' | 'ready' | 'browser_mode' | 'error';

const App: React.FC = () => {
  const { preferences, setSystemInfo, setAppVersion, setInitialized } = useAppStore();
  const [appState, setAppState] = useState<AppState>('initializing');
  const [error, setError] = useState<string | null>(null);

  // Enhanced error handling
  const handleError = (error: Error, context: string) => {
    appLogger.error(`Error in ${context}`, error);
    setError(`${context}: ${error.message}`);
    setAppState('error');
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        appLogger.info('Initializing application...');

        // First try synchronous detection
        appLogger.debug('Checking synchronous Tauri detection...');
        let env = TAURI_ENV;

        // If synchronous detection suggests we're in Tauri, try async confirmation
        if (env.isTauri) {
          tauriLogger.info('Synchronous detection found Tauri environment, confirming...');
          try {
            // Try async detection with shorter timeout
            const asyncEnv = await Promise.race([
              ensureEnvironment(),
              new Promise<EnvironmentCapabilities>((resolve) =>
                setTimeout(() => resolve(env), 1000) // 1 second timeout
              )
            ]);
            env = asyncEnv;
          } catch (error) {
            tauriLogger.warn('Async detection failed, using synchronous result', error);
          }
        }

        if (env.isBrowser) {
          appLogger.warn('Running in browser mode.');
          setAppState('browser_mode');
          return;
        }

        if (!env.hasInvoke) {
          tauriLogger.warn('Tauri environment detected, but invoke is not ready yet. Proceeding with diagnostics...');
          // Don't error out immediately, let diagnostics handle it
        }

        tauriLogger.info('Tauri environment confirmed. Running diagnostics...');
        setAppState('diagnostics');

        // Fetch initial data from backend
        const systemInfo = await invoke<SystemInfo>('get_system_info');
        setSystemInfo(systemInfo);

        const appVersion = await invoke<AppVersion>('get_app_version');
        setAppVersion(appVersion);

        await invoke('log_message', { message: 'App environment initialized.' });
        
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        handleError(error, 'App Initialization');
      }
    };

    initializeApp();
  }, [setSystemInfo, setAppVersion]);

  useEffect(() => {
    // Apply theme based on user preferences
    const root = document.documentElement;
    if (preferences.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [preferences.theme]);

  const handleDiagnosticComplete = (success: boolean) => {
    if (success) {
      console.log('✅ Diagnostics passed. Application is ready.');
      setInitialized(true);
      setAppState('ready');
    } else {
      console.warn('⚠️ Diagnostics failed. App will have limited functionality.');
      // You might want to keep the user on the diagnostics screen
      // or move to a limited 'ready' state. For now, we proceed.
      setInitialized(true);
      setAppState('ready');
    }
  };

  const renderContent = () => {
    switch (appState) {
      case 'initializing':
        return <AppInitializingLoader />;

      case 'diagnostics':
        return (
          <StartupDiagnostic
            onDiagnosticComplete={handleDiagnosticComplete}
          />
        );

      case 'ready':
        return (
          <>
            <Sidebar />
            <div className="lg:ml-80">
              <ChatInterface />
            </div>
          </>
        );

      case 'browser_mode':
        return <BrowserModeBlocker onIgnoreWarning={() => setAppState('ready')} />;

      case 'error':
        return (
          <FullScreenError
            title="Application Error"
            message={error || 'An unexpected error occurred'}
            onRetry={() => {
              setError(null);
              setAppState('initializing');
            }}
          />
        );

      default:
        return (
          <FullScreenError
            title="Invalid Application State"
            message="The application is in an unknown state. Please reload the app."
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className={cn(
        'h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100',
        'transition-colors duration-300'
      )}>
        <main className="h-full">
          {renderContent()}
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
