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
  const [isProcessing, setIsProcessing] = useState(false);

  // MediaRecorder refs and state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
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
      // Clean up without calling handleStop to avoid recursion
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      // Stop MediaRecorder if it's recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Reset state
      setIsRecording(false);
      setRecordingState('idle');
      setTranscription('');
      setPartialTranscription('');
      setError(null);
      setRecordingTime(0);
      setAudioLevel(0);
      setIsProcessing(false);

      // Clear audio chunks
      audioChunksRef.current = [];

      // Notify parent component
      onRecordingStateChange?.(false);
    }
  }, [isOpen, onRecordingStateChange]);

  const handleStart = async () => {
    // Prevent multiple simultaneous start calls
    if (isRecording || recordingState !== 'idle') {
      console.log('⚠️ Recording already in progress or not in idle state:', recordingState);
      return;
    }

    try {
      setError(null);
      setRecordingState('starting');
      setTranscription('');
      setPartialTranscription('🎤 Initializing microphone...');

      console.log('🎤 Starting voice recording with MediaRecorder...');

      // Check if running in Tauri environment
      if (!TAURI_ENV.isTauri) {
        throw new Error('Voice recording is not available in browser mode. Please run the desktop application for voice features.');
      }

      // Request microphone access with specific constraints for speech recognition
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,        // 16kHz for speech recognition
          channelCount: 1,          // Mono
          echoCancellation: true,   // Reduce echo
          noiseSuppression: true,   // Reduce background noise
          autoGainControl: true     // Automatic gain control
        }
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder with the best available format for speech recognition
      let mediaRecorder: MediaRecorder;
      let mimeType: string;

      // Try different formats in order of preference for speech recognition
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        mimeType = 'audio/webm;codecs=pcm';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else {
        mimeType = ''; // Let browser choose
      }

      console.log('🎤 Using audio format:', mimeType || 'browser default');

      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorderRef.current = mediaRecorder;

      // Handle data available event
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('📊 Audio chunk received:', event.data.size, 'bytes');
        }
      };

      // Handle recording stop event
      mediaRecorder.onstop = async () => {
        console.log('⏹️ MediaRecorder stopped, processing audio...');
        await processRecordedAudio();
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms

      setIsRecording(true);
      setRecordingState('recording');
      setPartialTranscription('🎤 Recording... Speak now!');

      // Notify parent component
      onRecordingStateChange?.(true);

      // Auto-stop after 5 seconds
      recordingTimeoutRef.current = setTimeout(() => {
        handleStop();
      }, 5000);

      console.log('✅ Recording started successfully');

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setError(error instanceof Error ? error.message : 'Failed to start recording. Please check microphone permissions.');
      setRecordingState('error');
      setIsRecording(false);

      // Clean up on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const handleStop = async () => {
    // Prevent multiple calls and recursion
    if (!isRecording || !mediaRecorderRef.current) {
      console.log('⏹️ Stop called but not recording or no recorder');
      return;
    }

    try {
      console.log('⏹️ Stopping recording...');

      // Clear any pending timeout first
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }

      // Set stopping state immediately to prevent multiple calls
      setIsRecording(false);
      setRecordingState('stopping');
      setPartialTranscription('⏹️ Stopping recording...');

      // Notify parent component
      onRecordingStateChange?.(false);

      // Stop the MediaRecorder (this will trigger the onstop event)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      setError(error instanceof Error ? error.message : 'Failed to stop recording');
      setRecordingState('error');
      setIsRecording(false); // Ensure we're not stuck in recording state
    }
  };

  const processRecordedAudio = async () => {
    // Prevent multiple simultaneous processing calls
    if (isProcessing) {
      console.log('⚠️ Audio processing already in progress, skipping...');
      return;
    }

    try {
      setIsProcessing(true);
      setRecordingState('processing');
      setPartialTranscription('🔄 Processing recorded audio...');

      console.log('📊 Processing', audioChunksRef.current.length, 'audio chunks');

      if (audioChunksRef.current.length === 0) {
        throw new Error('No audio data recorded. Please try again.');
      }

      // Create blob from recorded chunks with the same MIME type used for recording
      const audioBlob = new Blob(audioChunksRef.current);
      console.log('📦 Created audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);

      if (audioBlob.size === 0) {
        throw new Error('Audio recording is empty. Please ensure your microphone is working and try again.');
      }

      // Convert blob to base64 for Tauri (handle large files safely)
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Convert to base64 safely without spreading large arrays
      let binaryString = '';
      const chunkSize = 8192; // Process in chunks to avoid stack overflow

      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }

      const base64Data = btoa(binaryString);

      console.log('🔄 Converting audio to base64 for backend processing...');
      setPartialTranscription('🎯 Running speech recognition...');

      // Call the STT backend with the audio data directly
      const result = await invoke<SttResult>('process_audio_data', {
        audioData: base64Data,
        mimeType: audioBlob.type || 'audio/webm'
      });

      console.log('🎯 STT result:', result);

      if (result.success && result.text && result.text.trim().length > 0) {
        setTranscription(result.text.trim());
        setPartialTranscription('');
        setRecordingState('complete');
        console.log('✅ Transcription completed:', result.text);
      } else {
        throw new Error(result.text || 'Speech recognition returned empty result. Please speak more clearly and try again.');
      }

    } catch (error) {
      console.error('❌ Audio processing error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process recorded audio');
      setPartialTranscription('');
      setRecordingState('error');
    } finally {
      // Clean up audio chunks and reset processing flag
      audioChunksRef.current = [];
      setIsProcessing(false);
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
