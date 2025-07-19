import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ChatInterface from './components/ChatInterface';
import BrowserModeBlocker from './components/BrowserModeBlocker';
import StartupDiagnostic from './components/StartupDiagnostic'; // Import the diagnostic component
import { useAppStore } from './stores/chatStore';
import { cn } from './utils/cn';
import './styles/globals.css';
import { SystemInfo, AppVersion } from './types';
import { ensureEnvironment, EnvironmentCapabilities, TAURI_ENV } from './utils/tauriDetection';

// Define application states
type AppState = 'initializing' | 'diagnostics' | 'ready' | 'browser_mode' | 'error';

const App: React.FC = () => {
  const { preferences, setSystemInfo, setAppVersion, setInitialized } = useAppStore();
  const [appState, setAppState] = useState<AppState>('initializing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing application...');

        // First try synchronous detection
        console.log('🔍 Checking synchronous Tauri detection...');
        let env = TAURI_ENV;

        // If synchronous detection suggests we're in Tauri, try async confirmation
        if (env.isTauri) {
          console.log('✅ Synchronous detection found Tauri environment, confirming...');
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
            console.warn('⚠️ Async detection failed, using synchronous result:', error);
          }
        }

        if (env.isBrowser) {
          console.warn('🌐 Running in browser mode.');
          setAppState('browser_mode');
          return;
        }

        if (!env.hasInvoke) {
          console.warn('⚠️ Tauri environment detected, but invoke is not ready yet. Proceeding with diagnostics...');
          // Don't error out immediately, let diagnostics handle it
        }

        console.log('✅ Tauri environment confirmed. Running diagnostics...');
        setAppState('diagnostics');

        // Fetch initial data from backend
        const systemInfo = await invoke<SystemInfo>('get_system_info');
        setSystemInfo(systemInfo);

        const appVersion = await invoke<AppVersion>('get_app_version');
        setAppVersion(appVersion);

        await invoke('log_message', { message: 'App environment initialized.' });
        
      } catch (err) {
        console.error('🚨 Failed to initialize app:', err);
        setError(err instanceof Error ? err.message : String(err));
        setAppState('error');
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
        return <div className="loading-screen"><h2>Initializing...</h2></div>;
      
      case 'diagnostics':
        return (
          <StartupDiagnostic
            onDiagnosticComplete={handleDiagnosticComplete}
          />
        );

      case 'ready':
        return <ChatInterface />;

      case 'browser_mode':
        return <BrowserModeBlocker onIgnoreWarning={() => setAppState('ready')} />;

      case 'error':
        return <div className="error-screen"><h2>Error: {error}</h2></div>;

      default:
        return <div className="error-screen"><h2>Invalid State</h2></div>;
    }
  };

  return (
    <div className={cn(
      'h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100',
      'transition-colors duration-300'
    )}>
      <main className="h-full">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
