use tauri::{AppHandle, Manager};

pub fn show_overlay(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.center()?;
        window.set_focus()?;
        window.set_always_on_top(true)?;
    }

    Ok(())
}

pub fn hide_overlay(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide()?;
    }

    Ok(())
}
