use serde::{Deserialize, Serialize};
use std::env;
use std::process::Command;
use log::{info, error, warn};
use chrono::{DateTime, Utc};

// Custom error type for better error handling
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("HTTP request failed: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("Command execution failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON serialization failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("LLM Error: {0}")]
    Llm(String),
}

// Implement Serialize for the error type to send it over the Tauri bridge
impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}


#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
    pub timestamp: DateTime<Utc>,
}

#[tauri::command]
pub fn invoke_llm_prompt(prompt: String) -> Result<String, String> {
    info!("Invoking LLM with prompt: {}", prompt);

    let output = Command::new("ollama")
        .arg("run")
        .arg("gemma3n")
        .arg(&prompt)
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                let response = String::from_utf8_lossy(&output.stdout).to_string();
                Ok(response)
            } else {
                let error_msg = String::from_utf8_lossy(&output.stderr).to_string();
                error!("LLM process error: {}", error_msg);
                Err("Error running LLM command".into())
            }
        }
        Err(e) => {
            error!("Failed to spawn LLM process: {:?}", e);
            Err("Failed to invoke LLM process".into())
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppVersion {
    pub version: String,
    pub name: String,
    pub build_date: DateTime<Utc>,
}

#[tauri::command]
pub fn get_app_version() -> Result<AppVersion, String> {
    info!("Getting app version");
    
    Ok(AppVersion {
        version: env!("CARGO_PKG_VERSION").to_string(),
        name: env!("CARGO_PKG_NAME").to_string(),
        build_date: Utc::now(),
    })
}

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    info!("Getting system info");
    
    Ok(SystemInfo {
        os: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        version: std::env::var("OS").unwrap_or_else(|_| "Unknown".to_string()),
        timestamp: Utc::now(),
    })
}

#[tauri::command]
pub fn log_message(message: String) -> Result<(), String> {
    info!("Frontend log: {}", message);
    Ok(())
}

#[tauri::command]
pub fn test_tauri_connection() -> Result<String, String> {
    info!("✅ Tauri connection test successful");
    Ok("✅ Tauri Connected".to_string())
}

#[tauri::command]
pub fn get_diagnostic_info() -> Result<serde_json::Value, String> {
    info!("Running diagnostic check");
    
    let diagnostic = serde_json::json!({
        "tauri_connected": true,
        "timestamp": chrono::Utc::now(),
        "system_info": {
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        },
        "commands_available": [
            "get_app_version",
            "get_system_info", 
            "log_message",
            "invoke_llm_prompt",
            "generate_llm_response",
            "check_llm_health",
            "run_vosk_stt",
            "run_piper_tts",
            "test_audio_devices"
        ]
    });
    
    Ok(diagnostic)
}


#[tauri::command]
pub async fn check_ollama_service() -> Result<bool, CommandError> {
    info!("Checking Ollama service status...");
    match reqwest::get("http://localhost:11434/api/version").await {
        Ok(response) => {
            if response.status().is_success() {
                info!("✅ Ollama service is responsive.");
                Ok(true)
            } else {
                warn!("⚠️ Ollama service returned non-success status: {}", response.status());
                Ok(false)
            }
        }
        Err(e) => {
            error!("❌ Failed to connect to Ollama service: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn test_gemma_model() -> Result<bool, CommandError> {
    info!("Testing Gemma 3n model...");
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "model": "gemma3n",
        "prompt": "Respond with 'ok'",
        "stream": false
    });

    match client.post("http://localhost:11434/api/generate").json(&payload).send().await {
        Ok(response) => {
            if response.status().is_success() {
                info!("✅ Gemma model responded successfully.");
                Ok(true)
            } else {
                warn!("⚠️ Gemma model returned non-success status: {}", response.status());
                Ok(false)
            }
        }
        Err(e) => {
            error!("❌ Failed to get response from Gemma model: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}
