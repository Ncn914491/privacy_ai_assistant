// Tauri Environment Detection and Browser Mode Blocker
export interface TauriEnvironment {
  isTauri: boolean;
  isDesktop: boolean;
  isBrowser: boolean;
  tauriVersion?: string;
  capabilities: {
    invoke: boolean;
    fileSystem: boolean;
    shell: boolean;
    notifications: boolean;
  };
}

declare global {
  interface Window {
    __TAURI__?: {
      invoke: (cmd: string, args?: any) => Promise<any>;
      tauri: {
        version: string;
      };
    };
  }
}

export function detectTauriEnvironment(): TauriEnvironment {
  const isTauri = !!(typeof window !== 'undefined' && window.__TAURI__);
  const isDesktop = isTauri && !window.location.href.includes('localhost');
  const isBrowser = !isTauri;

  return {
    isTauri,
    isDesktop,
    isBrowser,
    tauriVersion: isTauri ? window.__TAURI__?.tauri?.version : undefined,
    capabilities: {
      invoke: isTauri && typeof window.__TAURI__?.invoke === 'function',
      fileSystem: isTauri,
      shell: isTauri,
      notifications: isTauri,
    }
  };
}

export function requireTauriEnvironment(): void {
  const env = detectTauriEnvironment();
  
  if (!env.isTauri) {
    console.error('❌ Application requires Tauri desktop environment');
    throw new Error('This application must run in Tauri desktop mode. Please use "npm run dev" or "tauri dev" instead of opening in browser.');
  }
  
  if (!env.capabilities.invoke) {
    console.error('❌ Tauri invoke capability not available');
    throw new Error('Tauri invoke API is not available. Please ensure you are running the latest version.');
  }
  
  console.log('✅ Tauri environment detected:', env);
}

export function getTauriStatus(): {
  status: 'connected' | 'browser' | 'limited';
  message: string;
  recommendations: string[];
} {
  const env = detectTauriEnvironment();
  
  if (env.isBrowser) {
    return {
      status: 'browser',
      message: 'Running in browser mode - Desktop features unavailable',
      recommendations: [
        'Close this browser tab',
        'Run "npm run dev" in your terminal',
        'Or run "tauri dev" to launch the desktop app'
      ]
    };
  }
  
  if (!env.capabilities.invoke) {
    return {
      status: 'limited',
      message: 'Tauri detected but capabilities limited',
      recommendations: [
        'Restart the application',
        'Ensure you are running the latest Tauri version',
        'Check console for additional errors'
      ]
    };
  }
  
  return {
    status: 'connected',
    message: 'Desktop environment ready',
    recommendations: []
  };
}

// Auto-detection on module load
export const TAURI_ENV = detectTauriEnvironment();

// Log environment status
if (typeof window !== 'undefined') {
  console.log('🔍 Tauri Environment Detection:', TAURI_ENV);
  
  if (TAURI_ENV.isBrowser) {
    console.warn('⚠️  Browser mode detected - Desktop features will be unavailable');
  } else {
    console.log('✅ Desktop mode detected - All features available');
  }
}
