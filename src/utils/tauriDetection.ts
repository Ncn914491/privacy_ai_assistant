import { core } from '@tauri-apps/api';

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
