use crate::db::Database;
use tauri::{AppHandle, Emitter, Manager, Size};

fn restore_saved_size(window: &tauri::WebviewWindow, database: &Database) -> tauri::Result<()> {
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

    Ok(())
}

pub fn show_overlay(app: &AppHandle, database: &Database) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        restore_saved_size(&window, database)?;
        window.show()?;
        window.center()?;
        window.set_focus()?;
        window.set_always_on_top(true)?;
        window.emit("overlay:shown", ())?;
    }

    Ok(())
}

pub fn request_overlay_close(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.emit("overlay:close-requested", ())?;
    }

    Ok(())
}

pub fn toggle_overlay(app: &AppHandle, database: &Database) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible()? && window.is_focused()? {
            return request_overlay_close(app);
        }
    }

    show_overlay(app, database)
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
