# 5-Phase Plan: P0 MVP Desktop Quicknote

## Summary

Build a greenfield Tauri desktop app in `/home/khushal/Desktop/Projects/miniNoteTaker` for a keyboard-first local scratchpad. The P0 implementation will target Windows first, with architecture kept portable for macOS later. The app will launch to tray/background, register a global hotkey, show a frameless always-on-top overlay, autosave notes to SQLite, and support recent history, pinning, dark/light mode, and keyboard-only capture.

Working product name default: **Quicknote**.

## Phase 1: Project Foundation And App Shell

### Goals

Create the base desktop application structure and make sure the core stack is in place.

### Implementation

Initialize a Tauri + React + TypeScript + Vite app.

Recommended structure:

```text
/
├── package.json
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles.css
│   ├── components/
│   ├── hooks/
│   ├── store/
│   ├── lib/
│   └── types/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs
        ├── db.rs
        ├── commands.rs
        ├── shortcuts.rs
        ├── window.rs
        └── tray.rs
```

Install frontend dependencies:

```text
react
react-dom
zustand
@tauri-apps/api
react-hotkeys-hook
lucide-react
dayjs
tailwindcss
postcss
autoprefixer
```

Install Rust/Tauri dependencies:

```text
tauri
tauri-plugin-global-shortcut
tauri-plugin-shell
rusqlite
serde
serde_json
uuid
chrono
dirs
thiserror
```

Configure Tauri window defaults:

```json
{
  "width": 600,
  "height": 400,
  "decorations": false,
  "alwaysOnTop": true,
  "resizable": true,
  "visible": false,
  "center": true,
  "skipTaskbar": true
}
```

Configure the app to start hidden and stay resident in the tray/background.

### Public Interfaces

Frontend invokes Rust commands through Tauri:

```ts
type Note = {
  id: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type ThemePreference = "system" | "light" | "dark";
```

### Acceptance Criteria

- App boots locally through Tauri dev mode.
- Main window starts hidden.
- Overlay window can be shown manually from a Tauri command.
- Tailwind styles load.
- React app renders without console errors.

---

## Phase 2: Local SQLite Persistence

### Goals

Implement crash-resistant local note storage with simple, explicit Rust commands.

### Implementation

Create SQLite database in the platform app-data directory, not the project directory.

Example path behavior:

```text
Windows: %APPDATA%/Quicknote/quicknote.db
macOS later: ~/Library/Application Support/Quicknote/quicknote.db
```

Create schema:

```sql
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated_at ON notes(pinned DESC, updated_at DESC);
```

Add a lightweight settings table:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Rust commands:

```rust
create_note(content: String) -> Result<NoteDto, AppError>
update_note(id: String, content: String) -> Result<NoteDto, AppError>
list_notes(limit: Option<u32>) -> Result<Vec<NoteDto>, AppError>
get_note(id: String) -> Result<Option<NoteDto>, AppError>
set_pinned(id: String, pinned: bool) -> Result<NoteDto, AppError>
delete_empty_note(id: String) -> Result<(), AppError>
get_setting(key: String) -> Result<Option<String>, AppError>
set_setting(key: String, value: String) -> Result<(), AppError>
```

Autosave rules:

- Create a note only after user types non-whitespace content.
- Update note after 300ms debounce.
- Save immediately on blur.
- Save immediately before Escape closes overlay.
- Save immediately before app close.
- Keep current draft in memory if database write fails.
- Retry failed saves on the next debounce or close event.

### Failure Handling

Define frontend save states:

```ts
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
```

On database failure:

- Keep textarea content untouched.
- Show subtle toast: `Saved locally when storage is available`.
- Keep retry queue in Zustand memory for the active session.

### Acceptance Criteria

- Notes survive app restart.
- Empty notes are not added to history.
- Updating an existing note changes `updated_at`.
- Pinned state persists.
- Recent list returns max 1000 notes in reverse chronological order, pinned first.

---

## Phase 3: Overlay Capture Experience

### Goals

Build the actual P0 capture loop: hotkey opens overlay, cursor focuses, user types, Escape saves and hides.

### Implementation

Create primary components:

```text
src/components/OverlayEditor.tsx
src/components/NoteHistory.tsx
src/components/ShortcutHint.tsx
src/components/Toast.tsx
src/hooks/useAutosaveNote.ts
src/hooks/useAppShortcuts.ts
src/store/noteStore.ts
src/store/uiStore.ts
```

Overlay layout:

```text
Top:
- note timestamp or "New note"
- save status

Center:
- textarea

Bottom:
- subtle shortcuts: Esc close, Ctrl+N new, Ctrl+P pin
```

UX behavior:

- On overlay open, focus textarea immediately.
- If there is an unsaved in-memory draft, restore it.
- Otherwise open a new blank note.
- `Escape`: flush save, preserve cursor state, hide overlay.
- `Ctrl+N`: flush current note, clear editor, start new note.
- `Ctrl+P`: toggle pin for current note.
- Retain overlay size between sessions using the settings table.
- Use placeholder text: `Write anything...`

Window behavior in Rust:

```rust
show_overlay() -> Result<(), AppError>
hide_overlay() -> Result<(), AppError>
center_overlay() -> Result<(), AppError>
save_window_size(width: u32, height: u32) -> Result<(), AppError>
```

Frontend should listen for a Tauri event:

```ts
"overlay:shown"
```

When received, the editor focuses and selects the last known cursor position.

### Styling

Use typography-first minimal UI.

Default dimensions:

```text
width: 600px
height: 400px
```

Theme:

- System theme by default.
- Manual override saved in settings.
- Tailwind dark mode configured with class strategy.
- Avoid sidebars, toolbar clutter, and decorative UI.

### Acceptance Criteria

- Overlay appears centered and always on top.
- Textarea is focused without mouse interaction.
- Escape closes overlay and saves typed content.
- Ctrl+N starts a new note.
- Ctrl+P pins/unpins current note.
- Reopening restores unsaved draft after failed save.
- Overlay remains usable without network access.

---

## Phase 4: Global Hotkey, Tray, History, And Settings

### Goals

Complete desktop utility behavior: global shortcut, tray/background mode, recent notes retrieval, and fallback handling.

### Implementation

Global shortcut:

- Default: `Ctrl+Space`.
- Register on app startup through `tauri-plugin-global-shortcut`.
- Shortcut calls `show_overlay`.
- If registration fails, store failure and show a lightweight in-app prompt next time the overlay opens.

Fallback shortcuts:

```text
Primary: Ctrl+Space
Fallback option 1: Ctrl+Shift+Space
Fallback option 2: Ctrl+Alt+Space
```

Settings keys:

```text
shortcut.primary
theme.preference
window.width
window.height
first_run.completed
```

Tray behavior:

- App starts hidden.
- Tray menu includes:
  - Open Quicknote
  - Quit
- Closing the overlay hides it, not quits app.
- Quit from tray flushes current note and exits.

History behavior:

- Show pinned notes above recents.
- Display timestamp using `dayjs`.
- Clicking or keyboard-selecting a note opens it in editor view.
- P0 history can be simple and compact within the overlay, either:
  - right-side collapsible recent list, or
  - command-like recent list toggled with keyboard.

Chosen default for P0: **compact recent list below editor when editor is empty or via Ctrl+N flow**, avoiding a persistent sidebar.

Keyboard navigation:

```text
Ctrl+Space: open overlay
Escape: save and hide overlay
Ctrl+N: new note
Ctrl+P: toggle pin
ArrowUp/ArrowDown in history: move selection
Enter in history: open selected note
```

### Public Interfaces

Additional Rust commands:

```rust
register_shortcut(accelerator: String) -> Result<(), AppError>
get_registered_shortcut() -> Result<String, AppError>
```

Additional frontend state:

```ts
type UiState = {
  theme: ThemePreference;
  overlayVisible: boolean;
  activeNoteId: string | null;
  historyLimit: 1000;
  shortcutFailure: string | null;
};
```

