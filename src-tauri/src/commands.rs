use crate::db::{AppError, Database, FolderDto, NoteDto};

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
pub fn persist_window_size_for_mode(
    app: tauri::AppHandle,
    database: tauri::State<Database>,
    mode: String,
) -> Result<(), String> {
    crate::window::persist_window_size_for_mode(&app, &database, &mode).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn register_shortcut(
    app: tauri::AppHandle,
    database: tauri::State<Database>,
    accelerator: String,
) -> Result<(), AppError> {
    crate::shortcuts::register_shortcut(&app, &database, accelerator)
}

#[tauri::command]
pub fn get_registered_shortcut(database: tauri::State<Database>) -> Result<String, AppError> {
    crate::shortcuts::registered_shortcut(&database)
}

#[tauri::command]
pub fn get_shortcut_failure(database: tauri::State<Database>) -> Result<Option<String>, AppError> {
    crate::shortcuts::shortcut_failure(&database)
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn create_note(
    database: tauri::State<Database>,
    content: String,
    created_at: Option<String>,
) -> Result<NoteDto, AppError> {
    database.create_note(content, created_at)
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
pub fn soft_delete_note(database: tauri::State<Database>, id: String) -> Result<(), AppError> {
    database.soft_delete_note(id)
}

#[tauri::command]
pub fn restore_note(database: tauri::State<Database>, id: String) -> Result<NoteDto, AppError> {
    database.restore_note(id)
}

#[tauri::command]
pub fn permanently_delete_note(
    database: tauri::State<Database>,
    id: String,
) -> Result<(), AppError> {
    database.permanently_delete_note(id)
}

#[tauri::command]
pub fn list_trashed_notes(
    database: tauri::State<Database>,
    limit: Option<u32>,
) -> Result<Vec<NoteDto>, AppError> {
    database.list_trashed_notes(limit)
}

#[tauri::command]
pub fn archive_note(database: tauri::State<Database>, id: String) -> Result<NoteDto, AppError> {
    database.archive_note(id)
}

#[tauri::command]
pub fn unarchive_note(database: tauri::State<Database>, id: String) -> Result<NoteDto, AppError> {
    database.unarchive_note(id)
}

#[tauri::command]
pub fn list_archived_notes(
    database: tauri::State<Database>,
    limit: Option<u32>,
) -> Result<Vec<NoteDto>, AppError> {
    database.list_archived_notes(limit)
}

#[tauri::command]
pub fn get_trashed_note(
    database: tauri::State<Database>,
    id: String,
) -> Result<Option<NoteDto>, AppError> {
    database.get_trashed_note(id)
}

#[tauri::command]
pub fn delete_empty_note(database: tauri::State<Database>, id: String) -> Result<(), AppError> {
    database.delete_empty_note(id)
}

#[tauri::command]
pub fn create_folder(
    database: tauri::State<Database>,
    name: String,
) -> Result<FolderDto, AppError> {
    database.create_folder(name)
}

#[tauri::command]
pub fn list_folders(database: tauri::State<Database>) -> Result<Vec<FolderDto>, AppError> {
    database.list_folders()
}

#[tauri::command]
pub fn delete_folder(database: tauri::State<Database>, id: String) -> Result<(), AppError> {
    database.delete_folder(id)
}

#[tauri::command]
pub fn list_notes_by_created_date(
    database: tauri::State<Database>,
    start_iso: String,
    end_iso: String,
    limit: Option<u32>,
) -> Result<Vec<NoteDto>, AppError> {
    database.list_notes_by_created_date(start_iso, end_iso, limit)
}

#[tauri::command]
pub fn list_notes_by_folder(
    database: tauri::State<Database>,
    folder_id: String,
    limit: Option<u32>,
) -> Result<Vec<NoteDto>, AppError> {
    database.list_notes_by_folder(folder_id, limit)
}

#[tauri::command]
pub fn set_note_folders(
    database: tauri::State<Database>,
    note_id: String,
    folder_ids: Vec<String>,
) -> Result<NoteDto, AppError> {
    database.set_note_folders(note_id, folder_ids)
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
