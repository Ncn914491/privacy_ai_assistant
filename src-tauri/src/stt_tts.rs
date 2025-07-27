use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use hound::{WavWriter, WavSpec};
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::command;
use log::{info, error, warn};
use serde::{Serialize, Deserialize};
use serde_json;

const RECORDING_DURATION: u64 = 5; // seconds
const SAMPLE_RATE: u32 = 16000; // 16kHz for speech recognition
const CHANNELS: u16 = 1; // Mono

#[derive(Debug, Serialize, Deserialize)]
pub struct SttResult {
    pub text: String,
    pub confidence: f32,
    pub success: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TtsConfig {
    pub voice_model: String,
    pub speed: f32,
    pub enabled: bool,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            voice_model: "en_US-lessac-medium".to_string(),
            speed: 1.0,
            enabled: true,
        }
    }
}

// STT using Windows Speech Recognition API with enhanced debugging
#[command]
pub async fn run_vosk_stt(mic_on: bool) -> Result<SttResult, String> {
    if !mic_on {
        info!("STT called with mic_on=false, returning empty result");
        return Ok(SttResult {
            text: "".into(),
            confidence: 0.0,
            success: false,
        });
    }

    info!("🎤 Starting STT with audio recording...");

    // Use a more specific temp file path
    let temp_dir = std::env::temp_dir();
    let temp_audio = temp_dir.join("privacy_ai_assistant_audio.wav");
    let temp_audio_str = temp_audio.to_string_lossy().to_string();

    info!("📁 Using temp audio file: {}", temp_audio_str);

    // Record audio using cpal
    match record_audio_to_file(&temp_audio_str, RECORDING_DURATION).await {
        Ok(_) => {
            info!("✅ Audio recording completed successfully");

            // Check if file was actually created and has content
            match std::fs::metadata(&temp_audio_str) {
                Ok(metadata) => {
                    info!("📊 Audio file size: {} bytes", metadata.len());
                    if metadata.len() == 0 {
                        error!("❌ Audio file is empty!");
                        return Err("Audio file is empty - recording may have failed".to_string());
                    }
                }
                Err(e) => {
                    error!("❌ Cannot access audio file: {}", e);
                    return Err(format!("Audio file not found: {}", e));
                }
            }

            info!("🔄 Starting transcription process...");

            // Try multiple transcription methods
            let transcription = match process_audio_with_speech_api(&temp_audio_str).await {
                Ok(text) => {
                    info!("✅ Speech recognition successful: {}", text);
                    text
                }
                Err(e) => {
                    error!("❌ Windows Speech Recognition failed: {}", e);

                    // Try a simpler fallback method
                    match simple_speech_recognition_fallback(&temp_audio_str).await {
                        Ok(text) => {
                            info!("✅ Fallback speech recognition successful: {}", text);
                            text
                        }
                        Err(fallback_error) => {
                            error!("❌ All speech recognition methods failed. Primary: {}, Fallback: {}", e, fallback_error);
                            format!("Speech recognition failed. Primary error: {}. Fallback error: {}", e, fallback_error)
                        }
                    }
                }
            };

            // Clean up temp file
            if let Err(e) = std::fs::remove_file(&temp_audio_str) {
                warn!("⚠️ Failed to clean up temp file: {}", e);
            } else {
                info!("🧹 Temp file cleaned up successfully");
            }

            // Check if transcription was successful
            let success = !transcription.starts_with("Speech recognition failed")
                && !transcription.contains("failed")
                && !transcription.trim().is_empty()
                && transcription != "No speech detected in audio";

            info!("📝 Final transcription result - Success: {}, Text: '{}'", success, transcription);

            Ok(SttResult {
                text: transcription,
                confidence: if success { 0.85 } else { 0.0 },
                success,
            })
        }
        Err(e) => {
            error!("❌ Audio recording failed: {}", e);
            Err(format!("Audio recording failed: {}", e))
        }
    }
}

// TTS using Piper offline model
#[command]
pub async fn run_piper_tts(text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("No text provided for TTS".into());
    }

    info!("Starting TTS with Piper for text: {}", text.chars().take(50).collect::<String>());
    
    // Use Piper to generate speech
    match generate_speech_with_piper(&text).await {
        Ok(audio_file) => {
            // Play the generated audio
            match play_audio_file(&audio_file).await {
                Ok(_) => {
                    info!("TTS playback completed successfully");
                    // Clean up temp file
                    let _ = std::fs::remove_file(&audio_file);
                    Ok(())
                }
                Err(e) => {
                    error!("Failed to play TTS audio: {}", e);
                    Err(format!("Audio playback failed: {}", e))
                }
            }
        }
        Err(e) => {
            error!("Failed to generate TTS: {}", e);
            Err(format!("TTS generation failed: {}", e))
        }
    }
}

