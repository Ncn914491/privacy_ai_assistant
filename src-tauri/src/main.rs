// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use env_logger;
use log::{info, warn};
use tauri::Manager;

mod commands;
mod llm;
mod stt_tts;
mod python_backend;
mod dashboard_api;
mod web_integration;
mod windows_integration;

use commands::*;
use llm::*;
use stt_tts::*;
use python_backend::*;

#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

fn main() {
    env_logger::init();
    info!("Starting Privacy AI Assistant");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Configure window for desktop experience
            window.show().unwrap();
            window.set_focus().unwrap();
            window.center().unwrap();

            // Set up system tray if available (Tauri v2 API)
            #[cfg(target_os = "windows")]
            {
                info!("Setting up system tray for Windows");
                // System tray is configured in tauri.conf.json for Tauri v2
                // Event handling will be added later if needed
            }

            // Initialize Windows-specific features (simplified for initial build)
            info!("Windows desktop mode initialized");

            info!("Privacy AI Assistant desktop application initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // General commands
            ping,
            get_app_version,
            get_system_info,
            log_message,
            test_tauri_connection,
            get_diagnostic_info,

            // LLM commands
            invoke_llm_prompt,
            generate_llm_response,
            check_llm_health,
            check_ollama_service, // New diagnostic command
            test_gemma_model,     // New diagnostic command
            start_llm_stream,
            stop_llm_stream,
            test_streaming,

            // Python backend commands
            start_python_backend,
            stop_python_backend,
            check_python_backend,
            send_llm_request_to_backend,
            get_ollama_models_from_backend,

            // Chat session management commands
            create_chat_session,
            list_chat_sessions,
            get_chat_session,
            rename_chat_session,
            delete_chat_session,
            add_message_to_chat,
            get_chat_context,

            // Hardware detection commands
            get_hardware_info,
            get_runtime_config,
            refresh_hardware_detection,

            // Context-aware LLM commands
            generate_chat_llm_response,

            // STT/TTS commands
            run_vosk_stt,
            run_piper_tts,
            get_tts_config,
            set_tts_config,
            test_audio_devices,
            test_stt_debug,
            test_path_escaping,
            test_static_file_stt,
            process_audio_file,
            process_audio_data,
            vosk_transcribe,
            test_vosk_installation,
            stt_tts::start_continuous_voice_chat,

            // Dashboard API commands
            dashboard_api::generate_dashboard_token,
            dashboard_api::validate_dashboard_token,
            dashboard_api::get_hardware_metrics,
            dashboard_api::get_model_status,
            dashboard_api::get_tool_metrics,
            dashboard_api::update_dashboard_config,

            // Web integration commands
            web_integration::search_web,
            web_integration::navigate_to_url,
            web_integration::extract_page_content,
            web_integration::check_robots_txt,

            // Windows integration commands
            windows_integration::get_window_state,
            windows_integration::toggle_window_visibility,
            windows_integration::set_always_on_top,
            windows_integration::minimize_to_tray,
            windows_integration::restore_from_tray,
            windows_integration::get_windows_system_info,
            windows_integration::is_desktop_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
