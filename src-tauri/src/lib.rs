mod commands;
mod db;
mod shortcuts;
mod tray;
mod window;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::app_ready,
            commands::show_overlay,
            commands::hide_overlay,
            commands::center_overlay,
            commands::save_window_size,
            commands::create_note,
            commands::update_note,
            commands::list_notes,
            commands::get_note,
            commands::set_pinned,
            commands::delete_empty_note,
            commands::get_setting,
            commands::set_setting
        ])
        .setup(|app| {
            let database = db::Database::new()?;
            app.manage(database);
            tray::init(app.handle())?;
            shortcuts::register_global_shortcuts(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(error) = window.hide() {
                    eprintln!("failed to hide window on close: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Quicknote");
}
