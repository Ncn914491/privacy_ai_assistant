/**
 * Microphone Permission Utility
 * Handles microphone permissions with proper error handling and Tauri compatibility
 */

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'checking' | 'unavailable';

export interface MicPermissionResult {
  state: MicPermissionState;
  error?: string;
  stream?: MediaStream;
}

export interface AudioConstraints {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export const DEFAULT_AUDIO_CONSTRAINTS: AudioConstraints = {
  sampleRate: 16000,
  channelCount: 1,
  echoCancellation: false,  // Disabled for better Vosk compatibility
  noiseSuppression: false,  // Disabled for better Vosk compatibility
  autoGainControl: false    // Disabled for better Vosk compatibility
};

/**
 * Check if the browser supports getUserMedia
 */
export const isGetUserMediaSupported = (): boolean => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

/**
 * Check current microphone permission state without requesting access
 */
export const checkMicrophonePermission = async (): Promise<MicPermissionState> => {
  if (!isGetUserMediaSupported()) {
    return 'unavailable';
  }

  try {
    // Use the Permissions API if available
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      switch (permission.state) {
        case 'granted':
          return 'granted';
        case 'denied':
          return 'denied';
        case 'prompt':
        default:
          return 'prompt';
      }
    }
    
    // Fallback: assume prompt state if Permissions API is not available
    return 'prompt';
  } catch (error) {
    console.warn('⚠️ Could not check microphone permission:', error);
    return 'prompt';
  }
};

/**
 * Request microphone permission and return the result
 */
export const requestMicrophonePermission = async (
  constraints: Partial<AudioConstraints> = {}
): Promise<MicPermissionResult> => {
  if (!isGetUserMediaSupported()) {
    return {
      state: 'unavailable',
      error: 'getUserMedia is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'
    };
  }

  const audioConstraints = { ...DEFAULT_AUDIO_CONSTRAINTS, ...constraints };

  try {
    console.log('🎤 Requesting microphone permission with constraints:', audioConstraints);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });

    console.log('✅ Microphone permission granted');
    
    return {
      state: 'granted',
      stream
    };
  } catch (error: any) {
    console.error('❌ Microphone permission error:', error);

    let errorMessage = 'Microphone access denied. ';
    let state: MicPermissionState = 'denied';

    switch (error.name) {
      case 'NotAllowedError':
        errorMessage += 'Please click "Allow" when prompted for microphone access, or enable microphone permissions in your browser settings.';
        state = 'denied';
        break;
      case 'NotFoundError':
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
        state = 'unavailable';
        break;
      case 'NotReadableError':
        errorMessage += 'Microphone is already in use by another application. Please close other applications using the microphone and try again.';
        state = 'denied';
        break;
      case 'OverconstrainedError':
        errorMessage += 'Microphone does not support the required audio settings. Try using different audio constraints.';
        state = 'denied';
        break;
      case 'SecurityError':
        errorMessage += 'Microphone access blocked due to security restrictions. Please ensure you are using HTTPS or localhost.';
        state = 'denied';
        break;
      case 'AbortError':
        errorMessage += 'Microphone access request was aborted.';
        state = 'denied';
        break;
      default:
        errorMessage += `Unexpected error: ${error.message}`;
        state = 'denied';
        break;
    }

    return {
      state,
      error: errorMessage
    };
  }
};

/**
 * Test microphone access without keeping the stream open
 */
export const testMicrophoneAccess = async (
  constraints: Partial<AudioConstraints> = {}
): Promise<MicPermissionResult> => {
  const result = await requestMicrophonePermission(constraints);
  
  // Close the stream immediately if we got one
  if (result.stream) {
    result.stream.getTracks().forEach(track => track.stop());
    // Remove the stream from the result since we closed it
    const { stream, ...resultWithoutStream } = result;
    return resultWithoutStream;
  }
  
  return result;
};

/**
 * Get detailed microphone information
 */
export const getMicrophoneDevices = async (): Promise<MediaDeviceInfo[]> => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  } catch (error) {
    console.error('❌ Failed to enumerate microphone devices:', error);
    return [];
  }
};

/**
 * Create a user-friendly permission status message
 */
export const getPermissionStatusMessage = (state: MicPermissionState, error?: string): string => {
  switch (state) {
    case 'granted':
      return 'Microphone access granted';
    case 'denied':
      return error || 'Microphone access denied';
    case 'prompt':
      return 'Microphone permission needed - click to request access';
    case 'checking':
      return 'Checking microphone permission...';
    case 'unavailable':
      return error || 'Microphone not available in this browser';
    default:
      return 'Unknown microphone permission state';
  }
};

/**
 * Check if we're running in a secure context (required for getUserMedia)
 */
export const isSecureContext = (): boolean => {
  return window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
};

/**
 * Get platform-specific permission instructions
 */
export const getPlatformPermissionInstructions = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('chrome')) {
    return 'In Chrome: Click the microphone icon in the address bar, or go to Settings > Privacy and security > Site Settings > Microphone.';
  } else if (userAgent.includes('firefox')) {
    return 'In Firefox: Click the microphone icon in the address bar, or go to Preferences > Privacy & Security > Permissions > Microphone.';
  } else if (userAgent.includes('safari')) {
    return 'In Safari: Go to Safari > Preferences > Websites > Microphone, or check the address bar for permission icons.';
  } else if (userAgent.includes('edge')) {
    return 'In Edge: Click the microphone icon in the address bar, or go to Settings > Site permissions > Microphone.';
  }
  
  return 'Please check your browser settings to enable microphone access for this site.';
};

