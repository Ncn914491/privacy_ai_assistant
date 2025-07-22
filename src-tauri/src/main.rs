// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use env_logger;
use log::info;
use tauri::Manager;

mod commands;
mod llm;
mod stt_tts;
mod python_backend;

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
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            window.set_focus().unwrap();
            info!("Tauri window opened and focused");
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
            test_vosk_installation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