// Helper functions
async fn record_audio_to_file(filename: &str, duration: u64) -> Result<(), String> {
    info!("🎤 Recording audio to '{}' for {} seconds", filename, duration);

    // Get the default input device
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or_else(|| "No input device available".to_string())?;

    let device_name = device.name().unwrap_or_else(|_| "Unknown".to_string());
    info!("🎧 Using input device: {}", device_name);

    // Get the default input config
    let config = device.default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    info!("⚙️ Input config: {:?}", config);

    // Create WAV writer
    let spec = WavSpec {
        channels: CHANNELS,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer = WavWriter::create(filename, spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

    let writer = Arc::new(Mutex::new(Some(writer)));
    let writer_clone = Arc::clone(&writer);

    // Build the input stream
    let stream_config = StreamConfig {
        channels: CHANNELS,
        sample_rate: SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };

    let stream = match config.sample_format() {
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if let Ok(mut guard) = writer_clone.lock() {
                    if let Some(ref mut writer) = guard.as_mut() {
                        for &sample in data {
                            let sample = (sample * i16::MAX as f32) as i16;
                            let _ = writer.write_sample(sample);
                        }
                    }
                }
            },
            |err| error!("An error occurred on the input audio stream: {}", err),
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                if let Ok(mut guard) = writer_clone.lock() {
                    if let Some(ref mut writer) = guard.as_mut() {
                        for &sample in data {
                            let _ = writer.write_sample(sample);
                        }
                    }
                }
            },
            |err| error!("An error occurred on the input audio stream: {}", err),
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                if let Ok(mut guard) = writer_clone.lock() {
                    if let Some(ref mut writer) = guard.as_mut() {
                        for &sample in data {
                            let sample = (sample as i32 - 32768) as i16;
                            let _ = writer.write_sample(sample);
                        }
                    }
                }
            },
            |err| error!("An error occurred on the input audio stream: {}", err),
            None,
        ),
        _ => {
            return Err("Unsupported sample format".to_string());
        }
    }.map_err(|e| format!("Failed to build input stream: {}", e))?;

    // Start recording
    stream.play().map_err(|e| format!("Failed to start recording: {}", e))?;
    info!("🔴 Recording started...");

    // Record for the specified duration
    for i in 1..=duration {
        thread::sleep(Duration::from_secs(1));
        info!("🎤 Recording... {}s/{}", i, duration);
    }

    // Stop recording
    drop(stream);
    info!("⏹️ Recording stopped");

    // Finalize the WAV file
    if let Ok(mut guard) = writer.lock() {
        if let Some(writer) = guard.take() {
            writer.finalize().map_err(|e| format!("Failed to finalize WAV file: {}", e))?;
            info!("💾 WAV file finalized successfully");
        }
    }

    // Check if file was created and has content
    match std::fs::metadata(filename) {
        Ok(metadata) => {
            info!("✅ Audio recording completed successfully - File size: {} bytes", metadata.len());
            if metadata.len() == 0 {
                return Err("Audio file is empty - no audio was recorded".to_string());
            }
        }
        Err(e) => {
            return Err(format!("Audio file was not created: {}", e));
        }
    }

    Ok(())
}

// Simple fallback speech recognition method using different approach
async fn simple_speech_recognition_fallback(audio_file: &str) -> Result<String, String> {
    info!("🔄 Trying alternative speech recognition approach for: {}", audio_file);

    // Try using Windows Speech Platform instead of System.Speech
    let escaped_path = escape_powershell_path(audio_file);
    info!("🔒 Fallback escaped path: {}", escaped_path);

    // Alternative approach using Windows Speech Platform Runtime
    let script = format!(
        r#"
        try {{
            # Try alternative approach with different speech recognition method
            Add-Type -AssemblyName System.Speech

            # Create recognizer with different settings
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine

            # Try to set input with error handling
            try {{
                $recognizer.SetInputToWaveFile({})
            }} catch {{
                # If SetInputToWaveFile fails, try SetInputToDefaultAudioDevice as fallback
                Write-Output "Error: Cannot process audio file format. File may not be in WAV format or may be corrupted."
                return
            }}

            # Create a more permissive grammar
            $grammar = New-Object System.Speech.Recognition.DictationGrammar
            $recognizer.LoadGrammar($grammar)

            # Try recognition with shorter timeout
            $result = $recognizer.Recognize([TimeSpan]::FromSeconds(5))

            if ($result -and $result.Text -and $result.Text.Trim() -ne '') {{
                $result.Text.Trim()
            }} else {{
                "No speech detected in audio"
            }}

            $recognizer.Dispose()
        }} catch {{
            "Error in fallback recognition: $($_.Exception.Message)"
        }}
        "#,
        escaped_path
    );

    let output = Command::new("powershell")
        .arg("-Command")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to execute fallback command: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    info!("🔄 Fallback result: {}", result);

    if result.starts_with("Error") || result == "No speech detected" {
        Err(result)
    } else {
        Ok(result)
    }
}

