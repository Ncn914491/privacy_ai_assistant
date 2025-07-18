import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ChatInterface from './components/ChatInterface';
import Sidebar from './components/Sidebar';
import { useAppStore } from './stores/chatStore';
import { cn } from './utils/cn';
import './styles/globals.css';
import { SystemInfo, AppVersion } from './types';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The application encountered an error. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const { preferences, setSystemInfo, setAppVersion, setInitialized } = useAppStore();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Get system info
        const systemInfo = await invoke<SystemInfo>('get_system_info');
        setSystemInfo(systemInfo);

        // Get app version
        const appVersion = await invoke<AppVersion>('get_app_version');
        setAppVersion(appVersion);

        setInitialized(true);
        
        // Log initialization
        await invoke('log_message', { message: 'App initialized successfully' });
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, [setSystemInfo, setAppVersion, setInitialized]);

  useEffect(() => {
    // Apply theme to HTML element
    const root = document.documentElement;
    
    if (preferences.theme === 'dark') {
      root.classList.add('dark');
    } else if (preferences.theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System theme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [preferences.theme]);

  useEffect(() => {
    // Handle keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+/ to focus input
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        const textarea = document.querySelector('textarea');
        if (textarea) {
          textarea.focus();
        }
      }
      
      // Escape to clear input
      if (e.key === 'Escape') {
        const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
        if (textarea && textarea === document.activeElement) {
          textarea.blur();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ErrorBoundary>
      <div className={cn(
        'h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100',
        'transition-colors duration-300'
      )}>
        <Sidebar />
        <main className="h-full">
          <ChatInterface />
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
