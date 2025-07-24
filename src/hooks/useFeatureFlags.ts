import { useState, useEffect } from 'react';

export interface FeatureFlags {
  voiceFeatures: boolean;
  audioFeatures: boolean;
  microphoneAccess: boolean;
  realtimeVoice: boolean;
  voiceRecording: boolean;
  audioDiagnostics: boolean;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  voiceFeatures: false,        // Master toggle for all voice features
  audioFeatures: false,        // Audio-related features
  microphoneAccess: false,     // Microphone permissions and access
  realtimeVoice: false,        // Real-time voice conversation
  voiceRecording: false,       // Voice recording functionality
  audioDiagnostics: false,     // Audio diagnostic panels
};

/**
 * Feature flags hook for managing feature visibility
 * Voice features are currently disabled due to stability issues
 */
export const useFeatureFlags = () => {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);

  useEffect(() => {
    // Load feature flags from localStorage or environment variables
    const savedFlags = localStorage.getItem('featureFlags');
    if (savedFlags) {
      try {
        const parsedFlags = JSON.parse(savedFlags);
        setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, ...parsedFlags });
      } catch (error) {
        console.warn('Failed to parse saved feature flags:', error);
        setFeatureFlags(DEFAULT_FEATURE_FLAGS);
      }
    }

    // Check environment variables for feature flags (safely)
    const envFlags: Partial<FeatureFlags> = {};

    try {
      if (import.meta.env.VITE_ENABLE_VOICE_FEATURES === 'true') {
        envFlags.voiceFeatures = true;
      }

      if (import.meta.env.VITE_ENABLE_AUDIO_FEATURES === 'true') {
        envFlags.audioFeatures = true;
      }

      if (Object.keys(envFlags).length > 0) {
        setFeatureFlags(prev => ({ ...prev, ...envFlags }));
      }
    } catch (error) {
      // Environment variables not available, use defaults
      console.log('Environment variables not available, using default feature flags');
    }
  }, []);

  const updateFeatureFlag = (flag: keyof FeatureFlags, enabled: boolean) => {
    const updatedFlags = { ...featureFlags, [flag]: enabled };
    setFeatureFlags(updatedFlags);
    localStorage.setItem('featureFlags', JSON.stringify(updatedFlags));
  };

  const enableAllVoiceFeatures = () => {
    const voiceEnabledFlags: FeatureFlags = {
      voiceFeatures: true,
      audioFeatures: true,
      microphoneAccess: true,
      realtimeVoice: true,
      voiceRecording: true,
      audioDiagnostics: true,
    };
    setFeatureFlags(voiceEnabledFlags);
    localStorage.setItem('featureFlags', JSON.stringify(voiceEnabledFlags));
  };

  const disableAllVoiceFeatures = () => {
    setFeatureFlags(DEFAULT_FEATURE_FLAGS);
    localStorage.setItem('featureFlags', JSON.stringify(DEFAULT_FEATURE_FLAGS));
  };

  const isVoiceEnabled = featureFlags.voiceFeatures;
  const isAudioEnabled = featureFlags.audioFeatures;

  return {
    featureFlags,
    updateFeatureFlag,
    enableAllVoiceFeatures,
    disableAllVoiceFeatures,
    isVoiceEnabled,
    isAudioEnabled,
  };
};

export default useFeatureFlags;