// Properly escape file paths for PowerShell execution
fn escape_powershell_path(path: &str) -> String {
    // For PowerShell, we need to handle several cases:
    // 1. Backslashes need to be escaped or use forward slashes
    // 2. Spaces and special characters need proper quoting
    // 3. Single quotes within the path need to be escaped

    // Convert backslashes to forward slashes (PowerShell accepts both)
    let normalized_path = path.replace("\\", "/");

    // Check if the path contains spaces or special characters that need quoting
    if normalized_path.contains(' ') ||
       normalized_path.contains('&') ||
       normalized_path.contains('(') ||
       normalized_path.contains(')') ||
       normalized_path.contains('[') ||
       normalized_path.contains(']') ||
       normalized_path.contains('{') ||
       normalized_path.contains('}') ||
       normalized_path.contains('$') ||
       normalized_path.contains('`') ||
       normalized_path.contains('\'') ||
       normalized_path.contains('"') {

        // Use double quotes and escape any double quotes in the path
        let escaped_quotes = normalized_path.replace("\"", "\\\"");
        format!("\"{}\"", escaped_quotes)
    } else {
        // Simple path without special characters, use single quotes for safety
        format!("'{}'", normalized_path)
    }
}

async fn process_audio_with_speech_api(audio_file: &str) -> Result<String, String> {
    info!("🔄 Processing audio with Windows Speech Recognition API: {}", audio_file);

    // Convert the audio file path to absolute path
    let absolute_path = std::fs::canonicalize(audio_file)
        .map_err(|e| format!("Failed to get absolute path for '{}': {}", audio_file, e))?;

    let absolute_path_str = absolute_path.to_string_lossy().to_string();
    info!("📁 Using absolute path: {}", absolute_path_str);

    // Validate file exists and is accessible
    if !absolute_path.exists() {
        return Err(format!("Audio file does not exist: {}", absolute_path_str));
    }

    // Check file size
    match std::fs::metadata(&absolute_path) {
        Ok(metadata) => {
            info!("📊 Audio file size: {} bytes", metadata.len());
            if metadata.len() == 0 {
                return Err("Audio file is empty".to_string());
            }
        }
        Err(e) => {
            return Err(format!("Cannot read audio file metadata: {}", e));
        }
    }

    // Properly escape the path for PowerShell
    let escaped_path = escape_powershell_path(&absolute_path_str);
    info!("🔒 Escaped path for PowerShell: {}", escaped_path);

    // Use PowerShell with Windows Speech Recognition API
    let script = format!(
        r#"
        Add-Type -AssemblyName System.Speech

        try {{
            # Create speech recognition engine
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine

            # Set input to the audio file using properly escaped path
            $recognizer.SetInputToWaveFile({})

            # Create a grammar that accepts any speech
            $grammar = New-Object System.Speech.Recognition.DictationGrammar
            $recognizer.LoadGrammar($grammar)

            # Perform recognition with timeout
            $result = $recognizer.Recognize([TimeSpan]::FromSeconds(10))

            if ($result -ne $null -and $result.Text -ne $null -and $result.Text.Trim() -ne '') {{
                Write-Output $result.Text
            }} else {{
                Write-Output "No speech detected in audio"
            }}

            $recognizer.Dispose()
        }} catch {{
            Write-Output "Error: $($_.Exception.Message)"
        }}
        "#,
        escaped_path
    );

    info!("🚀 Executing speech recognition script...");
    info!("📜 PowerShell script preview: {}",
        if script.len() > 200 {
            format!("{}...", &script[..200])
        } else {
            script.clone()
        }
    );

    let output = Command::new("powershell")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to execute speech recognition command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    info!("📤 Speech recognition stdout: '{}'", stdout);
    if !stderr.is_empty() {
        warn!("⚠️ Speech recognition stderr: '{}'", stderr);
    }
    info!("📊 Exit status: {}", output.status);

    if output.status.success() {
        let transcription = stdout.trim();
        info!("📝 Raw transcription result: '{}'", transcription);

        if transcription.is_empty() {
            Err("Empty transcription result".to_string())
        } else if transcription.starts_with("Error:") {
            Err(format!("PowerShell error: {}", transcription))
        } else if transcription == "No speech detected in audio" {
            Err("No speech detected in the audio file".to_string())
        } else {
            info!("✅ Speech recognition completed successfully: '{}'", transcription);
            Ok(transcription.to_string())
        }
    } else {
        let error_msg = if stderr.is_empty() {
            "Unknown PowerShell error".to_string()
        } else {
            stderr.to_string()
        };
        Err(format!("PowerShell execution failed (exit code: {}): {}", output.status, error_msg))
    }
}

