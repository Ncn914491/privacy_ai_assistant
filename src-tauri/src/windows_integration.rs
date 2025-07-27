use tauri::{AppHandle, Manager, Window};
use log::{info, warn, error};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WindowState {
    pub is_visible: bool,
    pub is_focused: bool,
    pub is_minimized: bool,
    pub is_maximized: bool,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NotificationPayload {
    pub title: String,
    pub body: String,
    pub icon: Option<String>,
    pub sound: Option<String>,
}

/// Initialize Windows-specific features
pub fn initialize_windows_features(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    info!("🪟 Initializing Windows-specific features...");

    // Configure window behavior
    setup_window_behavior(app)?;

    info!("✅ Windows features initialized successfully");
    Ok(())
}



/// Configure window behavior for desktop experience
fn setup_window_behavior(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        // Set up window event listeners
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Prevent closing, minimize to system tray instead
                    api.prevent_close();
                    let _ = window_clone.hide();
                    info!("🔽 Application minimized to system tray");
                }
                tauri::WindowEvent::Focused(focused) => {
                    if *focused {
                        info!("🎯 Application window focused");
                    }
                }
                tauri::WindowEvent::Resized(size) => {
                    info!("📏 Window resized to {}x{}", size.width, size.height);
                }
                _ => {}
            }
        });
        
        // Set minimum window size for optimal UI
        window.set_min_size(Some(tauri::LogicalSize::new(1000.0, 700.0)))?;
        
        info!("🪟 Window behavior configured for desktop experience");
    }
    
    Ok(())
}



/// Get current window state
#[tauri::command]
pub async fn get_window_state(window: Window) -> Result<WindowState, String> {
    let is_visible = window.is_visible().map_err(|e| e.to_string())?;
    let is_focused = window.is_focused().map_err(|e| e.to_string())?;
    let is_minimized = window.is_minimized().map_err(|e| e.to_string())?;
    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;
    
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    
    Ok(WindowState {
        is_visible,
        is_focused,
        is_minimized,
        is_maximized,
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
    })
}

/// Toggle window visibility
#[tauri::command]
pub async fn toggle_window_visibility(window: Window) -> Result<String, String> {
    let is_visible = window.is_visible().map_err(|e| e.to_string())?;
    
    if is_visible {
        window.hide().map_err(|e| e.to_string())?;
        Ok("Window hidden".to_string())
    } else {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        Ok("Window shown".to_string())
    }
}

/// Set window always on top
#[tauri::command]
pub async fn set_always_on_top(window: Window, always_on_top: bool) -> Result<String, String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    
    let status = if always_on_top { "enabled" } else { "disabled" };
    Ok(format!("Always on top {}", status))
}

/// Minimize window to system tray
#[tauri::command]
pub async fn minimize_to_tray(window: Window) -> Result<String, String> {
    window.hide().map_err(|e| e.to_string())?;
    info!("🔽 Application minimized to system tray");
    Ok("Minimized to tray".to_string())
}

/// Restore window from system tray
#[tauri::command]
pub async fn restore_from_tray(window: Window) -> Result<String, String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    info!("🔼 Application restored from system tray");
    Ok("Restored from tray".to_string())
}

/// Get system information for Windows
#[tauri::command]
pub async fn get_windows_system_info() -> Result<serde_json::Value, String> {
    use std::env;
    
    let mut info = serde_json::Map::new();
    
    // Operating system information
    info.insert("os".to_string(), serde_json::Value::String("Windows".to_string()));
    info.insert("arch".to_string(), serde_json::Value::String(env::consts::ARCH.to_string()));
    
    // Environment variables
    if let Ok(username) = env::var("USERNAME") {
        info.insert("username".to_string(), serde_json::Value::String(username));
    }
    
    if let Ok(computer_name) = env::var("COMPUTERNAME") {
        info.insert("computer_name".to_string(), serde_json::Value::String(computer_name));
    }
    
    if let Ok(user_profile) = env::var("USERPROFILE") {
        info.insert("user_profile".to_string(), serde_json::Value::String(user_profile));
    }
    
    // Application data paths
    if let Ok(appdata) = env::var("APPDATA") {
        info.insert("appdata".to_string(), serde_json::Value::String(appdata));
    }
    
    if let Ok(localappdata) = env::var("LOCALAPPDATA") {
        info.insert("localappdata".to_string(), serde_json::Value::String(localappdata));
    }
    
    Ok(serde_json::Value::Object(info))
}

/// Check if running in Windows desktop mode
#[tauri::command]
pub async fn is_desktop_mode() -> Result<bool, String> {
    // Always true for Tauri desktop applications
    Ok(true)
}
