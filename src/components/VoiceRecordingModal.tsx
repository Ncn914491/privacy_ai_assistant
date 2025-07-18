import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Square, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { invoke } from '@tauri-apps/api/core';
import { TAURI_ENV } from '@/utils/tauriDetection';

interface VoiceRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptionComplete: (text: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

interface SttResult {
  text: string;
  confidence: number;
  success: boolean;
}

export const VoiceRecordingModal: React.FC<VoiceRecordingModalProps> = ({
  isOpen,
  onClose,
  onTranscriptionComplete,
  onRecordingStateChange
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [partialTranscription, setPartialTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingState, setRecordingState] = useState<'idle' | 'starting' | 'recording' | 'stopping' | 'processing' | 'complete' | 'error'>('idle');
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Recording timer and audio level simulation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let audioInterval: NodeJS.Timeout | null = null;

    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Simulate audio level changes for visual feedback
      audioInterval = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 100);
    } else {
      setRecordingTime(0);
      setAudioLevel(0);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (audioInterval) clearInterval(audioInterval);
    };
  }, [isRecording]);

  // Auto-close modal when not open
  useEffect(() => {
    if (!isOpen) {
      handleStop();
      setTranscription('');
      setPartialTranscription('');
      setError(null);
      setRecordingTime(0);
    }
  }, [isOpen]);

  const handleStart = async () => {
    try {
      setError(null);
      setRecordingState('starting');
      setTranscription('');
      setPartialTranscription('Initializing microphone...');

      // Simulate initialization delay
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsRecording(true);
      setRecordingState('recording');
      setPartialTranscription('🎤 Listening...');

      // Notify parent component
      onRecordingStateChange?.(true);

      console.log('Starting voice recording...');

      // Simulate real-time transcription updates with more realistic feedback
      const transcriptionTimer = setInterval(() => {
        if (isRecording) {
          setPartialTranscription(prev => {
            const messages = [
              '🎤 Listening...',
              '🎤 Detecting speech...',
              '🎤 Processing audio...',
              '🎤 Capturing voice...'
            ];
            const currentIndex = messages.indexOf(prev);
            return messages[(currentIndex + 1) % messages.length];
          });
        }
      }, 1500);

      // Auto-stop after 5 seconds (matching backend)
      recordingTimeoutRef.current = setTimeout(() => {
        clearInterval(transcriptionTimer);
        handleStop();
      }, 5000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      setError('Failed to start recording. Please check microphone permissions.');
      setRecordingState('error');
      setIsRecording(false);
    }
  };

  const handleStop = async () => {
    if (!isRecording) return;

    try {
      // Clear any pending timeout
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      setIsRecording(false);
      setRecordingState('stopping');
      setPartialTranscription('⏹️ Stopping recording...');

      // Notify parent component
      onRecordingStateChange?.(false);

      // Brief delay to show stopping state
      await new Promise(resolve => setTimeout(resolve, 300));

      setRecordingState('processing');
      setPartialTranscription('🔄 Processing speech...');

      // Check if running in Tauri environment
      if (!TAURI_ENV.isTauri) {
        throw new Error('Tauri environment not available. Please run the app in desktop mode.');
      }

      // Call the STT backend
      const result = await invoke<SttResult>('run_vosk_stt', { mic_on: true });

      if (result.success && result.text) {
        setTranscription(result.text);
        setPartialTranscription('');
        setRecordingState('complete');
        console.log('Transcription completed:', result.text);
      } else {
        throw new Error('Transcription failed or returned empty text');
      }

    } catch (error) {
      console.error('STT Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process speech');
      setPartialTranscription('');
      setRecordingState('error');
    }
  };

  const handleUse = () => {
    if (transcription.trim()) {
      onTranscriptionComplete(transcription.trim());
      onClose();
    }
  };

  const handleRetry = () => {
    setError(null);
    setTranscription('');
    setPartialTranscription('');
    setRecordingState('idle');
    setRecordingTime(0);
    setAudioLevel(0);
  };

  const handleClose = () => {
    // Clean up any ongoing operations
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    setIsRecording(false);
    onClose();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Voice Input
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close voice input modal"
            title="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Recording Status */}
        <div className="text-center mb-6">
          {/* Main Status Icon */}
          <div className="relative mb-4">
            <div className={cn(
              'inline-flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300',
              recordingState === 'recording'
                ? 'bg-red-500 text-white animate-pulse'
                : recordingState === 'processing'
                  ? 'bg-blue-500 text-white'
                  : recordingState === 'complete'
                    ? 'bg-green-500 text-white'
                    : recordingState === 'error'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
            )}>
              {recordingState === 'recording' ? (
                <Mic size={32} />
              ) : recordingState === 'processing' ? (
                <Loader2 size={32} className="animate-spin" />
              ) : recordingState === 'complete' ? (
                <CheckCircle size={32} />
              ) : recordingState === 'error' ? (
                <AlertCircle size={32} />
              ) : (
                <MicOff size={32} />
              )}
            </div>

            {/* Audio Level Indicator */}
            {isRecording && (
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                <div className="flex space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'w-1 bg-red-400 rounded-full transition-all duration-100',
                        audioLevel > (i * 20) ? 'h-4 opacity-100' : 'h-2 opacity-30'
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Status Text */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {recordingState === 'starting' ? (
              'Initializing microphone...'
            ) : recordingState === 'recording' ? (
              <>
                <div className="font-medium text-red-600 dark:text-red-400">
                  🔴 Recording • {formatTime(recordingTime)}
                </div>
                <div className="text-xs mt-1">Speak clearly into your microphone</div>
              </>
            ) : recordingState === 'stopping' ? (
              'Stopping recording...'
            ) : recordingState === 'processing' ? (
              <>
                <div className="font-medium text-blue-600 dark:text-blue-400">
                  Processing your speech...
                </div>
                <div className="text-xs mt-1">Please wait while we transcribe your audio</div>
              </>
            ) : recordingState === 'complete' ? (
              <>
                <div className="font-medium text-green-600 dark:text-green-400">
                  ✅ Transcription complete!
                </div>
                <div className="text-xs mt-1">Review your text below</div>
              </>
            ) : recordingState === 'error' ? (
              <>
                <div className="font-medium text-red-600 dark:text-red-400">
                  ❌ Recording failed
                </div>
                <div className="text-xs mt-1">Please try again</div>
              </>
            ) : (
              <>
                <div>Ready to record</div>
                <div className="text-xs mt-1">Click the microphone to start</div>
              </>
            )}
          </div>
        </div>

        {/* Live Transcription */}
        <div className="mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 min-h-[80px]">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Transcription:
            </div>
            <div className="text-gray-900 dark:text-gray-100">
              {error ? (
                <div className="text-red-500 text-sm">{error}</div>
              ) : transcription ? (
                <div className="font-medium">{transcription}</div>
              ) : partialTranscription ? (
                <div className="text-gray-500 italic">{partialTranscription}</div>
              ) : (
                <div className="text-gray-400 italic">Your speech will appear here...</div>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          {recordingState === 'idle' && (
            <button
              type="button"
              onClick={handleStart}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Mic size={18} />
              Start Recording
            </button>
          )}

          {(recordingState === 'recording' || recordingState === 'starting') && (
            <button
              type="button"
              onClick={handleStop}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Square size={18} />
              Stop Recording
            </button>
          )}

          {recordingState === 'complete' && transcription && (
            <>
              <button
                type="button"
                onClick={handleRetry}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleUse}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Use Text
              </button>
            </>
          )}

          {recordingState === 'error' && (
            <button
              type="button"
              onClick={handleRetry}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          )}
        </div>

        {/* Help Text */}
        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          Click "Start Recording" and speak clearly. Recording will automatically stop after 5 seconds.
        </div>
      </div>
    </div>
  );
};

export default VoiceRecordingModal;
