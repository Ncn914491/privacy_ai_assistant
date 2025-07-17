// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use env_logger;
use log::info;

mod commands;
mod lib;

use commands::*;

fn main() {
    env_logger::init();
    info!("Starting Privacy AI Assistant");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            get_system_info,
            log_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
