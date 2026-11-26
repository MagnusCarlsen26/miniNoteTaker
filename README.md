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

## Release builds

Run the script for the OS you are building on; installers are not cross-compiled:

| OS | Command | Prerequisites | Output |
| --- | --- | --- | --- |
| Linux | `npm run build:linux` | GTK 3, webkit2gtk-4.1, libsoup-3.0, curl, wget, patchelf | `src-tauri/target/release/bundle/deb/`, `src-tauri/target/release/bundle/appimage/` |
| macOS | `npm run build:macos` | Xcode command line tools | `src-tauri/target/release/bundle/dmg/` |
| Windows | `npm run build:windows` | Visual Studio Build Tools (MSVC), NSIS | `src-tauri/target/release/bundle/nsis/` |

Each script builds the frontend first and overrides the default `nsis` target in `tauri.conf.json`. Add other formats with `npx tauri build --bundles <format>`, such as `app` or `pkg` on macOS, `msi` (needs WiX v3) on Windows, or `rpm` on Linux. On rolling Linux distributions AppImage bundling can fail when linuxdeploy's bundled `strip` cannot read newer ELF sections; the `.deb` and `src-tauri/target/release/quicknote` binary are still usable.

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds all three platforms on native runners and attaches the installers to a GitHub release.

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

## Android mobile app

The independent Expo SDK 57 app lives in [`mobile/`](mobile/README.md). See its README for Android launch, APK build instructions, behavior, and verification commands. Mobile notes remain separate from the desktop database.
