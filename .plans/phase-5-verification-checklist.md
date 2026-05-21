# Phase 5 Verification Checklist

## Environment

- OS:
- Build commit:
- App version:
- Database path:

## Commands

Run these before manual acceptance:

```bash
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Windows P0 packaging command:

```bash
npm run tauri build
```

Expected outcomes:

- Frontend build completes without TypeScript or Vite errors.
- Frontend unit tests pass.
- Rust database and command tests pass.
- On a Windows machine with the required Tauri toolchain, the bundle target is NSIS and produces a Windows installer.
- On Linux, do not treat Windows installer build failure as an app failure when the Windows/NSIS toolchain is unavailable.

## Capture Flow

- Open Quicknote with the configured global shortcut.
- Type a short note.
- Close the overlay.
- Reopen Quicknote.
- Expected: the note remains available in history and the editor is ready for a new capture.

## Autosave Crash Behavior

- Type a non-empty draft.
- Wait at least 300 ms.
- Force quit the app process.
- Relaunch the app.
- Expected: the note is either persisted or the local pending-save state is visible and retryable without losing typed content.

## Pinning Persistence

- Create at least two notes.
- Pin one note.
- Close and relaunch the app.
- Expected: the pinned note remains pinned and sorts above unpinned notes.

## New Note Flow

- Open an existing note.
- Use the new-note shortcut.
- Type a new note and wait for autosave.
- Expected: the new note is saved separately and the previous note remains in history.

## Theme Behavior

- Set theme to light, dark, and system through the app flow or stored setting.
- Toggle the OS color scheme when using system mode.
- Expected: light and dark preferences override the OS; system follows the OS preference.

## Shortcut Failure Fallback

- Make `Ctrl+Space` unavailable by reserving it in another app or OS setting.
- Launch Quicknote.
- Expected: the overlay shows fallback shortcut options and registering a fallback clears the warning.

## Offline Behavior

- Disable network access.
- Create and edit notes.
- Expected: local database-backed note creation, editing, pinning, and history continue to work.

## Performance Measurements

- Cold start:
- Overlay open:
- Idle RAM:
- Typing latency:

Expected P0 targets:

- Cold start is acceptable for repeated daily use.
- Overlay opens quickly enough to feel immediate.
- Idle RAM remains reasonable for a tray note utility.
- Typing has no visible input lag during normal note capture.

## Final P0 Acceptance Result

- Result:
- Tester:
- Date:
- Notes:
