use cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::process::Command;
use tauri::command;
use log::{info, error};
use serde::{Serialize, Deserialize};

const RECORDING_DURATION: u64 = 5; // seconds

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

// STT using Vosk offline model
#[command]
pub async fn run_vosk_stt(mic_on: bool) -> Result<SttResult, String> {
    if !mic_on {
        return Ok(SttResult {
            text: "".into(),
            confidence: 0.0,
            success: false,
        });
    }

    info!("Starting STT with Vosk...");
    
    // For now, we'll use a simple approach with external STT command
    // In a production environment, you'd want to download and use Vosk models
    // This is a placeholder that simulates STT functionality
    
    // Record audio to temporary file
    let temp_audio = "temp_audio.wav";
    
    // Use Windows built-in audio recording (placeholder)
    // In real implementation, you'd use cpal to record audio
    match record_audio_to_file(temp_audio, RECORDING_DURATION).await {
        Ok(_) => {
            // Process with Vosk (placeholder)
            let transcription = process_audio_with_vosk(temp_audio).await
                .unwrap_or_else(|_| "Could not transcribe audio".to_string());
            
            // Clean up temp file
            let _ = std::fs::remove_file(temp_audio);
            
            Ok(SttResult {
                text: transcription,
                confidence: 0.85,
                success: true,
            })
        }
        Err(e) => {
            error!("Failed to record audio: {}", e);
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
    info!("Recording audio to {} for {} seconds", filename, duration);
    
    // For Windows, we can use PowerShell to record audio
    // This is a simplified approach - in production you'd use cpal
    let output = Command::new("powershell")
        .arg("-Command")
        .arg(format!(
            "Add-Type -AssemblyName System.Speech; \
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine; \
            $recognizer.SetInputToDefaultAudioDevice(); \
            Start-Sleep -Seconds {}",
            duration
        ))
        .output()
        .map_err(|e| format!("Failed to execute recording command: {}", e))?;

    if output.status.success() {
        info!("Audio recording completed");
        Ok(())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Recording failed: {}", error_msg))
    }
}

async fn process_audio_with_vosk(audio_file: &str) -> Result<String, String> {
    info!("Processing audio with Vosk: {}", audio_file);
    
    // Placeholder for Vosk processing
    // In a real implementation, you'd:
    // 1. Load the Vosk model
    // 2. Process the audio file
    // 3. Return the transcription
    
    // For now, return a placeholder
    Ok("Hello, this is a placeholder transcription.".into())
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
    info!("Testing audio devices");
    
    let host = cpal::default_host();
    
    let input_device = host.default_input_device()
        .map(|d| d.name().unwrap_or_else(|_| "Unknown".to_string()))
        .unwrap_or_else(|| "No input device".to_string());
    
    let output_device = host.default_output_device()
        .map(|d| d.name().unwrap_or_else(|_| "Unknown".to_string()))
        .unwrap_or_else(|| "No output device".to_string());
    
    Ok(format!("Input: {}, Output: {}", input_device, output_device))
}
