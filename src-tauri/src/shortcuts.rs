use crate::db::{AppError, Database};
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const DEFAULT_SHORTCUT: &str = "Super+Space";
const SHORTCUT_SETTING: &str = "shortcut.primary";
const SHORTCUT_FAILURE_SETTING: &str = "shortcut.failure";

pub fn register_global_shortcuts(app: &tauri::AppHandle, database: &Database) {
    let accelerator = database
        .get_setting(SHORTCUT_SETTING.to_string())
        .ok()
        .flatten()
        .unwrap_or_else(|| DEFAULT_SHORTCUT.to_string());

    if let Err(error) = register_shortcut(app, database, accelerator) {
        let _ = database.set_setting(SHORTCUT_FAILURE_SETTING.to_string(), error.to_string());
        eprintln!("failed to register global shortcut: {error}");
    }
}

pub fn register_shortcut(
    app: &tauri::AppHandle,
    database: &Database,
    accelerator: String,
) -> Result<(), AppError> {
    let shortcut_manager = app.global_shortcut();
    let _ = shortcut_manager.unregister_all();

    let shortcut = accelerator.clone();
    shortcut_manager
        .on_shortcut(accelerator.as_str(), move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            let database = app.state::<Database>();
            if let Err(error) = crate::window::toggle_overlay(app, &database) {
                eprintln!("failed to toggle Quicknote from shortcut {shortcut}: {error}");
            }
        })
        .map_err(|error| AppError::Shortcut(error.to_string()))?;

    database.set_setting(SHORTCUT_SETTING.to_string(), accelerator)?;
    database.set_setting(SHORTCUT_FAILURE_SETTING.to_string(), String::new())?;
    Ok(())
}

pub fn registered_shortcut(database: &Database) -> Result<String, AppError> {
    Ok(database
        .get_setting(SHORTCUT_SETTING.to_string())?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SHORTCUT.to_string()))
}

pub fn shortcut_failure(database: &Database) -> Result<Option<String>, AppError> {
    Ok(database
        .get_setting(SHORTCUT_FAILURE_SETTING.to_string())?
        .filter(|value| !value.trim().is_empty()))
}
