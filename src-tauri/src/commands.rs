use serde::{Deserialize, Serialize};
use std::env;
use std::process::Command;
use log::{info, error, warn};
use chrono::{DateTime, Utc};
use reqwest;

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
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(CommandError::Reqwest)?;
    
    match client.get("http://localhost:11434/api/version").send().await {
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
            error!("❌ Failed to connect to Ollama service (timeout or connection error): {}", e);
            // Return false instead of error to prevent UI blocking
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn test_gemma_model() -> Result<bool, CommandError> {
    info!("Testing Gemma 3n model...");
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))  // Increased timeout for model loading
        .build()
        .map_err(CommandError::Reqwest)?;
    
    let payload = serde_json::json!({
        "model": "gemma3n:latest",
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
            error!("❌ Failed to get response from Gemma model (timeout or connection error): {}", e);
            // Return false instead of error to prevent UI blocking
            Ok(false)
        }
    }
}

// ===== CHAT SESSION MANAGEMENT COMMANDS =====

const PYTHON_BACKEND_URL: &str = "http://127.0.0.1:8000";

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSessionSummary {
    pub id: String,
    pub title: String,
    pub message_count: i32,
    pub last_activity: String,
    pub created_at: String,
    pub is_archived: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub content: String,
    pub role: String,
    pub timestamp: String,
    pub token_count: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateChatRequest {
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateChatResponse {
    pub chat_id: String,
    pub title: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatListResponse {
    pub sessions: Vec<ChatSessionSummary>,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSessionResponse {
    pub session: Option<ChatSession>,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn create_chat_session(title: Option<String>) -> Result<CreateChatResponse, CommandError> {
    info!("Creating new chat session with title: {:?}", title);

    let client = reqwest::Client::new();
    let request = CreateChatRequest { title };

    match client
        .post(&format!("{}/chats/create", PYTHON_BACKEND_URL))
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let chat_response: CreateChatResponse = response.json().await?;
                info!("✅ Created chat session: {}", chat_response.chat_id);
                Ok(chat_response)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to create chat session: {}", error_msg);
                Ok(CreateChatResponse {
                    chat_id: String::new(),
                    title: String::new(),
                    success: false,
                    error: Some(error_msg),
                })
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn list_chat_sessions() -> Result<ChatListResponse, CommandError> {
    info!("Listing chat sessions");

    let client = reqwest::Client::new();

    match client
        .get(&format!("{}/chats/list", PYTHON_BACKEND_URL))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let chat_list: ChatListResponse = response.json().await?;
                info!("✅ Retrieved {} chat sessions", chat_list.sessions.len());
                Ok(chat_list)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to list chat sessions: {}", error_msg);
                Ok(ChatListResponse {
                    sessions: vec![],
                    success: false,
                    error: Some(error_msg),
                })
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn get_chat_session(chat_id: String) -> Result<ChatSessionResponse, CommandError> {
    info!("Getting chat session: {}", chat_id);

    let client = reqwest::Client::new();

    match client
        .get(&format!("{}/chats/{}", PYTHON_BACKEND_URL, chat_id))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let session_response: ChatSessionResponse = response.json().await?;
                info!("✅ Retrieved chat session: {}", chat_id);
                Ok(session_response)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to get chat session: {}", error_msg);
                Ok(ChatSessionResponse {
                    session: None,
                    success: false,
                    error: Some(error_msg),
                })
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn rename_chat_session(chat_id: String, new_title: String) -> Result<serde_json::Value, CommandError> {
    info!("Renaming chat session {} to '{}'", chat_id, new_title);

    let client = reqwest::Client::new();
    let request = serde_json::json!({
        "chat_id": chat_id,
        "new_title": new_title
    });

    match client
        .put(&format!("{}/chats/{}/rename", PYTHON_BACKEND_URL, chat_id))
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                info!("✅ Renamed chat session: {}", chat_id);
                Ok(result)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to rename chat session: {}", error_msg);
                Ok(serde_json::json!({
                    "success": false,
                    "error": error_msg
                }))
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn delete_chat_session(chat_id: String) -> Result<serde_json::Value, CommandError> {
    info!("Deleting chat session: {}", chat_id);

    let client = reqwest::Client::new();

    match client
        .delete(&format!("{}/chats/{}", PYTHON_BACKEND_URL, chat_id))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                info!("✅ Deleted chat session: {}", chat_id);
                Ok(result)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to delete chat session: {}", error_msg);
                Ok(serde_json::json!({
                    "success": false,
                    "error": error_msg
                }))
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn add_message_to_chat(chat_id: String, content: String, role: String) -> Result<serde_json::Value, CommandError> {
    info!("Adding {} message to chat {}", role, chat_id);

    let client = reqwest::Client::new();
    let request = serde_json::json!({
        "chat_id": chat_id,
        "content": content,
        "role": role
    });

    match client
        .post(&format!("{}/chats/{}/messages", PYTHON_BACKEND_URL, chat_id))
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                info!("✅ Added message to chat: {}", chat_id);
                Ok(result)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to add message to chat: {}", error_msg);
                Ok(serde_json::json!({
                    "success": false,
                    "error": error_msg
                }))
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn get_chat_context(chat_id: String, system_prompt: Option<String>) -> Result<serde_json::Value, CommandError> {
    info!("Getting context for chat: {}", chat_id);

    let client = reqwest::Client::new();
    let mut url = format!("{}/chats/{}/context", PYTHON_BACKEND_URL, chat_id);

    if let Some(prompt) = system_prompt {
        url = format!("{}?system_prompt={}", url, urlencoding::encode(&prompt));
    }

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                info!("✅ Retrieved context for chat: {}", chat_id);
                Ok(result)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to get chat context: {}", error_msg);
                Ok(serde_json::json!({
                    "success": false,
                    "error": error_msg
                }))
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

// ===== HARDWARE DETECTION COMMANDS =====

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub cpu_cores: i32,
    pub ram_total_mb: Option<i32>,
    pub ram_available_mb: Option<i32>,
    pub has_gpu: bool,
    pub gpu_name: Option<String>,
    pub vram_total_mb: Option<i32>,
    pub vram_available_mb: Option<i32>,
    pub platform: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub mode: String,
    pub reason: String,
    pub ollama_args: Vec<String>,
    pub recommended_models: Vec<String>,
    pub hardware_info: HardwareInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HardwareResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub config: Option<RuntimeConfig>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<HardwareResponse, CommandError> {
    info!("Getting hardware information");

    let client = reqwest::Client::new();

    match client
        .get(&format!("{}/hardware/info", PYTHON_BACKEND_URL))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                info!("✅ Retrieved hardware information");
                Ok(HardwareResponse {
                    success: true,
                    data: Some(result),
                    config: None,
                    error: None,
                })
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to get hardware info: {}", error_msg);
                Ok(HardwareResponse {
                    success: false,
                    data: None,
                    config: None,
                    error: Some(error_msg),
                })
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn get_runtime_config() -> Result<HardwareResponse, CommandError> {
    info!("Getting optimal runtime configuration");

    let client = reqwest::Client::new();

    match client
        .get(&format!("{}/hardware/runtime-config", PYTHON_BACKEND_URL))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;

                // Try to parse the config
                if let Some(config_data) = result.get("config") {
                    if let Ok(config) = serde_json::from_value::<RuntimeConfig>(config_data.clone()) {
                        info!("✅ Retrieved runtime configuration: {}", config.mode);
                        return Ok(HardwareResponse {
                            success: true,
                            data: Some(result),
                            config: Some(config),
                            error: None,
                        });
                    }
                }

                info!("✅ Retrieved runtime configuration (raw)");
                Ok(HardwareResponse {
                    success: true,
                    data: Some(result),
                    config: None,
                    error: None,
                })
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to get runtime config: {}", error_msg);
                Ok(HardwareResponse {
                    success: false,
                    data: None,
                    config: None,
                    error: Some(error_msg),
                })
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

#[tauri::command]
pub async fn refresh_hardware_detection() -> Result<serde_json::Value, CommandError> {
    info!("Refreshing hardware detection");

    let client = reqwest::Client::new();

    match client
        .post(&format!("{}/hardware/refresh", PYTHON_BACKEND_URL))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let result: serde_json::Value = response.json().await?;
                info!("✅ Hardware detection refreshed");
                Ok(result)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to refresh hardware detection: {}", error_msg);
                Ok(serde_json::json!({
                    "success": false,
                    "error": error_msg
                }))
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}

// ===== CONTEXT-AWARE LLM COMMANDS =====

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatLLMRequest {
    pub chat_id: String,
    pub prompt: String,
    pub model: String,
    pub stream: Option<bool>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMResponse {
    pub response: String,
    pub model: String,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn generate_chat_llm_response(
    chat_id: String,
    prompt: String,
    model: String,
    system_prompt: Option<String>,
    stream: Option<bool>
) -> Result<LLMResponse, CommandError> {
    info!("Generating context-aware LLM response for chat: {}", chat_id);

    let client = reqwest::Client::new();
    let request = ChatLLMRequest {
        chat_id,
        prompt,
        model,
        stream,
        system_prompt,
    };

    match client
        .post(&format!("{}/llm/chat-generate", PYTHON_BACKEND_URL))
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let llm_response: LLMResponse = response.json().await?;
                if llm_response.success {
                    info!("✅ Generated context-aware response (length: {})", llm_response.response.len());
                } else {
                    error!("❌ LLM generation failed: {:?}", llm_response.error);
                }
                Ok(llm_response)
            } else {
                let error_msg = format!("Backend returned status: {}", response.status());
                error!("❌ Failed to generate LLM response: {}", error_msg);
                Ok(LLMResponse {
                    response: String::new(),
                    model: request.model,
                    success: false,
                    error: Some(error_msg),
                })
            }
        }
        Err(e) => {
            error!("❌ Request failed: {}", e);
            Err(CommandError::Reqwest(e))
        }
    }
}
