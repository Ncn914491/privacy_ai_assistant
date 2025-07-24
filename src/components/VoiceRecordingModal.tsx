import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Square, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';
// import { invoke } from '@tauri-apps/api/core'; // Not used anymore
import { TAURI_ENV } from '../utils/tauriDetection';

interface VoiceRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptionComplete: (text: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

// SttResult interface removed - using backend API response format

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
  // Removed isProcessing - now using Vosk directly

  // MediaRecorder refs and state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mimeTypeRef = useRef<string>('webm');

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
      // Removed setIsProcessing - now using Vosk directly

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

      // ✅ FIX 4: Enhanced microphone access with better error handling
      console.log('🎤 Requesting microphone access...');

      // Check microphone permission first
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          console.log('🎤 Microphone permission status:', permission.state);

          if (permission.state === 'denied') {
            throw new Error('Microphone access denied. Please enable microphone permissions in your browser settings.');
          }
        } catch (permError) {
          console.warn('⚠️ Could not check microphone permissions:', permError);
        }
      }

      // Request microphone access with optimized constraints for Vosk STT
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000, min: 8000, max: 48000 },  // Prefer 16kHz but be flexible
          channelCount: 1,          // Mono for Vosk compatibility
          echoCancellation: true,   // Reduce echo for better recognition
          noiseSuppression: true,   // Reduce background noise
          autoGainControl: true     // Automatic gain control
        }
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder with the best available format for speech recognition
      let mediaRecorder: MediaRecorder;
      let mimeType: string = '';
      let recordingOptions: MediaRecorderOptions = {};

      // Try different formats in order of preference for Vosk compatibility
      const preferredFormats = [
        'audio/wav',
        'audio/webm;codecs=pcm',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];

      for (const format of preferredFormats) {
        if (MediaRecorder.isTypeSupported(format)) {
          mimeType = format;
          recordingOptions.mimeType = format;
          break;
        }
      }

      // Set audio bitrate for better quality
      if (mimeType) {
        recordingOptions.audioBitsPerSecond = 128000; // 128 kbps for good quality
      }

      console.log('🎤 Using audio format:', mimeType || 'browser default', 'with options:', recordingOptions);

      try {
        mediaRecorder = new MediaRecorder(stream, recordingOptions);
      } catch (error) {
        console.warn('⚠️ Failed to create MediaRecorder with preferred options, using defaults:', error);
        mediaRecorder = new MediaRecorder(stream);
        mimeType = 'browser-default';
      }

      // Store mimeType for later use
      mimeTypeRef.current = mimeType;

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
        console.log('⏹️ MediaRecorder stopped, using Vosk for transcription...');
        await processWithVosk();
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

  // 🎤 Process with Vosk STT
  const processWithVosk = async () => {
    try {
      console.log('🎤 Starting Vosk transcription...');
      setRecordingState('processing');
      setPartialTranscription('🔄 Processing with Vosk...');

      // Check if we have audio chunks
      if (audioChunksRef.current.length === 0) {
        throw new Error('No audio data recorded');
      }

      // Create blob from audio chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      console.log('📊 Audio blob size:', audioBlob.size, 'bytes');

      if (audioBlob.size === 0) {
        throw new Error('Audio recording is empty');
      }

      // Convert blob to base64 for backend transmission (handle large files safely)
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Convert to base64 in smaller chunks to avoid stack overflow
      let base64Audio = '';
      const chunkSize = 1024; // Process in 1KB chunks to avoid stack overflow

      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        // Use a safer method to convert to string
        let binaryString = '';
        for (let j = 0; j < chunk.length; j++) {
          binaryString += String.fromCharCode(chunk[j]);
        }
        base64Audio += btoa(binaryString);
      }

      console.log('📤 Sending audio to backend for transcription...');

      // Send to backend STT endpoint with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch('http://127.0.0.1:8000/stt/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audio_data: base64Audio,
            format: mimeTypeRef.current || 'webm',
            sample_rate: 16000,
            channels: 1
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Backend error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        console.log('📝 Backend STT result:', result);

        if (result.success && result.text && result.text.trim().length > 0) {
          console.log('✅ Transcription successful:', result.text);
          setTranscription(result.text);
          setRecordingState('complete');
          setPartialTranscription('');

          // ✅ FIX 3: Ensure transcribed text reaches LLM
          console.log('🎤 [VOICE PIPELINE] Sending transcription to parent:', result.text.trim());
          onTranscriptionComplete?.(result.text.trim());
        } else {
          console.warn('⚠️ Transcription failed or empty');
          const errorMsg = result.error || 'No speech detected. Please try again.';
          setError(errorMsg);
          setRecordingState('error');
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out. Please try again with a shorter recording.');
        } else {
          throw fetchError;
        }
      }

    } catch (error) {
      console.error('❌ Transcription error:', error);
      let errorMessage = 'Unknown error occurred during transcription';

      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          errorMessage = 'Failed to connect to transcription service. Please ensure the backend is running.';
        } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
          errorMessage = 'Transcription request timed out. Please try with a shorter recording.';
        } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection and ensure the backend is running on port 8000.';
        } else {
          errorMessage = error.message;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      setError(`Transcription failed: ${errorMessage}`);
      setRecordingState('error');
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

  // Removed processRecordedAudio - now using Vosk directly

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
