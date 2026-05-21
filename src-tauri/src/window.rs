use crate::db::Database;
use tauri::{AppHandle, Emitter, Manager, Size};

pub fn show_overlay(app: &AppHandle, database: &Database) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let saved_width = database
            .get_setting("window.width".to_string())
            .ok()
            .flatten()
            .and_then(|value| value.parse::<f64>().ok());
        let saved_height = database
            .get_setting("window.height".to_string())
            .ok()
            .flatten()
            .and_then(|value| value.parse::<f64>().ok());

        if let (Some(width), Some(height)) = (saved_width, saved_height) {
            if width.is_finite() && height.is_finite() && width > 0.0 && height > 0.0 {
                window.set_size(Size::Logical(tauri::LogicalSize { width, height }))?;
            }
        }

        window.show()?;
        window.center()?;
        window.set_focus()?;
        window.set_always_on_top(true)?;
        window.emit("overlay:shown", ())?;
    }

    Ok(())
}

pub fn hide_overlay(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide()?;
    }

    Ok(())
}

pub fn center_overlay(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.center()?;
    }

    Ok(())
}