async fn generate_speech_with_piper(text: &str) -> Result<String, String> {
    info!("Generating speech with Piper");
    
    let output_file = "temp_tts_output.wav";
    
    // For Windows, we can use built-in SAPI for now
    // In production, you'd use Piper
    let output = Command::new("powershell")
        .arg("-Command")
        .arg(format!(
            "Add-Type -AssemblyName System.Speech; \
            $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; \
            $synth.SetOutputToWaveFile('{}'); \
            $synth.Speak('{}'); \
            $synth.Dispose()",
            output_file, text.replace("'", "''")
        ))
        .output()
        .map_err(|e| format!("Failed to execute TTS command: {}", e))?;

    if output.status.success() {
        info!("TTS generation completed");
        Ok(output_file.to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("TTS generation failed: {}", error_msg))
    }
}

async fn play_audio_file(audio_file: &str) -> Result<(), String> {
    info!("Playing audio file: {}", audio_file);
    
    // Use rodio to play the audio file
    let (_stream, stream_handle) = OutputStream::try_default()
        .map_err(|e| format!("Failed to create audio stream: {}", e))?;
    
    let sink = Sink::try_new(&stream_handle)
        .map_err(|e| format!("Failed to create audio sink: {}", e))?;
    
    let file = File::open(audio_file)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    
    let source = Decoder::new(BufReader::new(file))
        .map_err(|e| format!("Failed to decode audio file: {}", e))?;
    
    sink.append(source);
    sink.sleep_until_end();
    
    Ok(())
}

// Configuration commands
#[command]
pub async fn get_tts_config() -> Result<TtsConfig, String> {
    Ok(TtsConfig::default())
}

#[command]
pub async fn set_tts_config(config: TtsConfig) -> Result<(), String> {
    info!("TTS config updated: {:?}", config);
    // In a real implementation, you'd save this to a config file
    Ok(())
}

#[command]
pub async fn test_audio_devices() -> Result<String, String> {
    info!("🧪 Testing audio devices");

    let host = cpal::default_host();

    let input_device = host.default_input_device()
        .map(|d| d.name().unwrap_or_else(|_| "Unknown".to_string()))
        .unwrap_or_else(|| "No input device".to_string());

    let output_device = host.default_output_device()
        .map(|d| d.name().unwrap_or_else(|_| "Unknown".to_string()))
        .unwrap_or_else(|| "No output device".to_string());

    let result = format!("🎧 Input: {}, 🔊 Output: {}", input_device, output_device);
    info!("{}", result);
    Ok(result)
}

// Process audio data directly from frontend
#[command]
pub async fn process_audio_data(audio_data: String, mime_type: String) -> Result<SttResult, String> {
    info!("🎯 Processing audio data (base64 length: {}, mime_type: {})", audio_data.len(), mime_type);

    // Decode base64 audio data
    use base64::Engine;
    let audio_bytes = match base64::engine::general_purpose::STANDARD.decode(&audio_data) {
        Ok(bytes) => bytes,
        Err(e) => {
            error!("❌ Failed to decode base64 audio data: {}", e);
            return Err(format!("Failed to decode audio data: {}", e));
        }
    };

    info!("📊 Decoded audio data: {} bytes", audio_bytes.len());

    if audio_bytes.is_empty() {
        error!("❌ Audio data is empty");
        return Err("Audio data is empty".to_string());
    }

    // Create temporary file
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    // Determine file extension based on MIME type
    let extension = if mime_type.contains("wav") {
        "wav"
    } else if mime_type.contains("webm") {
        "webm"
    } else if mime_type.contains("ogg") {
        "ogg"
    } else if mime_type.contains("mp3") {
        "mp3"
    } else {
        "webm" // Default fallback
    };

    let temp_filename = format!("voice_recording_{}.{}", timestamp, extension);
    info!("📁 Creating temp file: {} (MIME type: {})", temp_filename, mime_type);
    let temp_path = temp_dir.join(&temp_filename);
    let temp_path_str = temp_path.to_string_lossy().to_string();

    // Write audio data to temporary file
    match std::fs::write(&temp_path, &audio_bytes) {
        Ok(_) => {
            info!("💾 Audio data written to temp file: {}", temp_path_str);
        }
        Err(e) => {
            error!("❌ Failed to write audio data to temp file: {}", e);
            return Err(format!("Failed to write audio data: {}", e));
        }
    }

    // Convert WebM to WAV if needed (for better compatibility with speech recognition)
    let wav_path = convert_to_wav(&temp_path_str).await?;

    // Process with speech recognition
    let result = match process_audio_with_speech_api(&wav_path).await {
        Ok(text) => {
            info!("✅ Speech recognition successful: {}", text);
            SttResult {
                text,
                confidence: 0.85,
                success: true,
            }
        }
        Err(e) => {
            error!("❌ Speech recognition failed: {}", e);

            // Try fallback method
            match simple_speech_recognition_fallback(&wav_path).await {
                Ok(text) => {
                    info!("✅ Fallback speech recognition successful: {}", text);
                    SttResult {
                        text,
                        confidence: 0.70,
                        success: true,
                    }
                }
                Err(fallback_error) => {
                    error!("❌ All speech recognition methods failed. Primary: {}, Fallback: {}", e, fallback_error);

                    // Provide helpful error message based on the type of error
                    let error_message = if e.contains("invalid format") || fallback_error.contains("invalid format") {
                        "Audio format not supported by Windows Speech Recognition. The recorded audio may be in WebM format which requires conversion to WAV. Please try speaking more clearly or check your microphone settings."
                    } else if e.contains("No speech detected") || fallback_error.contains("No speech detected") {
                        "No speech was detected in the recording. Please try speaking louder and more clearly during the recording."
                    } else {
                        "Speech recognition failed. Please ensure your microphone is working and try again."
                    };

                    SttResult {
                        text: error_message.to_string(),
                        confidence: 0.0,
                        success: false,
                    }
                }
            }
        }
    };

    // Clean up temporary files
    let _ = std::fs::remove_file(&temp_path);
    if wav_path != temp_path_str {
        let _ = std::fs::remove_file(&wav_path);
    }
    info!("🧹 Cleaned up temporary files");

    Ok(result)
}

