use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Wry,
};

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::<Wry>::with_id(app, "show", "Show Quicknote", true, None::<&str>)?;
    let quit = MenuItem::<Wry>::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Quicknote")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Err(error) = crate::window::show_overlay(app) {
                    eprintln!("failed to show Quicknote: {error}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(error) = crate::window::show_overlay(tray.app_handle()) {
                    eprintln!("failed to show Quicknote: {error}");
                }
            }
        })
        .build(app)?;

    Ok(())
}
