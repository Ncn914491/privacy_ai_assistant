use serde::{Deserialize, Serialize};
use log::{info, error, warn};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// Configuration constants
const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const DEFAULT_MODEL: &str = "gemma3n"; // Gemma 3n model as requested by user
const REQUEST_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes for large LLM responses

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaRequest {
    pub model: String,
    pub prompt: String,
    pub stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaResponse {
    pub model: String,
    pub created_at: String,
    pub response: String,
    pub done: bool,
    pub context: Option<Vec<i32>>,
    pub total_duration: Option<u64>,
    pub load_duration: Option<u64>,
    pub prompt_eval_count: Option<u32>,
    pub prompt_eval_duration: Option<u64>,
    pub eval_count: Option<u32>,
    pub eval_duration: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LLMConfig {
    pub model: String,
    pub base_url: String,
    pub timeout_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEvent {
    pub stream_id: String,
    pub event_type: String,
    pub data: String,
}

impl Default for LLMConfig {
    fn default() -> Self {
        Self {
            model: DEFAULT_MODEL.to_string(),
            base_url: OLLAMA_BASE_URL.to_string(),
            timeout_seconds: REQUEST_TIMEOUT.as_secs(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LLMError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Ollama service unavailable: {0}")]
    ServiceUnavailable(String),
    #[error("Invalid response format: {0}")]
    InvalidResponse(String),
    #[error("Request timeout")]
    Timeout,
    #[error("Empty prompt provided")]
    EmptyPrompt,
}

pub struct LLMClient {
    client: reqwest::Client,
    config: LLMConfig,
}

impl LLMClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            config: LLMConfig::default(),
        }
    }

    pub fn with_config(config: LLMConfig) -> Self {
        let timeout = Duration::from_secs(config.timeout_seconds);
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .expect("Failed to create HTTP client");

        Self { client, config }
    }

    pub async fn generate_response(&self, prompt: String) -> Result<String, LLMError> {
        if prompt.trim().is_empty() {
            return Err(LLMError::EmptyPrompt);
        }

        info!("Generating LLM response for prompt length: {}", prompt.len());

        let request = OllamaRequest {
            model: self.config.model.clone(),
            prompt: prompt.clone(),
            stream: false,
        };

        let url = format!("{}/api/generate", self.config.base_url);
        
        info!("Sending request to Ollama at: {}", url);

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                error!("Failed to send request to Ollama: {}", e);
                if e.is_timeout() {
                    LLMError::Timeout
                } else if e.is_connect() {
                    LLMError::ServiceUnavailable(format!(
                        "Cannot connect to Ollama service. Please ensure Ollama is running and the Gemma 3n model is available."
                    ))
                } else {
                    LLMError::Network(e)
                }
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            error!("Ollama API error {}: {}", status, error_text);

            // Provide specific error messages for common issues
            let error_message = if status.as_u16() == 404 {
                if error_text.contains("model") && error_text.contains("not found") {
                    format!("Gemma 3n model not found. Please ensure the model is installed via: ollama pull gemma3n")
                } else {
                    format!("Ollama API endpoint not found. Please ensure Ollama is running on localhost:11434")
                }
            } else if status.as_u16() == 500 {
                format!("Ollama service error. The model may be loading or encountering issues.")
            } else {
                format!("Ollama API returned error {}: {}", status, error_text)
            };

            return Err(LLMError::ServiceUnavailable(error_message));
        }

        // Log response text for debugging
        let response_text = response.text().await.map_err(|e| {
            error!("Failed to get response text: {}", e);
            LLMError::Network(e)
        })?;
        
        info!("Raw Ollama response: {}", response_text);
        
        let ollama_response: OllamaResponse = serde_json::from_str(&response_text)
            .map_err(|e| {
                error!("Failed to parse Ollama response JSON: {}", e);
                error!("Response text was: {}", response_text);
                LLMError::InvalidResponse(format!(
                    "Empty or malformed response from Ollama API"
                ))
            })?;

        if ollama_response.response.trim().is_empty() {
            warn!("Received empty response from Ollama");
            return Err(LLMError::InvalidResponse(
                "Received empty response from LLM".to_string(),
            ));
        }

        info!("Successfully generated LLM response (length: {} chars)", ollama_response.response.len());
        Ok(ollama_response.response)
    }

    // Generate response with better error handling for large responses
    pub async fn generate_response_robust(&self, prompt: String) -> Result<String, LLMError> {
        if prompt.trim().is_empty() {
            return Err(LLMError::EmptyPrompt);
        }

        info!("🚀 Generating robust LLM response for prompt length: {}", prompt.len());

        // For very long prompts, we might want to chunk them
        if prompt.len() > 8000 {
            warn!("⚠️ Very long prompt detected ({}). Consider chunking for better performance.", prompt.len());
        }

        let request = OllamaRequest {
            model: self.config.model.clone(),
            prompt: prompt.clone(),
            stream: false,
        };

        let url = format!("{}/api/generate", self.config.base_url);

        info!("📡 Sending robust request to Ollama at: {}", url);

        // Add retry logic for large responses
        let mut attempts = 0;
        const MAX_ATTEMPTS: u32 = 3;

        while attempts < MAX_ATTEMPTS {
            attempts += 1;
            info!("🔄 Attempt {} of {}", attempts, MAX_ATTEMPTS);

            match self.client
                .post(&url)
                .json(&request)
                .send()
                .await
            {
                Ok(response) => {
                    if !response.status().is_success() {
                        let status = response.status();
                        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                        error!("❌ Ollama API error {}: {}", status, error_text);

                        if attempts >= MAX_ATTEMPTS {
                            return Err(LLMError::ServiceUnavailable(format!(
                                "Ollama API returned error {} after {} attempts: {}",
                                status, MAX_ATTEMPTS, error_text
                            )));
                        }

                        // Wait before retry
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }

                    // Process successful response
                    let response_text = response.text().await.map_err(|e| {
                        error!("❌ Failed to get response text: {}", e);
                        LLMError::Network(e)
                    })?;

                    info!("📦 Raw Ollama response length: {} chars", response_text.len());

                    let ollama_response: OllamaResponse = serde_json::from_str(&response_text)
                        .map_err(|e| {
                            error!("❌ Failed to parse Ollama response JSON: {}", e);
                            error!("Response text preview: {}",
                                if response_text.len() > 200 {
                                    format!("{}...", &response_text[..200])
                                } else {
                                    response_text.clone()
                                }
                            );
                            LLMError::InvalidResponse(format!(
                                "Failed to parse JSON response from Ollama API"
                            ))
                        })?;

                    if ollama_response.response.trim().is_empty() {
                        warn!("⚠️ Received empty response from Ollama on attempt {}", attempts);
                        if attempts >= MAX_ATTEMPTS {
                            return Err(LLMError::InvalidResponse(
                                "Received empty response from LLM after multiple attempts".to_string(),
                            ));
                        }
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        continue;
                    }

                    info!("✅ Successfully generated robust LLM response (length: {} chars)", ollama_response.response.len());
                    return Ok(ollama_response.response);
                }
                Err(e) => {
                    error!("❌ Request failed on attempt {}: {}", attempts, e);

                    if attempts >= MAX_ATTEMPTS {
                        if e.is_timeout() {
                            return Err(LLMError::Timeout);
                        } else if e.is_connect() {
                            return Err(LLMError::ServiceUnavailable(format!(
                                "Cannot connect to Ollama service after {} attempts. Please ensure Ollama is running and the Gemma 3n model is available.", MAX_ATTEMPTS
                            )));
                        } else {
                            return Err(LLMError::Network(e));
                        }
                    }

                    // Wait before retry
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }

        Err(LLMError::ServiceUnavailable("Max attempts reached".to_string()))
    }

    pub async fn check_health(&self) -> Result<bool, LLMError> {
        info!("Checking LLM health - verifying Ollama service and model availability");

        // First check if Ollama service is running
        let tags_url = format!("{}/api/tags", self.config.base_url);

        let tags_response = match self.client.get(&tags_url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    info!("Ollama service not responding properly");
                    return Ok(false);
                }
                response
            }
            Err(e) => {
                if e.is_connect() {
                    info!("Cannot connect to Ollama service");
                    return Ok(false);
                } else {
                    return Err(LLMError::Network(e));
                }
            }
        };

        // Check if our specific model is available
        match tags_response.text().await {
            Ok(tags_text) => {
                info!("Available models response: {}", tags_text);
                // Check if the response contains our model
                let has_model = tags_text.contains(&self.config.model) || tags_text.contains("gemma3n");
                if has_model {
                    info!("✅ Gemma 3n model found in available models");
                } else {
                    info!("⚠️ Gemma 3n model not found in available models");
                }
                Ok(has_model)
            }
            Err(e) => {
                error!("Failed to read tags response: {}", e);
                Err(LLMError::Network(e))
            }
        }
    }
}

#[tauri::command]
pub async fn generate_llm_response(prompt: String) -> Result<String, String> {
    info!("🚀 Received LLM request with prompt length: {}", prompt.len());

    let client = LLMClient::new();

    // Use robust method for better handling of large responses
    match client.generate_response_robust(prompt).await {
        Ok(response) => {
            info!("✅ LLM response generated successfully (length: {} chars)", response.len());
            Ok(response)
        }
        Err(e) => {
            error!("❌ LLM generation failed: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn check_llm_health() -> Result<bool, String> {
    info!("Checking LLM service health");

    let client = LLMClient::new();
    
    match client.check_health().await {
        Ok(is_healthy) => {
            info!("LLM health check result: {}", is_healthy);
            Ok(is_healthy)
        }
        Err(e) => {
            error!("LLM health check failed: {}", e);
            Err(e.to_string())
        }
    }
}

// Streaming LLM response command
#[tauri::command]
pub async fn start_llm_stream(app_handle: AppHandle, prompt: String) -> Result<String, String> {
    info!("🚀 Starting LLM stream for prompt (length: {}): {}", prompt.len(), prompt);

    if prompt.trim().is_empty() {
        error!("❌ Empty prompt provided");
        return Err("Prompt cannot be empty".to_string());
    }

    // Generate a unique stream ID
    let stream_id = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => format!("stream_{}", duration.as_millis()),
        Err(e) => {
            error!("❌ Failed to generate stream ID: {}", e);
            return Err("Failed to generate stream ID".to_string());
        }
    };

    info!("📡 Created stream ID: {}", stream_id);

    // Clone stream_id for the spawn task
    let stream_id_clone = stream_id.clone();

    // Start the streaming process in the background
    info!("🚀 Spawning background streaming task...");
    tokio::spawn(async move {
        info!("🔄 Background task started for stream: {}", stream_id_clone);
        if let Err(e) = stream_llm_response(app_handle, stream_id_clone.clone(), prompt).await {
            error!("❌ Stream error for {}: {}", stream_id_clone, e);
        } else {
            info!("✅ Background task completed for stream: {}", stream_id_clone);
        }
    });

    info!("✅ Stream command returning ID: {}", stream_id);
    Ok(stream_id)
}

// Stop streaming command
#[tauri::command]
pub async fn stop_llm_stream(stream_id: String) -> Result<(), String> {
    info!("⏹️ Stopping LLM stream: {}", stream_id);
    // TODO: Implement stream cancellation
    Ok(())
}

// Test streaming command for debugging
#[tauri::command]
pub async fn test_streaming(app_handle: AppHandle) -> Result<String, String> {
    info!("🧪 Testing streaming functionality");

    let test_stream_id = "test_stream_123".to_string();
    let test_response = "This is a test streaming response to verify the functionality works correctly.";

    // Simulate streaming by sending chunks
    let words: Vec<&str> = test_response.split_whitespace().collect();
    let chunk_size = 2;

    info!("🔄 Starting test stream with {} chunks", words.chunks(chunk_size).len());

    for (i, chunk) in words.chunks(chunk_size).enumerate() {
        let chunk_text = chunk.join(" ") + " ";
        info!("📤 Test chunk {}: '{}'", i + 1, chunk_text);
        emit_stream_chunk(&app_handle, &test_stream_id, &chunk_text).await;
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    emit_stream_complete(&app_handle, &test_stream_id).await;
    info!("✅ Test streaming completed");

    Ok(test_stream_id)
}

// Internal streaming function
async fn stream_llm_response(app_handle: AppHandle, stream_id: String, prompt: String) -> Result<(), String> {
    info!("🔄 Starting stream processing for: {} (prompt length: {})", stream_id, prompt.len());

    // Try Ollama streaming first
    match stream_ollama_response(&app_handle, &stream_id, &prompt).await {
        Ok(_) => {
            info!("✅ Ollama streaming completed for: {}", stream_id);
            Ok(())
        }
        Err(e) => {
            warn!("⚠️ Ollama streaming failed for {}: {}, trying fallback", stream_id, e);
            // Fallback to non-streaming response
            match stream_fallback_response(&app_handle, &stream_id, &prompt).await {
                Ok(_) => {
                    info!("✅ Fallback streaming completed for: {}", stream_id);
                    Ok(())
                }
                Err(fallback_error) => {
                    error!("❌ Both Ollama and fallback streaming failed for {}: {}", stream_id, fallback_error);
                    emit_stream_error(&app_handle, &stream_id, &format!("All streaming methods failed: {}", fallback_error)).await;
                    Err(fallback_error)
                }
            }
        }
    }
}

// Stream response from Ollama
async fn stream_ollama_response(app_handle: &AppHandle, stream_id: &str, prompt: &str) -> Result<(), String> {
    info!("📡 Streaming from Ollama for: {} (model: {})", stream_id, DEFAULT_MODEL);

    let request = OllamaRequest {
        model: DEFAULT_MODEL.to_string(),
        prompt: prompt.to_string(),
        stream: true,
    };

    info!("📤 Sending request to Ollama: {}/api/generate", OLLAMA_BASE_URL);

    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/api/generate", OLLAMA_BASE_URL))
        .json(&request)
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|e| {
            error!("❌ Failed to send request to Ollama: {}", e);
            format!("Failed to send request to Ollama: {}", e)
        })?;

    info!("📥 Received response from Ollama with status: {}", response.status());

    if !response.status().is_success() {
        let error_msg = format!("HTTP error from Ollama: {}", response.status());
        error!("❌ {}", error_msg);
        return Err(error_msg);
    }

    // Read the response text
    info!("📖 Reading response text from Ollama...");
    let response_text = response.text().await
        .map_err(|e| {
            error!("❌ Failed to read response text: {}", e);
            format!("Failed to read response: {}", e)
        })?;

    info!("📄 Received response text (length: {}): {}", response_text.len(),
          if response_text.len() > 200 {
              format!("{}...", &response_text[..200])
          } else {
              response_text.clone()
          });

    // Parse the response and simulate streaming
    match serde_json::from_str::<OllamaResponse>(&response_text) {
        Ok(ollama_response) => {
            info!("✅ Successfully parsed Ollama response");
            if !ollama_response.response.is_empty() {
                info!("📝 Response content (length: {}): {}", ollama_response.response.len(), ollama_response.response);

                // Simulate streaming by sending the response in chunks
                let words: Vec<&str> = ollama_response.response.split_whitespace().collect();
                let chunk_size = 2; // Send 2 words at a time

                info!("🔄 Starting to emit {} chunks ({} words total)", words.chunks(chunk_size).len(), words.len());

                for (i, chunk) in words.chunks(chunk_size).enumerate() {
                    let chunk_text = chunk.join(" ") + " ";
                    info!("📤 Emitting chunk {}: '{}'", i + 1, chunk_text);
                    emit_stream_chunk(app_handle, stream_id, &chunk_text).await;

                    // Small delay to simulate streaming
                    tokio::time::sleep(Duration::from_millis(30)).await;
                }

                info!("✅ All chunks emitted, sending completion signal");
                emit_stream_complete(app_handle, stream_id).await;
                return Ok(());
            } else {
                let error_msg = "Ollama response is empty";
                error!("❌ {}", error_msg);
                emit_stream_error(app_handle, stream_id, error_msg).await;
                return Err(error_msg.to_string());
            }
        }
        Err(e) => {
            let error_msg = format!("Failed to parse Ollama response: {}. Raw response: {}", e, response_text);
            error!("❌ {}", error_msg);
            emit_stream_error(app_handle, stream_id, &error_msg).await;
            return Err(error_msg);
        }
    }
}

// Fallback streaming (simulate streaming for non-streaming APIs)
async fn stream_fallback_response(app_handle: &AppHandle, stream_id: &str, prompt: &str) -> Result<(), String> {
    info!("🔄 Using fallback streaming for: {}", stream_id);

    // Generate response using existing robust method
    let client = LLMClient::new();
    match client.generate_response_robust(prompt.to_string()).await {
        Ok(response) => {
            // Simulate streaming by sending chunks
            let words: Vec<&str> = response.split_whitespace().collect();
            let chunk_size = 3; // Send 3 words at a time

            for chunk in words.chunks(chunk_size) {
                let chunk_text = chunk.join(" ") + " ";
                emit_stream_chunk(app_handle, stream_id, &chunk_text).await;

                // Small delay to simulate streaming
                tokio::time::sleep(Duration::from_millis(50)).await;
            }

            emit_stream_complete(app_handle, stream_id).await;
            Ok(())
        }
        Err(e) => {
            let error_msg = format!("LLM generation failed: {}", e);
            emit_stream_error(app_handle, stream_id, &error_msg).await;
            Err(error_msg)
        }
    }
}

// Emit functions with proper Tauri event emission
async fn emit_stream_chunk(app_handle: &AppHandle, stream_id: &str, chunk: &str) {
    info!("📤 Emitting chunk for {}: '{}'", stream_id, chunk);

    let event = StreamEvent {
        stream_id: stream_id.to_string(),
        event_type: "chunk".to_string(),
        data: chunk.to_string(),
    };

    let event_name = format!("llm_stream_{}", stream_id);
    if let Err(e) = app_handle.emit(&event_name, &event) {
        error!("❌ Failed to emit stream chunk: {}", e);
    } else {
        info!("✅ Successfully emitted chunk event: {}", event_name);
    }
}

async fn emit_stream_complete(app_handle: &AppHandle, stream_id: &str) {
    info!("✅ Stream complete for: {}", stream_id);

    let event = StreamEvent {
        stream_id: stream_id.to_string(),
        event_type: "complete".to_string(),
        data: "".to_string(),
    };

    let event_name = format!("llm_stream_{}", stream_id);
    if let Err(e) = app_handle.emit(&event_name, &event) {
        error!("❌ Failed to emit stream complete: {}", e);
    } else {
        info!("✅ Successfully emitted complete event: {}", event_name);
    }
}

async fn emit_stream_error(app_handle: &AppHandle, stream_id: &str, error: &str) {
    error!("❌ Stream error for {}: {}", stream_id, error);

    let event = StreamEvent {
        stream_id: stream_id.to_string(),
        event_type: "error".to_string(),
        data: error.to_string(),
    };

    let event_name = format!("llm_stream_{}", stream_id);
    if let Err(e) = app_handle.emit(&event_name, &event) {
        error!("❌ Failed to emit stream error: {}", e);
    } else {
        info!("✅ Successfully emitted error event: {}", event_name);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_llm_config_default() {
        let config = LLMConfig::default();
        assert_eq!(config.model, DEFAULT_MODEL);
        assert_eq!(config.base_url, OLLAMA_BASE_URL);
        assert_eq!(config.timeout_seconds, REQUEST_TIMEOUT.as_secs());
    }

    #[test]
    fn test_empty_prompt_error() {
        let client = LLMClient::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        
        let result = rt.block_on(client.generate_response("".to_string()));
        assert!(matches!(result, Err(LLMError::EmptyPrompt)));
    }
}
