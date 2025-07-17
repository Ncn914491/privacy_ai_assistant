use serde::{Deserialize, Serialize};
use std::env;
use log::info;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
    pub timestamp: DateTime<Utc>,
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
