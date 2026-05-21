use crate::db::{AppError, Database, NoteDto};

#[tauri::command]
pub fn app_ready() -> Result<String, String> {
    Ok("ready".to_string())
}

#[tauri::command]
pub fn show_overlay(app: tauri::AppHandle, database: tauri::State<Database>) -> Result<(), String> {
    crate::window::show_overlay(&app, &database).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    crate::window::hide_overlay(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn center_overlay(app: tauri::AppHandle) -> Result<(), String> {
    crate::window::center_overlay(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_window_size(
    database: tauri::State<Database>,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    database.set_setting("window.width".to_string(), width.to_string())?;
    database.set_setting("window.height".to_string(), height.to_string())
}

#[tauri::command]
pub fn create_note(database: tauri::State<Database>, content: String) -> Result<NoteDto, AppError> {
    database.create_note(content)
}

#[tauri::command]
pub fn update_note(
    database: tauri::State<Database>,
    id: String,
    content: String,
) -> Result<NoteDto, AppError> {
    database.update_note(id, content)
}

#[tauri::command]
pub fn list_notes(
    database: tauri::State<Database>,
    limit: Option<u32>,
) -> Result<Vec<NoteDto>, AppError> {
    database.list_notes(limit)
}

#[tauri::command]
pub fn get_note(database: tauri::State<Database>, id: String) -> Result<Option<NoteDto>, AppError> {
    database.get_note(id)
}

#[tauri::command]
pub fn set_pinned(
    database: tauri::State<Database>,
    id: String,
    pinned: bool,
) -> Result<NoteDto, AppError> {
    database.set_pinned(id, pinned)
}

#[tauri::command]
pub fn delete_empty_note(database: tauri::State<Database>, id: String) -> Result<(), AppError> {
    database.delete_empty_note(id)
}

#[tauri::command]
pub fn get_setting(
    database: tauri::State<Database>,
    key: String,
) -> Result<Option<String>, AppError> {
    database.get_setting(key)
}

#[tauri::command]
pub fn set_setting(
    database: tauri::State<Database>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    database.set_setting(key, value)
}