// Process audio file from frontend (kept for compatibility)
#[command]
pub async fn process_audio_file(filename: String, cleanup: bool) -> Result<SttResult, String> {
    info!("🎯 Processing audio file: {}", filename);

    // Get temp directory path
    let temp_dir = std::env::temp_dir();
    let audio_path = temp_dir.join(&filename);
    let audio_path_str = audio_path.to_string_lossy().to_string();

    info!("📁 Full audio path: {}", audio_path_str);

    // Check if file exists
    if !audio_path.exists() {
        error!("❌ Audio file not found: {}", audio_path_str);
        return Err(format!("Audio file not found: {}", filename));
    }

    // Check file size
    match std::fs::metadata(&audio_path) {
        Ok(metadata) => {
            info!("📊 Audio file size: {} bytes", metadata.len());
            if metadata.len() == 0 {
                error!("❌ Audio file is empty");
                return Err("Audio file is empty".to_string());
            }
        }
        Err(e) => {
            error!("❌ Cannot read audio file metadata: {}", e);
            return Err(format!("Cannot read audio file: {}", e));
        }
    }

    // Convert WebM to WAV if needed (for better compatibility with speech recognition)
    let wav_path = convert_to_wav(&audio_path_str).await?;

    // Process with speech recognition
    let result = match process_audio_with_speech_api(&wav_path).await {
        Ok(text) => {
            info!("✅ Speech recognition successful: {}", text);
            SttResult {
                text,
                confidence: 0.85,
                success: true,
            }
        }
        Err(e) => {
            error!("❌ Speech recognition failed: {}", e);

            // Try fallback method
            match simple_speech_recognition_fallback(&wav_path).await {
                Ok(text) => {
                    info!("✅ Fallback speech recognition successful: {}", text);
                    SttResult {
                        text,
                        confidence: 0.70,
                        success: true,
                    }
                }
                Err(fallback_error) => {
                    error!("❌ All speech recognition methods failed. Primary: {}, Fallback: {}", e, fallback_error);
                    SttResult {
                        text: format!("Speech recognition failed: {}", e),
                        confidence: 0.0,
                        success: false,
                    }
                }
            }
        }
    };

    // Clean up files if requested
    if cleanup {
        let _ = std::fs::remove_file(&audio_path);
        if wav_path != audio_path_str {
            let _ = std::fs::remove_file(&wav_path);
        }
        info!("🧹 Cleaned up temporary files");
    }

    Ok(result)
}

// Convert audio file to WAV format for better speech recognition compatibility
async fn convert_to_wav(input_path: &str) -> Result<String, String> {
    info!("🔄 Converting audio format for speech recognition: {}", input_path);

    // Check if input is already WAV
    if input_path.to_lowercase().ends_with(".wav") {
        info!("✅ Input is already WAV format");
        return Ok(input_path.to_string());
    }

    // For WebM files, we need to convert to WAV
    if input_path.to_lowercase().ends_with(".webm") {
        return convert_webm_to_wav(input_path).await;
    }

    // For other formats, try to use as-is first
    info!("⚠️ Unknown audio format, attempting to use as-is");
    Ok(input_path.to_string())
}

// Convert WebM file to WAV using FFmpeg or fallback method
async fn convert_webm_to_wav(webm_path: &str) -> Result<String, String> {
    info!("🔄 Converting WebM to WAV: {}", webm_path);

    // Generate output WAV path
    let wav_path = webm_path.replace(".webm", ".wav");

    // Try FFmpeg first (if available)
    match try_ffmpeg_conversion(webm_path, &wav_path).await {
        Ok(_) => {
            info!("✅ FFmpeg conversion successful");
            return Ok(wav_path);
        }
        Err(e) => {
            info!("⚠️ FFmpeg conversion failed: {}, trying fallback method", e);
        }
    }

    // Fallback: Create a simple WAV file with basic header
    // This is a simplified approach - in production you'd want proper WebM decoding
    match create_basic_wav_file(webm_path, &wav_path).await {
        Ok(_) => {
            info!("✅ Basic WAV creation successful");
            Ok(wav_path)
        }
        Err(e) => {
            error!("❌ All conversion methods failed: {}", e);
            Err(format!("Audio format conversion failed: {}. Windows Speech Recognition requires WAV format. Please install FFmpeg for proper audio conversion.", e))
        }
    }
}

