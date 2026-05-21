#[tauri::command]
pub fn app_ready() -> Result<String, String> {
    Ok("ready".to_string())
}

#[tauri::command]
pub fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    crate::window::show_overlay(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    crate::window::hide_overlay(&app).map_err(|error| error.to_string())
}

