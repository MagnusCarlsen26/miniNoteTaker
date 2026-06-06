mod commands;
mod db;
mod shortcuts;
mod tray;
mod window;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|arg| arg == "--show") {
                let database = app.state::<db::Database>();
                if let Err(error) = window::show_overlay(app, &database) {
                    eprintln!("failed to show Quicknote from --show: {error}");
                }
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::app_ready,
            commands::show_overlay,
            commands::hide_overlay,
            commands::center_overlay,
            commands::save_window_size,
            commands::register_shortcut,
            commands::get_registered_shortcut,
            commands::get_shortcut_failure,
            commands::quit_app,
            commands::create_note,
            commands::update_note,
            commands::list_notes,
            commands::get_note,
            commands::set_pinned,
            commands::soft_delete_note,
            commands::restore_note,
            commands::permanently_delete_note,
            commands::list_trashed_notes,
            commands::archive_note,
            commands::unarchive_note,
            commands::list_archived_notes,
            commands::get_trashed_note,
            commands::delete_empty_note,
            commands::create_folder,
            commands::list_folders,
            commands::delete_folder,
            commands::list_notes_by_folder,
            commands::set_note_folders,
            commands::get_setting,
            commands::set_setting
        ])
        .setup(|app| {
            let database = db::Database::new()?;
            app.manage(database);
            tray::init(app.handle())?;
            let database = app.state::<db::Database>();
            shortcuts::register_global_shortcuts(app.handle(), &database);
            if std::env::args().any(|arg| arg == "--show") {
                window::show_overlay(app.handle(), &database)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Err(error) = window::request_overlay_close(window.app_handle()) {
                    eprintln!("failed to request overlay close: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Quicknote");
}
