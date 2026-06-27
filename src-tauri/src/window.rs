use crate::db::Database;
use tauri::{AppHandle, Emitter, Manager, Size};

fn parse_positive_dimension(value: Option<String>) -> Option<f64> {
    value
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
}

fn is_legacy_editor_size(width: f64, height: f64) -> bool {
    (width == 600.0 && height == 400.0) || (width == 660.0 && height == 400.0)
}

fn editor_default_size() -> (f64, f64) {
    (1320.0, 800.0)
}

fn migrate_legacy_editor_size(
    database: &Database,
    width: f64,
    height: f64,
) -> (f64, f64) {
    if !is_legacy_editor_size(width, height) {
        return (width, height);
    }

    let (width, height) = editor_default_size();
    let _ = database.set_setting("window.editor.width".to_string(), width.to_string());
    let _ = database.set_setting("window.editor.height".to_string(), height.to_string());
    (width, height)
}

fn read_editor_window_size(database: &Database) -> (Option<f64>, Option<f64>) {
    let width = parse_positive_dimension(
        database
            .get_setting("window.editor.width".to_string())
            .ok()
            .flatten(),
    );
    let height = parse_positive_dimension(
        database
            .get_setting("window.editor.height".to_string())
            .ok()
            .flatten(),
    );

    if width.is_some() && height.is_some() {
        let (width, height) = migrate_legacy_editor_size(database, width.unwrap(), height.unwrap());
        return (Some(width), Some(height));
    }

    let legacy_width = parse_positive_dimension(
        database
            .get_setting("window.width".to_string())
            .ok()
            .flatten(),
    );
    let legacy_height = parse_positive_dimension(
        database
            .get_setting("window.height".to_string())
            .ok()
            .flatten(),
    );

    let width = width.or(legacy_width);
    let height = height.or(legacy_height);

    if let (Some(width), Some(height)) = (width, height) {
        let (width, height) = migrate_legacy_editor_size(database, width, height);
        return (Some(width), Some(height));
    }

    (width, height)
}

fn restore_saved_size(window: &tauri::WebviewWindow, database: &Database) -> tauri::Result<()> {
    let (width, height) = read_editor_window_size(database);

    if let (Some(width), Some(height)) = (width, height) {
        window.set_size(Size::Logical(tauri::LogicalSize { width, height }))?;
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

pub fn persist_window_size_for_mode(
    app: &AppHandle,
    database: &Database,
    mode: &str,
) -> Result<(), crate::db::AppError> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let Ok(physical) = window.inner_size() else {
        return Ok(());
    };
    let Ok(scale) = window.scale_factor() else {
        return Ok(());
    };

    let width = physical.width as f64 / scale;
    let height = physical.height as f64 / scale;

    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Ok(());
    }

    let (width_key, height_key) = window_size_keys(mode);

    database.set_setting(width_key.to_string(), width.to_string())?;
    database.set_setting(height_key.to_string(), height.to_string())
}

fn window_size_keys(mode: &str) -> (&'static str, &'static str) {
    match mode {
        "home" => ("window.home.width", "window.home.height"),
        _ => ("window.editor.width", "window.editor.height"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn test_database() -> Database {
        Database::new_in_memory().expect("in-memory database should open")
    }

    #[test]
    fn read_editor_window_size_migrates_legacy_defaults() {
        let database = test_database();
        database
            .set_setting("window.editor.width".to_string(), "600".to_string())
            .expect("set editor width");
        database
            .set_setting("window.editor.height".to_string(), "400".to_string())
            .expect("set editor height");

        let (width, height) = read_editor_window_size(&database);
        assert_eq!(width, Some(1320.0));
        assert_eq!(height, Some(800.0));
        assert_eq!(
            database
                .get_setting("window.editor.width".to_string())
                .unwrap(),
            Some("1320".to_string())
        );
    }

    #[test]
    fn read_editor_window_size_uses_editor_keys() {
        let database = test_database();
        database
            .set_setting("window.editor.width".to_string(), "700".to_string())
            .expect("set editor width");
        database
            .set_setting("window.editor.height".to_string(), "420".to_string())
            .expect("set editor height");

        let (width, height) = read_editor_window_size(&database);
        assert_eq!(width, Some(700.0));
        assert_eq!(height, Some(420.0));
    }

    #[test]
    fn read_editor_window_size_falls_back_to_legacy_keys() {
        let database = test_database();
        database
            .set_setting("window.width".to_string(), "680".to_string())
            .expect("set legacy width");
        database
            .set_setting("window.height".to_string(), "390".to_string())
            .expect("set legacy height");

        let (width, height) = read_editor_window_size(&database);
        assert_eq!(width, Some(680.0));
        assert_eq!(height, Some(390.0));
    }

    #[test]
    fn window_size_keys_maps_home_and_editor() {
        assert_eq!(
            window_size_keys("home"),
            ("window.home.width", "window.home.height")
        );
        assert_eq!(
            window_size_keys("editor"),
            ("window.editor.width", "window.editor.height")
        );
    }
}
