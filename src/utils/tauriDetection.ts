import { core } from '@tauri-apps/api';

// Extend Window interface to include Tauri properties
declare global {
  interface Window {
    __TAURI__?: any;
    __TAURI_INTERNALS__?: any;
    __TAURI_INVOKE__?: any;
  }
}

/**
 * Represents the detected capabilities of the application environment.
 */
export interface EnvironmentCapabilities {
  isTauri: boolean; // True if running in a Tauri desktop environment
  isBrowser: boolean; // True if running in a standard web browser
  hasInvoke: boolean; // True if the Tauri `invoke` API is available
}

// A promise that resolves with the environment capabilities once detection is complete.
let environmentPromise: Promise<EnvironmentCapabilities> | null = null;

/**
 * Asynchronously detects the environment (Tauri or Browser) with a timeout.
 * This function waits for the `__TAURI__` object to be available on the `window` object.
 *
 * @param {number} timeout - The maximum time to wait for the Tauri environment in milliseconds.
 * @returns {Promise<EnvironmentCapabilities>} A promise that resolves to the environment capabilities.
 */
async function detectEnvironment(timeout = 2000): Promise<EnvironmentCapabilities> {
  // Check if running in a non-browser context (e.g., server-side rendering)
  if (typeof window === 'undefined') {
    return { isTauri: false, isBrowser: false, hasInvoke: false };
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const checkTauri = () => {
      if (window.__TAURI__) {
        console.log(`✅ Tauri environment detected after ${Date.now() - startTime}ms.`);
        resolve({
          isTauri: true,
          isBrowser: false,
          hasInvoke: typeof core.invoke === 'function',
        });
      } else if (Date.now() - startTime > timeout) {
        console.warn(`⚠️ Timed out waiting for Tauri environment. Assuming browser mode.`);
        resolve({ isTauri: false, isBrowser: true, hasInvoke: false });
      } else {
        setTimeout(checkTauri, 50); // Retry after a short delay
      }
    };

    checkTauri();
  });
}

/**
 * Ensures that the environment is detected, reusing the result if already available.
 * This function should be called by any part of the app that needs to know the environment.
 *
 * @returns {Promise<EnvironmentCapabilities>} A promise that resolves to the environment capabilities.
 */
export function ensureEnvironment(): Promise<EnvironmentCapabilities> {
  if (!environmentPromise) {
    environmentPromise = detectEnvironment();
  }
  return environmentPromise;
}

/**
 * A simple hook to get the environment capabilities.
 * It is recommended to use this in components that need to adapt to the environment.
 *
 * Example:
 * ```
 * const { isTauri, isBrowser } = useEnvironment();
 * if (isTauri) {
 *   // Render Tauri-specific components
 * }
 * ```
 */
export const useEnvironment = (): EnvironmentCapabilities => {
  const [env, setEnv] = React.useState<EnvironmentCapabilities>({
    isTauri: false,
    isBrowser: true,
    hasInvoke: false,
  });

  React.useEffect(() => {
    ensureEnvironment().then(setEnv);
  }, []);

  return env;
};

// Import React dynamically for the hook
let React: typeof import('react');
try {
  React = require('react');
} catch (e) {
  // React is not available, hook will not be used
}

/**
 * Synchronous environment detection for immediate use.
 * This provides a best-effort detection without waiting for async initialization.
 * For more reliable detection, use ensureEnvironment() or useEnvironment().
 */
export const TAURI_ENV: EnvironmentCapabilities = (() => {
  // Check if running in a non-browser context
  if (typeof window === 'undefined') {
    return { isTauri: false, isBrowser: false, hasInvoke: false };
  }

  // Basic synchronous checks
  const hasTauriGlobal = !!window.__TAURI__;
  const isTauriProtocol = window.location.protocol === 'tauri:';
  const hasTauriUserAgent = navigator.userAgent.includes('Tauri') || navigator.userAgent.includes('wry');
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isDevPort = window.location.port === '5173'; // Vite dev server port

  // Check for Tauri-specific window properties that indicate we're in the desktop app
  const hasTauriWindow = !!(window as any).__TAURI_INTERNALS__;
  const hasTauriAPI = !!(window as any).__TAURI_INVOKE__;

  // Enhanced detection for development environment
  // In Tauri dev mode, we're running on localhost:5173 but with Tauri APIs available
  const isDevelopmentTauri = isLocalhost && isDevPort && (hasTauriGlobal || hasTauriUserAgent || hasTauriWindow || hasTauriAPI);

  // More aggressive detection - if we're on localhost:5173, assume Tauri dev mode
  // This is because the user is explicitly running tauri:dev
  const isLikelyTauriDev = isLocalhost && isDevPort;

  // Determine if we're likely in Tauri
  const isTauri = hasTauriGlobal || isTauriProtocol || isDevelopmentTauri || isLikelyTauriDev;

  console.log('🔍 Tauri Detection:', {
    hasTauriGlobal,
    isTauriProtocol,
    hasTauriUserAgent,
    hasTauriWindow,
    hasTauriAPI,
    isLocalhost,
    isDevPort,
    isDevelopmentTauri,
    isLikelyTauriDev,
    finalIsTauri: isTauri,
    userAgent: navigator.userAgent,
    location: window.location.href,
  });

  return {
    isTauri,
    isBrowser: !isTauri,
    hasInvoke: hasTauriGlobal && typeof core.invoke === 'function',
  };
})();

/**
 * Interface for Tauri connection status
 */
export interface TauriStatus {
  status: 'connected' | 'disconnected' | 'checking';
  message?: string;
  capabilities?: EnvironmentCapabilities;
  recommendations?: string[];
}

/**
 * Get the current Tauri connection status synchronously
 */
export function getTauriStatus(): TauriStatus {
  const capabilities = TAURI_ENV;

  if (capabilities.isTauri && capabilities.hasInvoke) {
    return {
      status: 'connected',
      message: 'Tauri environment is ready',
      capabilities,
      recommendations: [],
    };
  } else if (capabilities.isTauri && !capabilities.hasInvoke) {
    return {
      status: 'checking',
      message: 'Tauri detected but invoke API not ready',
      capabilities,
      recommendations: [
        'Wait a moment for Tauri to fully initialize',
        'Refresh the application if the issue persists',
      ],
    };
  } else {
    return {
      status: 'disconnected',
      message: 'Running in browser mode',
      capabilities,
      recommendations: [
        'Close this browser tab',
        'Run the desktop application using: npm run tauri:dev',
        'Make sure the Tauri development server is running',
        'Check that no firewall is blocking the application',
      ],
    };
  }
}
