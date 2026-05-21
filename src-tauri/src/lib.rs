mod commands;
mod db;
mod shortcuts;
mod tray;
mod window;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::app_ready,
            commands::show_overlay,
            commands::hide_overlay
        ])
        .setup(|app| {
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
