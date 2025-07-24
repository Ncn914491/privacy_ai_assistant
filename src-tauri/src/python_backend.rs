use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::command;
use log::{info, error, warn};
use reqwest;
use tokio::time::timeout;

// Python backend configuration
const PYTHON_BACKEND_URL: &str = "http://127.0.0.1:8000";
const BACKEND_STARTUP_TIMEOUT: Duration = Duration::from_secs(15);

// Global backend process handle
static BACKEND_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
pub struct BackendHealthResponse {
    pub status: String,
    pub vosk_initialized: bool,
    pub timestamp: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMRequest {
    pub prompt: String,
    pub model: String,
    pub stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMResponse {
    pub response: String,
    pub model: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModelsResponse {
    pub models: Vec<OllamaModel>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub digest: String,
}

/// Start the Python backend server
#[command]
pub async fn start_python_backend() -> Result<String, String> {
    info!("🐍 Starting Python backend server...");
    
    // Check if already running
    if is_backend_running().await {
        info!("✅ Python backend already running");
        return Ok("Backend already running".to_string());
    }
    
    // Start the Python server process
    let process = Command::new("python")
        .arg("python_backend_server.py")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            error!("❌ Failed to start Python backend: {}", e);
            format!("Failed to start Python backend: {}", e)
        })?;
    
    info!("🚀 Python backend process started with PID: {:?}", process.id());
    
    // Store the process handle
    {
        let mut backend_process = BACKEND_PROCESS.lock().unwrap();
        *backend_process = Some(process);
    }
    
    // Wait for backend to be ready
    let start_time = std::time::Instant::now();
    while start_time.elapsed() < BACKEND_STARTUP_TIMEOUT {
        if is_backend_running().await {
            info!("✅ Python backend is ready and responding");
            return Ok("Backend started successfully".to_string());
        }
        
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    
    error!("❌ Python backend failed to start within timeout");
    Err("Backend startup timeout".to_string())
}

/// Stop the Python backend server
#[command]
pub async fn stop_python_backend() -> Result<String, String> {
    info!("⏹️ Stopping Python backend server...");
    
    let mut backend_process = BACKEND_PROCESS.lock().unwrap();
    
    if let Some(mut process) = backend_process.take() {
        match process.kill() {
            Ok(_) => {
                info!("✅ Python backend process terminated");
                Ok("Backend stopped successfully".to_string())
            }
            Err(e) => {
                error!("❌ Failed to kill Python backend process: {}", e);
                Err(format!("Failed to stop backend: {}", e))
            }
        }
    } else {
        warn!("⚠️ No Python backend process to stop");
        Ok("No backend process running".to_string())
    }
}

/// Check if Python backend is running and healthy
#[command]
pub async fn check_python_backend() -> Result<BackendHealthResponse, String> {
    info!("🔍 Checking Python backend health...");
    
    let client = reqwest::Client::new();
    
    match timeout(Duration::from_secs(3), client.get(&format!("{}/health", PYTHON_BACKEND_URL)).send()).await {
        Ok(Ok(response)) => {
            if response.status().is_success() {
                match response.json::<BackendHealthResponse>().await {
                    Ok(health) => {
                        info!("✅ Python backend is healthy: {:?}", health);
                        Ok(health)
                    }
                    Err(e) => {
                        error!("❌ Failed to parse backend health response: {}", e);
                        Err(format!("Failed to parse health response: {}", e))
                    }
                }
            } else {
                error!("❌ Backend health check returned status: {}", response.status());
                Err(format!("Backend returned status: {}", response.status()))
            }
        }
        Ok(Err(e)) => {
            error!("❌ Failed to connect to Python backend: {}", e);
            Err(format!("Connection failed: {}", e))
        }
        Err(_) => {
            error!("❌ Backend health check timed out");
            Err("Health check timeout".to_string())
        }
    }
}

/// Send LLM request to Python backend
#[command]
pub async fn send_llm_request_to_backend(prompt: String, model: Option<String>) -> Result<LLMResponse, String> {
    info!("🚀 Sending LLM request to Python backend...");
    info!("📝 Prompt length: {}", prompt.len());
    
    let request = LLMRequest {
        prompt,
        model: model.unwrap_or_else(|| "gemma3n:latest".to_string()),
        stream: false,
    };
    
    let client = reqwest::Client::new();
    
    match timeout(
        Duration::from_secs(60),
        client.post(&format!("{}/llm/generate", PYTHON_BACKEND_URL))
            .json(&request)
            .send()
    ).await {
        Ok(Ok(response)) => {
            if response.status().is_success() {
                match response.json::<LLMResponse>().await {
                    Ok(llm_response) => {
                        if llm_response.success {
                            info!("✅ LLM response received (length: {})", llm_response.response.len());
                            Ok(llm_response)
                        } else {
                            error!("❌ LLM request failed: {:?}", llm_response.error);
                            Err(llm_response.error.unwrap_or_else(|| "Unknown LLM error".to_string()))
                        }
                    }
                    Err(e) => {
                        error!("❌ Failed to parse LLM response: {}", e);
                        Err(format!("Failed to parse response: {}", e))
                    }
                }
            } else {
                let status_code = response.status();
                let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                error!("❌ Backend LLM request returned status {}: {}", status_code, error_text);
                Err(format!("Backend error {}: {}", status_code, error_text))
            }
        }
        Ok(Err(e)) => {
            error!("❌ Failed to send LLM request to backend: {}", e);
            Err(format!("Request failed: {}", e))
        }
        Err(_) => {
            error!("❌ LLM request to backend timed out");
            Err("Request timeout".to_string())
        }
    }
}

/// Check if backend is running by making a quick health check
async fn is_backend_running() -> bool {
    let client = reqwest::Client::new();
    
    match timeout(
        Duration::from_secs(2),
        client.get(&format!("{}/health", PYTHON_BACKEND_URL)).send()
    ).await {
        Ok(Ok(response)) => response.status().is_success(),
        _ => false,
    }
}

/// Get available Ollama models from backend
#[command]
pub async fn get_ollama_models_from_backend() -> Result<OllamaModelsResponse, String> {
    info!("📋 Getting Ollama models from Python backend...");
    
    let client = reqwest::Client::new();
    
    match timeout(
        Duration::from_secs(10),
        client.get(&format!("{}/ollama/models", PYTHON_BACKEND_URL)).send()
    ).await {
        Ok(Ok(response)) => {
            if response.status().is_success() {
                match response.json::<OllamaModelsResponse>().await {
                    Ok(models) => {
                        info!("✅ Retrieved {} Ollama models", models.models.len());
                        Ok(models)
                    }
                    Err(e) => {
                        error!("❌ Failed to parse models response: {}", e);
                        Err(format!("Failed to parse models: {}", e))
                    }
                }
            } else {
                let status_code = response.status();
                let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                error!("❌ Backend models request returned status {}: {}", status_code, error_text);
                Err(format!("Backend error {}: {}", status_code, error_text))
            }
        }
        Ok(Err(e)) => {
            error!("❌ Failed to get models from backend: {}", e);
            Err(format!("Request failed: {}", e))
        }
        Err(_) => {
            error!("❌ Models request to backend timed out");
            Err("Request timeout".to_string())
        }
    }
}

/// Cleanup function to stop backend on app shutdown
pub fn cleanup_backend() {
    info!("🧹 Cleaning up Python backend...");
    
    let mut backend_process = BACKEND_PROCESS.lock().unwrap();
    
    if let Some(mut process) = backend_process.take() {
        if let Err(e) = process.kill() {
            error!("❌ Failed to kill Python backend during cleanup: {}", e);
        } else {
            info!("✅ Python backend cleaned up successfully");
        }
    }
}
