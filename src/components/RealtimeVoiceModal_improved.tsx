import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Square, AlertTriangle, RefreshCw, Settings, X } from 'lucide-react';
import { useRealtimeSTT } from '../hooks/useRealtimeSTT';
import { cn } from '../utils/cn';
import ConnectionStatusIndicator from './ConnectionStatusIndicator';
import DebugPanel from './DebugPanel';
import { usePythonBackendLLM } from '../hooks/usePythonBackendLLM';

interface RealtimeVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptionComplete: (text: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

const RealtimeVoiceModal: React.FC<RealtimeVoiceModalProps> = ({
  isOpen,
  onClose,
  onTranscriptionComplete,
  onRecordingStateChange
}) => {
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [hasAttemptedPermission, setHasAttemptedPermission] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showFinalTranscription, setShowFinalTranscription] = useState(false);
  
  const {
    isRecording,
    isConnected,
    partialText,
    finalText,
    error,
    micPermission,
    startRecording,
    stopRecording,
    requestMicPermission,
    disconnect,
    clearResults
  } = useRealtimeSTT();

  const {
    backendHealth,
    checkBackendHealth,
    startBackend
  } = usePythonBackendLLM();

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording]);

  // Notify parent of recording state changes
  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  // Handle final transcription
  useEffect(() => {
    if (finalText && finalText.trim()) {
      console.log('🎯 Final transcription ready:', finalText);
      setShowFinalTranscription(true);
      
      // Auto-submit after a short delay to show the final result
      const timer = setTimeout(() => {
        onTranscriptionComplete(finalText.trim());
        handleClose();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [finalText, onTranscriptionComplete]);

  // Auto-request permission when modal opens
  useEffect(() => {
    if (isOpen && micPermission === 'prompt' && !hasAttemptedPermission) {
      setHasAttemptedPermission(true);
      requestMicPermission();
    }
  }, [isOpen, micPermission, hasAttemptedPermission, requestMicPermission]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasAttemptedPermission(false);
      setShowFinalTranscription(false);
      clearResults();
    }
  }, [isOpen, clearResults]);

  const handleStartRecording = async () => {
    try {
      // Ensure backend is healthy before starting
      if (!backendHealth) {
        console.log('🚀 Starting backend before recording...');
        await startBackend();
        await checkBackendHealth();
      }
      
      await startRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = () => {
    stopRecording();
  };

  const handleClose = () => {
    if (isRecording) {
      stopRecording();
    }
    disconnect();
    onClose();
  };

  const handleRetryPermission = () => {
    setHasAttemptedPermission(false);
    requestMicPermission();
  };

  const handleSubmitTranscription = () => {
    if (finalText && finalText.trim()) {
      onTranscriptionComplete(finalText.trim());
      handleClose();
    }
  };

  const getConnectionStatus = () => {
    if (micPermission === 'unavailable') {
      return {
        status: 'error',
        message: 'Microphone is not available in this environment',
        canRetry: false
      };
    }

    if (micPermission === 'denied') {
      return {
        status: 'error',
        message: 'Microphone access has been denied. Please enable it in your browser settings.',
        canRetry: true
      };
    }

    if (micPermission === 'checking') {
      return {
        status: 'checking',
        message: 'Checking microphone permissions...',
        canRetry: false
      };
    }

    if (!backendHealth) {
      return {
        status: 'warning',
        message: 'Starting speech recognition backend...',
        canRetry: false
      };
    }

    if (!isConnected) {
      return {
        status: 'warning',
        message: 'Connecting to speech recognition service...',
        canRetry: false
      };
    }

    if (error) {
      return {
        status: 'error',
        message: error,
        canRetry: true
      };
    }

    return {
      status: 'ready',
      message: 'Ready for voice input',
      canRetry: false
    };
  };

  const connectionStatus = getConnectionStatus();
  const canRecord = micPermission === 'granted' && isConnected && backendHealth && !error;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Voice Input
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDebugPanel(true)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Open debug panel"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="p-4">
            <ConnectionStatusIndicator
              isConnected={isConnected}
              micPermission={micPermission}
              backendHealth={backendHealth}
              voskInitialized={true} // Assume initialized if backend is healthy
              showDetails={true}
            />
          </div>

          {/* Main Content */}
          <div className="p-6 space-y-6">
            {/* Connection Status Message */}
            <div className={cn(
              "p-4 rounded-lg border text-center",
              connectionStatus.status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
              connectionStatus.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' :
              connectionStatus.status === 'checking' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
              'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            )}>
              <div className="flex items-center justify-center gap-2 mb-2">
                {connectionStatus.status === 'error' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                {connectionStatus.status === 'checking' && <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />}
                <p className={cn(
                  "font-medium",
                  connectionStatus.status === 'error' ? 'text-red-700 dark:text-red-300' :
                  connectionStatus.status === 'warning' ? 'text-yellow-700 dark:text-yellow-300' :
                  connectionStatus.status === 'checking' ? 'text-blue-700 dark:text-blue-300' :
                  'text-green-700 dark:text-green-300'
                )}>
                  {connectionStatus.message}
                </p>
              </div>
              
              {connectionStatus.canRetry && (
                <button
                  onClick={handleRetryPermission}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Retry
                </button>
              )}
            </div>

            {/* Recording Controls */}
            <div className="text-center space-y-4">
              {isRecording && (
                <div className="text-2xl font-mono text-blue-600 dark:text-blue-400">
                  {formatTime(recordingTime)}
                </div>
              )}

              <button
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={!canRecord && !isRecording}
                className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200",
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                    : canRecord
                    ? "bg-blue-500 hover:bg-blue-600 text-white hover:scale-105"
                    : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                )}
              >
                {isRecording ? (
                  <Square className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isRecording ? 'Click to stop recording' : 'Click to start recording'}
              </p>
            </div>

            {/* Transcription Display */}
            {(partialText || finalText) && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Transcription:
                </h3>
                
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg min-h-[80px]">
                  {finalText ? (
                    <div className="space-y-2">
                      <p className="text-gray-900 dark:text-gray-100">
                        {finalText}
                      </p>
                      {showFinalTranscription && (
                        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          Final transcription ready
                        </div>
                      )}
                    </div>
                  ) : partialText ? (
                    <p className="text-gray-600 dark:text-gray-400 italic">
                      {partialText}
                    </p>
                  ) : (
                    <p className="text-gray-400 dark:text-gray-500 italic">
                      Transcription will appear here...
                    </p>
                  )}
                </div>

                {finalText && showFinalTranscription && (
                  <button
                    onClick={handleSubmitTranscription}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Use This Transcription
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      <DebugPanel
        isOpen={showDebugPanel}
        onClose={() => setShowDebugPanel(false)}
      />
    </>
  );
};

export default RealtimeVoiceModal;

