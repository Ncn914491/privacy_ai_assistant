use serde::{Deserialize, Serialize};
use std::env;
use std::process::Command;
use log::{info, error};
use chrono::{DateTime, Utc};

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
        .arg("gemma:3n")
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
