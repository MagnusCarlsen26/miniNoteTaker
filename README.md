# Quicknote

Quicknote is a small desktop note capture app built with Tauri, React, and SQLite.

## Features

- Tray-first desktop note app that opens as a small overlay.
- Fast capture with autosave to a local SQLite database.
- Note history with pinned notes sorted above regular notes.
- New-note, close, and pin keyboard flows.
- Light, dark, and system theme support.
- `quicknote --show` command for OS/window-manager shortcuts.
- Windows packaging is configured for an NSIS installer.

## Development

```bash
npm install
npm run tauri dev
```

Run verification:

```bash
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## Linux: Arch, Wayland, and Hyprland

Quicknote starts hidden in the tray. On Hyprland/Wayland, app-level global shortcuts may not work because the compositor owns global keybindings. Use Quicknote's CLI show command from a Hyprland bind instead:

```conf
bind = CTRL SHIFT, SPACE, exec, quicknote --show
```

Quicknote requests a centered, always-on-top popup window, but Hyprland controls whether windows tile or float. Add window rules if you want it to always float:

```conf
windowrulev2 = float, title:^(Quicknote)$
windowrulev2 = center, title:^(Quicknote)$
windowrulev2 = size 600 400, title:^(Quicknote)$
```

Optional autostart:

```conf
exec-once = quicknote
```

Reload Hyprland after editing:

```bash
hyprctl reload
```