### Acceptance Criteria

- App can be opened from another app with global hotkey.
- If default shortcut fails, user sees fallback prompt.
- Tray menu opens overlay and quits app.
- History shows pinned notes first, then reverse chronological recent notes.
- Note timestamps are visible.
- User can recover a previously saved note from history.

---

## Phase 5: Verification, Packaging, And P0 Hardening

### Goals

Validate the product against the MVP definition and prepare a Windows P0 build.

### Manual Test Scenarios

Capture flow:

1. Start app.
2. Press `Ctrl+Space`.
3. Confirm overlay appears in under target threshold.
4. Type note.
5. Press `Escape`.
6. Reopen app.
7. Confirm note is in history.

Autosave:

1. Type a note.
2. Wait 300ms.
3. Kill app process.
4. Restart app.
5. Confirm note persisted or draft recovered.

Pinning:

1. Open saved note.
2. Press `Ctrl+P`.
3. Restart app.
4. Confirm note remains pinned above recents.

New note:

1. Type first note.
2. Press `Ctrl+N`.
3. Type second note.
4. Confirm both notes exist.

Theme:

1. Set OS dark mode.
2. Confirm app follows system theme.
3. Override manually to light.
4. Restart app.
5. Confirm override persists.

Shortcut failure:

1. Simulate failed registration by using a reserved shortcut.
2. Confirm fallback prompt appears.
3. Select alternate shortcut.
4. Confirm alternate opens overlay.

Offline behavior:

1. Disable network.
2. Start app.
3. Create, edit, pin, and reopen notes.
4. Confirm no feature depends on internet.

### Automated Tests

Frontend unit tests:

- `useAutosaveNote` debounces writes by 300ms.
- Save-on-Escape flushes pending save.
- Empty whitespace note is not persisted.
- Pinned notes sort above unpinned notes.
- Theme preference resolves correctly for `system`, `light`, and `dark`.

Rust tests:

- Database initializes schema.
- Create/update/list note works.
- Pinned state persists.
- Settings read/write works.
- Empty note deletion works.

Integration smoke tests:

- Tauri app starts.
- Main window starts hidden.
- `show_overlay` command makes window visible.
- `hide_overlay` command hides window.

### Performance Checks

Measure and record:

```text
Cold start target: < 500ms
Overlay open target: < 150ms
Idle RAM target: < 120MB
Typing latency: no visible lag
```

If startup exceeds target:

- Ensure app starts hidden.
- Avoid eager history loading beyond 1000 notes.
- Avoid heavy frontend libraries.
- Defer nonessential UI initialization until overlay open.

### Packaging

Configure Tauri bundle for Windows:

```text
App name: Quicknote
Identifier: com.quicknote.app
Target: Windows
Output: MSI or NSIS installer
```

Keep macOS configuration present but not part of P0 acceptance.

### Final P0 Acceptance Criteria

P0 is complete when a user can:

```text
Press Ctrl+Space
→ overlay appears
→ type a note immediately
→ press Escape
→ reopen later
→ recover the note reliably
```

The app must work offline, require no login, preserve local notes across restart, and keep the capture workflow keyboard-first.

## Explicit Assumptions And Defaults

- The repository is currently empty except for `.git`, so implementation is greenfield.
- Product name for implementation defaults to **Quicknote**.
- P0 platform target is **Windows**.
- macOS support is deferred but architecture should avoid Windows-only coupling where practical.
- Linux is out of scope.
- SQLite access will use **rusqlite**, not sqlx, for simpler P0 implementation.
- Search is out of P0 except for schema choices that do not block future SQL LIKE or FTS5.
- History limit is fixed at 1000 notes for P0.
- No markdown rendering, tags, folders, sync, auth, AI, OCR, plugins, or attachments will be implemented.
- Recent history UI will stay minimal and avoid a permanent sidebar.
- Default hotkey is `Ctrl+Space`; fallback options are `Ctrl+Shift+Space` and `Ctrl+Alt+Space`.
