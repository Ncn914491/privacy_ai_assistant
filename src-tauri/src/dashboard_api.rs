use serde::{Deserialize, Serialize};
use tauri::command;
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use uuid::Uuid;
use log::{info, error, warn};

// JWT Configuration
const JWT_SECRET: &str = "privacy_ai_assistant_dashboard_secret_key_2024";
const TOKEN_EXPIRATION_HOURS: i64 = 1;

// Data structures for dashboard integration
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareData {
    pub cpu_usage: f32,
    pub memory_usage: f32,
    pub memory_total_mb: u64,
    pub memory_available_mb: u64,
    pub gpu_temp: Option<f32>,
    pub gpu_name: Option<String>,
    pub cpu_cores: u32,
    pub has_gpu: bool,
    pub platform: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelStatus {
    pub model_name: String,
    pub connection_state: String, // "connected", "disconnected", "checking", "error"
    pub response_time_ms: Option<u64>,
    pub last_check: DateTime<Utc>,
    pub provider: String, // "local", "online", "hybrid"
    pub is_streaming: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolMetrics {
    pub active_tools: Vec<String>,
    pub tool_usage_count: HashMap<String, u32>,
    pub last_tool_used: Option<String>,
    pub total_executions: u32,
    pub success_rate: f32,
    pub average_execution_time_ms: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolDashboardData {
    pub metrics: ToolMetrics,
    pub available_plugins: Vec<String>,
    pub enabled_plugins: Vec<String>,
    pub plugin_health: HashMap<String, bool>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DashboardConfig {
    pub refresh_interval_ms: u64,
    pub show_hardware_details: bool,
    pub show_model_metrics: bool,
    pub show_tool_dashboard: bool,
    pub auto_refresh_enabled: bool,
    pub theme: String, // "light", "dark", "auto"
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String, // Subject (user identifier)
    exp: usize,  // Expiration time
    iat: usize,  // Issued at
    dashboard_access: bool,
}

// JWT token management
#[command]
pub async fn generate_dashboard_token() -> Result<String, String> {
    info!("🔐 Generating dashboard access token...");
    
    let now = Utc::now();
    let expiration = now + Duration::hours(TOKEN_EXPIRATION_HOURS);
    
    let claims = Claims {
        sub: "dashboard_user".to_string(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
        dashboard_access: true,
    };
    
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(JWT_SECRET.as_ref()),
    ).map_err(|e| {
        error!("❌ Failed to generate JWT token: {}", e);
        format!("Token generation failed: {}", e)
    })?;
    
    info!("✅ Dashboard token generated successfully");
    Ok(token)
}

#[command]
pub async fn validate_dashboard_token(token: String) -> Result<bool, String> {
    let validation = Validation::new(Algorithm::HS256);
    
    match decode::<Claims>(
        &token,
        &DecodingKey::from_secret(JWT_SECRET.as_ref()),
        &validation,
    ) {
        Ok(token_data) => {
            if token_data.claims.dashboard_access {
                info!("✅ Dashboard token validated successfully");
                Ok(true)
            } else {
                warn!("⚠️ Token does not have dashboard access");
                Ok(false)
            }
        }
        Err(e) => {
            error!("❌ Token validation failed: {}", e);
            Ok(false)
        }
    }
}

// Dashboard data endpoints
#[command]
pub async fn get_hardware_metrics() -> Result<HardwareData, String> {
    info!("📊 Fetching hardware metrics for dashboard...");
    
    // Get hardware info using existing system info functionality
    let hardware_info = crate::get_hardware_info().await
        .map_err(|e| format!("Failed to get hardware info: {}", e))?;
    
    // Extract hardware data from the response
    if let Some(data) = &hardware_info.data {
        if let Some(hardware) = data.get("hardware") {
            let hardware_data = HardwareData {
                cpu_usage: 0.0, // Will be updated with real-time data
                memory_usage: calculate_memory_usage_percentage(hardware),
                memory_total_mb: hardware.get("ram_total_mb")
                    .and_then(|v| v.as_u64()).unwrap_or(0),
                memory_available_mb: hardware.get("ram_available_mb")
                    .and_then(|v| v.as_u64()).unwrap_or(0),
                gpu_temp: None, // Will be populated if available
                gpu_name: hardware.get("gpu_name")
                    .and_then(|v| v.as_str()).map(|s| s.to_string()),
                cpu_cores: hardware.get("cpu_cores")
                    .and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                has_gpu: hardware.get("has_gpu")
                    .and_then(|v| v.as_bool()).unwrap_or(false),
                platform: hardware.get("platform")
                    .and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
                timestamp: Utc::now(),
            };
            
            info!("✅ Hardware metrics retrieved successfully");
            Ok(hardware_data)
        } else {
            error!("❌ Hardware data not found in response");
            Err("Hardware data not available".to_string())
        }
    } else {
        error!("❌ Invalid hardware info response format");
        Err("Invalid hardware info format".to_string())
    }
}

#[command]
pub async fn get_model_status() -> Result<ModelStatus, String> {
    info!("🤖 Fetching model status for dashboard...");
    
    // Use existing LLM health check
    let health_result = crate::llm::check_llm_health().await;
    
    let model_status = match health_result {
        Ok(is_healthy) => {
            ModelStatus {
                model_name: "gemma3n:latest".to_string(),
                connection_state: if is_healthy {
                    "connected".to_string()
                } else {
                    "disconnected".to_string()
                },
                response_time_ms: None, // Will be updated with actual timing
                last_check: Utc::now(),
                provider: "local".to_string(),
                is_streaming: false, // Will be updated based on active streams
                error_message: None,
            }
        }
        Err(e) => {
            ModelStatus {
                model_name: "gemma3n:latest".to_string(),
                connection_state: "error".to_string(),
                response_time_ms: None,
                last_check: Utc::now(),
                provider: "local".to_string(),
                is_streaming: false,
                error_message: Some(e),
            }
        }
    };
    
    info!("✅ Model status retrieved successfully");
    Ok(model_status)
}

#[command]
pub async fn get_tool_metrics() -> Result<ToolDashboardData, String> {
    info!("🔧 Fetching tool metrics for dashboard...");
    
    // Create mock tool metrics for now - will be enhanced with real data
    let tool_metrics = ToolMetrics {
        active_tools: vec![
            "file_reader".to_string(),
            "note_taker".to_string(),
            "todo_list".to_string(),
        ],
        tool_usage_count: {
            let mut map = HashMap::new();
            map.insert("file_reader".to_string(), 15);
            map.insert("note_taker".to_string(), 8);
            map.insert("todo_list".to_string(), 12);
            map
        },
        last_tool_used: Some("file_reader".to_string()),
        total_executions: 35,
        success_rate: 94.3,
        average_execution_time_ms: 245.7,
    };
    
    let dashboard_data = ToolDashboardData {
        metrics: tool_metrics,
        available_plugins: vec![
            "file_reader".to_string(),
            "file_writer".to_string(),
            "note_taker".to_string(),
            "todo_list".to_string(),
            "plugin_inspector".to_string(),
        ],
        enabled_plugins: vec![
            "file_reader".to_string(),
            "note_taker".to_string(),
            "todo_list".to_string(),
        ],
        plugin_health: {
            let mut map = HashMap::new();
            map.insert("file_reader".to_string(), true);
            map.insert("note_taker".to_string(), true);
            map.insert("todo_list".to_string(), true);
            map.insert("file_writer".to_string(), false);
            map.insert("plugin_inspector".to_string(), true);
            map
        },
        timestamp: Utc::now(),
    };
    
    info!("✅ Tool metrics retrieved successfully");
    Ok(dashboard_data)
}

#[command]
pub async fn update_dashboard_config(config: DashboardConfig) -> Result<(), String> {
    info!("⚙️ Updating dashboard configuration...");
    
    // Validate configuration values
    if config.refresh_interval_ms < 1000 {
        return Err("Refresh interval must be at least 1000ms".to_string());
    }
    
    // Store configuration (in a real implementation, this would persist to storage)
    info!("✅ Dashboard configuration updated successfully");
    info!("📊 New config: refresh_interval={}ms, auto_refresh={}, theme={}", 
          config.refresh_interval_ms, config.auto_refresh_enabled, config.theme);
    
    Ok(())
}

// Helper functions
fn calculate_memory_usage_percentage(hardware: &serde_json::Value) -> f32 {
    let total = hardware.get("ram_total_mb").and_then(|v| v.as_u64()).unwrap_or(0) as f32;
    let available = hardware.get("ram_available_mb").and_then(|v| v.as_u64()).unwrap_or(0) as f32;
    
    if total > 0.0 {
        ((total - available) / total) * 100.0
    } else {
        0.0
    }
}
