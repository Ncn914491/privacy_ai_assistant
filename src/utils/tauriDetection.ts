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
  // Check if we're in a browser environment first
  if (typeof window === 'undefined') {
    return {
      isTauri: false,
      isDesktop: false,
      isBrowser: false,
      capabilities: {
        invoke: false,
        fileSystem: false,
        shell: false,
        notifications: false,
      }
    };
  }

  // Primary check: Does window.__TAURI__ exist?
  const isTauri = !!(window.__TAURI__);

  // In Tauri, we're always in desktop mode (even in dev with localhost)
  // The presence of __TAURI__ is the definitive indicator
  const isDesktop = isTauri;
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

export async function waitForTauriEnvironment(maxWaitMs: number = 5000): Promise<TauriEnvironment> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const env = detectTauriEnvironment();

    if (env.isTauri && env.capabilities.invoke) {
      console.log('✅ Tauri environment ready after', Date.now() - startTime, 'ms');
      return env;
    }

    // Wait 100ms before retrying
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const finalEnv = detectTauriEnvironment();
  console.warn('⚠️ Tauri environment check timed out after', maxWaitMs, 'ms. Final state:', finalEnv);
  return finalEnv;
}

export function getTauriStatus(): {
  status: 'connected' | 'browser' | 'limited';
  message: string;
  recommendations: string[];
  debug?: any;
} {
  const env = detectTauriEnvironment();

  // Add debug information
  const debug = {
    windowExists: typeof window !== 'undefined',
    tauriExists: !!(typeof window !== 'undefined' && window.__TAURI__),
    invokeExists: !!(typeof window !== 'undefined' && window.__TAURI__?.invoke),
    location: typeof window !== 'undefined' ? window.location.href : 'N/A',
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'N/A'
  };

  if (env.isBrowser) {
    return {
      status: 'browser',
      message: 'Running in browser mode - Desktop features unavailable',
      recommendations: [
        'Close this browser tab',
        'Run "npm run tauri dev" in your terminal',
        'Ensure Tauri app window is focused'
      ],
      debug
    };
  }

  if (!env.capabilities.invoke) {
    return {
      status: 'limited',
      message: 'Tauri detected but invoke capability missing',
      recommendations: [
        'Restart the application',
        'Check if Tauri is properly initialized',
        'Verify Tauri version compatibility'
      ],
      debug
    };
  }

  return {
    status: 'connected',
    message: 'Desktop environment ready',
    recommendations: [],
    debug
  };
}

// Auto-detection on module load with retry mechanism
let _tauriEnv: TauriEnvironment | null = null;

export const TAURI_ENV = new Proxy({} as TauriEnvironment, {
  get(_target, prop) {
    if (!_tauriEnv) {
      _tauriEnv = detectTauriEnvironment();
    }
    return _tauriEnv[prop as keyof TauriEnvironment];
  }
});

// Initialize immediately
_tauriEnv = detectTauriEnvironment();

// Log environment status with detailed debugging
if (typeof window !== 'undefined') {
  const status = getTauriStatus();

  console.group('🔍 Tauri Environment Detection');
  console.log('Environment:', TAURI_ENV);
  console.log('Status:', status);
  console.log('Debug Info:', status.debug);
  console.groupEnd();

  if (TAURI_ENV.isBrowser) {
    console.error('❌ Browser mode detected - Desktop features will be unavailable');
    console.log('💡 Recommendations:', status.recommendations);
  } else {
    console.log('✅ Desktop mode detected - All features available');
  }
}