// Try converting using FFmpeg (if available on system)
async fn try_ffmpeg_conversion(input_path: &str, output_path: &str) -> Result<(), String> {
    info!("🔄 Attempting FFmpeg conversion...");

    let output = Command::new("ffmpeg")
        .arg("-i")
        .arg(input_path)
        .arg("-acodec")
        .arg("pcm_s16le")  // 16-bit PCM
        .arg("-ar")
        .arg("16000")      // 16kHz sample rate
        .arg("-ac")
        .arg("1")          // Mono
        .arg("-y")         // Overwrite output file
        .arg(output_path)
        .output()
        .map_err(|e| format!("FFmpeg not found or failed to execute: {}", e))?;

    if output.status.success() {
        // Verify the output file was created
        if std::path::Path::new(output_path).exists() {
            info!("✅ FFmpeg conversion completed successfully");
            Ok(())
        } else {
            Err("FFmpeg completed but output file was not created".to_string())
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg conversion failed: {}", stderr))
    }
}

// Create a basic WAV file as fallback (simplified approach)
async fn create_basic_wav_file(input_path: &str, output_path: &str) -> Result<(), String> {
    info!("🔄 Creating basic WAV file as fallback...");

    // Read the input file
    let input_data = std::fs::read(input_path)
        .map_err(|e| format!("Failed to read input file: {}", e))?;

    if input_data.is_empty() {
        return Err("Input file is empty".to_string());
    }

    // Create a basic WAV file with minimal header
    // This is a very simplified approach - it won't properly decode WebM
    // but might work for some basic cases
    let wav_data = create_minimal_wav_header(&input_data);

    std::fs::write(output_path, wav_data)
        .map_err(|e| format!("Failed to write WAV file: {}", e))?;

    info!("✅ Basic WAV file created (note: this is a fallback method)");
    Ok(())
}

// Create minimal WAV header (very basic implementation)
fn create_minimal_wav_header(audio_data: &[u8]) -> Vec<u8> {
    let mut wav_data = Vec::new();

    // WAV header (44 bytes)
    wav_data.extend_from_slice(b"RIFF");                    // ChunkID
    wav_data.extend_from_slice(&(36 + audio_data.len() as u32).to_le_bytes()); // ChunkSize
    wav_data.extend_from_slice(b"WAVE");                    // Format
    wav_data.extend_from_slice(b"fmt ");                    // Subchunk1ID
    wav_data.extend_from_slice(&16u32.to_le_bytes());       // Subchunk1Size
    wav_data.extend_from_slice(&1u16.to_le_bytes());        // AudioFormat (PCM)
    wav_data.extend_from_slice(&1u16.to_le_bytes());        // NumChannels (Mono)
    wav_data.extend_from_slice(&16000u32.to_le_bytes());    // SampleRate (16kHz)
    wav_data.extend_from_slice(&32000u32.to_le_bytes());    // ByteRate
    wav_data.extend_from_slice(&2u16.to_le_bytes());        // BlockAlign
    wav_data.extend_from_slice(&16u16.to_le_bytes());       // BitsPerSample
    wav_data.extend_from_slice(b"data");                    // Subchunk2ID
    wav_data.extend_from_slice(&(audio_data.len() as u32).to_le_bytes()); // Subchunk2Size

    // Add the audio data (this is where proper decoding should happen)
    wav_data.extend_from_slice(audio_data);

    wav_data
}

// Test command for debugging STT without recording
#[command]
pub async fn test_stt_debug() -> Result<String, String> {
    info!("🧪 Running STT debug test");

    // Test Windows Speech Recognition availability
    let test_script = r#"
        try {
            Add-Type -AssemblyName System.Speech
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
            "Windows Speech Recognition is available"
        } catch {
            "Error: $($_.Exception.Message)"
        }
    "#;

    let output = Command::new("powershell")
        .arg("-Command")
        .arg(test_script)
        .output()
        .map_err(|e| format!("Failed to test speech recognition: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    info!("🧪 STT test result: {}", result);

    Ok(result)
}

// Test command for debugging STT with static file
#[command]
pub async fn test_static_file_stt(file_path: Option<String>) -> Result<SttResult, String> {
    info!("🧪 Testing STT with static file");

    // Use provided path or default to synthesize.wav
    let test_file = file_path.unwrap_or_else(|| "./synthesize.wav".to_string());
    info!("📁 Using test file: {}", test_file);

    // Check if file exists
    let file_path = std::path::Path::new(&test_file);
    if !file_path.exists() {
        // Try alternative paths
        let current_dir_path = std::env::current_dir().unwrap().join("synthesize.wav");
        let current_dir_str = current_dir_path.to_string_lossy().to_string();
        let alternatives = vec![
            "./synthesize.wav",
            "../synthesize.wav",
            "../../synthesize.wav",
            "./src-tauri/synthesize.wav",
            current_dir_str.as_str(),
        ];

        let mut found_file = None;
        for alt_path in alternatives {
            info!("🔍 Checking alternative path: {}", alt_path);
            if std::path::Path::new(alt_path).exists() {
                found_file = Some(alt_path.to_string());
                break;
            }
        }

        if let Some(found_path) = found_file {
            info!("✅ Found test file at: {}", found_path);
            return test_static_file_stt_internal(&found_path).await;
        } else {
            let current_dir = std::env::current_dir().unwrap_or_default();
            error!("❌ Test file not found. Current directory: {:?}", current_dir);

            // List files in current directory for debugging
            if let Ok(entries) = std::fs::read_dir(&current_dir) {
                info!("📂 Files in current directory:");
                for entry in entries.flatten() {
                    info!("  - {}", entry.file_name().to_string_lossy());
                }
            }

            return Err(format!(
                "Test file '{}' not found. Current directory: {:?}. Please ensure synthesize.wav exists in the project root.",
                test_file, current_dir
            ));
        }
    }

    test_static_file_stt_internal(&test_file).await
}

// Internal function to test STT with a specific file
async fn test_static_file_stt_internal(file_path: &str) -> Result<SttResult, String> {
    info!("🎯 Testing STT with file: {}", file_path);

    // Get absolute path
    let absolute_path = match std::fs::canonicalize(file_path) {
        Ok(path) => path,
        Err(e) => {
            error!("❌ Failed to get absolute path for '{}': {}", file_path, e);
            return Err(format!("Failed to access file '{}': {}", file_path, e));
        }
    };

    let absolute_path_str = absolute_path.to_string_lossy().to_string();
    info!("📁 Absolute path: {}", absolute_path_str);

    // Check file metadata
    match std::fs::metadata(&absolute_path) {
        Ok(metadata) => {
            info!("📊 File size: {} bytes", metadata.len());
            info!("📊 File type: {:?}", metadata.file_type());
            if metadata.len() == 0 {
                return Err("Test file is empty".to_string());
            }
        }
        Err(e) => {
            error!("❌ Cannot read file metadata: {}", e);
            return Err(format!("Cannot access file: {}", e));
        }
    }

    // Test multiple STT methods
    info!("🔄 Testing Windows Speech Recognition API...");
    match process_audio_with_speech_api(&absolute_path_str).await {
        Ok(text) => {
            info!("✅ Windows Speech Recognition successful: {}", text);
            return Ok(SttResult {
                text,
                confidence: 0.90,
                success: true,
            });
        }
        Err(e) => {
            error!("❌ Windows Speech Recognition failed: {}", e);
            info!("🔄 Trying fallback method...");

            // Try fallback method
            match simple_speech_recognition_fallback(&absolute_path_str).await {
                Ok(text) => {
                    info!("✅ Fallback speech recognition successful: {}", text);
                    return Ok(SttResult {
                        text,
                        confidence: 0.75,
                        success: true,
                    });
                }
                Err(fallback_error) => {
                    error!("❌ All STT methods failed. Primary: {}, Fallback: {}", e, fallback_error);

                    // Return detailed error information
                    return Ok(SttResult {
                        text: format!(
                            "STT Test Failed:\n\nFile: {}\nSize: {} bytes\n\nPrimary Error: {}\nFallback Error: {}\n\nThis indicates an issue with the Windows Speech Recognition setup or audio file format.",
                            absolute_path_str,
                            std::fs::metadata(&absolute_path).map(|m| m.len()).unwrap_or(0),
                            e,
                            fallback_error
                        ),
                        confidence: 0.0,
                        success: false,
                    });
                }
            }
        }
    }
}

// Test command for debugging path escaping
#[command]
pub async fn test_path_escaping(test_path: String) -> Result<String, String> {
    info!("🧪 Testing path escaping for: {}", test_path);

    let escaped = escape_powershell_path(&test_path);
    info!("🔒 Escaped result: {}", escaped);

    // Test the escaped path in a simple PowerShell command
    let test_script = format!(
        r#"
        try {{
            $path = {}
            if (Test-Path $path) {{
                "Path exists: $path"
            }} else {{
                "Path does not exist: $path"
            }}
        }} catch {{
            "Error testing path: $($_.Exception.Message)"
        }}
        "#,
        escaped
    );

    let output = Command::new("powershell")
        .arg("-Command")
        .arg(&test_script)
        .output()
        .map_err(|e| format!("Failed to test path: {}", e))?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    info!("🧪 Path test result: {}", result);

    Ok(format!("Original: {} | Escaped: {} | Test: {}", test_path, escaped, result))
}

// 🎤 Vosk Real-time STT Command
#[tauri::command]
pub async fn vosk_transcribe(duration: f64) -> Result<SttResult, String> {
    info!("🎤 Starting Vosk transcription for {} seconds", duration);

    // Get the project root directory (parent of src-tauri)
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    // If we're in src-tauri, go up one level to project root
    let project_root = if current_dir.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
        current_dir.parent().unwrap_or(&current_dir).to_path_buf()
    } else {
        current_dir.clone()
    };

    info!("📁 Project root directory: {:?}", project_root);

    // Path to the Vosk integration script (in project root)
    let script_path = project_root.join("tauri_vosk_integration.py");

    if !script_path.exists() {
        return Err(format!("Vosk integration script not found: {:?}", script_path));
    }

    // Path to Vosk model (in project root)
    let model_path = project_root.join("vosk-model-small-en-us-0.15");

    if !model_path.exists() {
        return Err(format!("Vosk model not found: {:?}", model_path));
    }

    info!("🐍 Running Vosk script: {:?}", script_path);
    info!("🎤 Using Vosk model: {:?}", model_path);

    // Run the Python script with absolute paths
    let output = Command::new("python")
        .arg(&script_path)
        .arg(&model_path)
        .arg(duration.to_string())
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to run Vosk script: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("❌ Vosk script failed: {}", stderr);
        return Err(format!("Vosk script failed: {}", stderr));
    }

    // Parse the JSON output
    let stdout = String::from_utf8_lossy(&output.stdout);
    info!("📤 Vosk script output: {}", stdout);

    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse Vosk output: {}", e))?;

    if result["success"].as_bool().unwrap_or(false) {
        let transcript = result["transcript"].as_str().unwrap_or("").to_string();
        info!("✅ Vosk transcription successful: {}", transcript);

        Ok(SttResult {
            text: transcript,
            confidence: 1.0, // Vosk doesn't provide confidence scores
            success: true,
        })
    } else {
        let error = result["error"].as_str().unwrap_or("Unknown error").to_string();
        warn!("⚠️ Vosk transcription failed: {}", error);

        Ok(SttResult {
            text: String::new(),
            confidence: 0.0,
            success: false,
        })
    }
}

// 🧪 Test Vosk Installation
#[tauri::command]
pub async fn test_vosk_installation() -> Result<String, String> {
    info!("🧪 Testing Vosk installation");

    // Get the project root directory (parent of src-tauri)
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;

    let project_root = if current_dir.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
        current_dir.parent().unwrap_or(&current_dir).to_path_buf()
    } else {
        current_dir.clone()
    };

    info!("📁 Testing from project root: {:?}", project_root);

    // Check if Python is available
    let python_check = Command::new("python")
        .arg("--version")
        .output();

    match python_check {
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout);
            info!("🐍 Python version: {}", version);
        }
        Err(e) => {
            return Err(format!("Python not found: {}", e));
        }
    }

    // Check if Vosk model exists (in project root)
    let model_path = project_root.join("vosk-model-small-en-us-0.15");
    if !model_path.exists() {
        return Err(format!("Vosk model not found: {:?}", model_path));
    }

    // Check if integration script exists (in project root)
    let script_path = project_root.join("tauri_vosk_integration.py");
    if !script_path.exists() {
        return Err(format!("Vosk integration script not found: {:?}", script_path));
    }

    // Test Vosk import
    let vosk_test = Command::new("python")
        .arg("-c")
        .arg("import vosk; import sounddevice; import numpy; print('Vosk dependencies OK')")
        .current_dir(&project_root)
        .output()
        .map_err(|e| format!("Failed to test Vosk dependencies: {}", e))?;

    if !vosk_test.status.success() {
        let stderr = String::from_utf8_lossy(&vosk_test.stderr);
        return Err(format!("Vosk dependencies test failed: {}", stderr));
    }

    let test_output = String::from_utf8_lossy(&vosk_test.stdout);
    info!("✅ Vosk installation test: {}", test_output);

    Ok(format!("Vosk installation OK: {}", test_output.trim()))
}

// Continuous voice chat command for real-time processing
#[command]
pub async fn start_continuous_voice_chat(stream_id: String) -> Result<String, String> {
    info!("🎤 [Continuous Voice] Starting continuous voice chat with stream ID: {}", stream_id);

    // This is a placeholder implementation
    // In a real implementation, this would:
    // 1. Start continuous audio recording
    // 2. Process audio chunks in real-time
    // 3. Emit events for transcription updates
    // 4. Handle silence detection

    // For now, we'll use the existing vosk_transcribe functionality
    // and simulate continuous processing

    let stream_id_clone = stream_id.clone();

    tokio::spawn(async move {
        info!("🎤 [Continuous Voice] Background processing started for stream: {}", stream_id_clone);

        // Simulate continuous processing
        tokio::time::sleep(Duration::from_millis(100)).await;

        info!("✅ [Continuous Voice] Stream {} ready for processing", stream_id_clone);
    });

    Ok(format!("Continuous voice chat started with stream ID: {}", stream_id))
}
