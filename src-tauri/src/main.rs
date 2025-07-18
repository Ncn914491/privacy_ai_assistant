// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use env_logger;
use log::info;

mod commands;
// mod lib;
mod llm;
mod stt_tts;

use commands::*;
use llm::*;
use stt_tts::*;

fn main() {
    env_logger::init();
    info!("Starting Privacy AI Assistant");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_system_info,
            log_message,
            invoke_llm_prompt,
            generate_llm_response,
            check_llm_health,
            run_vosk_stt,
            run_piper_tts,
            get_tts_config,
            set_tts_config,
            test_audio_devices,
            test_tauri_connection,
            get_diagnostic_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
