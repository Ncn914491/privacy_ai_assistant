use serde::{Deserialize, Serialize};
use log::{info, error, warn};
use std::time::Duration;

// Configuration constants
const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const DEFAULT_MODEL: &str = "gemma3n"; // Gemma 3n model as requested by user
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120); // 2 minutes for LLM responses

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

        info!("Successfully generated LLM response");
        Ok(ollama_response.response)
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
    info!("Received LLM request with prompt length: {}", prompt.len());

    let client = LLMClient::new();
    
    match client.generate_response(prompt).await {
        Ok(response) => {
            info!("LLM response generated successfully");
            Ok(response)
        }
        Err(e) => {
            error!("LLM generation failed: {}", e);
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
