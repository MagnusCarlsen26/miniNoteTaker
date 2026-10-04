# Quicknote for Android

Independent mobile notebook built with Expo SDK 57.0.26, React Native, and TypeScript. No desktop database access, accounts, network sync, reminders, or automatic trash expiration.

## Run on Android

```sh
cd mobile
npm ci
npm start
```

Scan the QR code with the SDK 57 version of Expo Go on Android, or press `a` for an Android emulator. For a native build with the Android SDK and Java installed:

```sh
npm run android
```

For an installable APK built on EAS (requires an Expo account and initial project setup):

```sh
npm run build:android
```

The preview profile produces an APK. Production produces an Android App Bundle. EAS prompts for project linking and signing credentials on the first build. For a local release APK:

```sh
npx expo prebuild --platform android
cd android
./gradlew :app:assembleRelease
```

The generated APK is `android/app/build/outputs/apk/release/app-release.apk`. Local generated releases use the template's debug signing key; EAS manages proper release signing. Native directories and build artifacts are ignored; regenerate them from Expo configuration rather than committing them.

## Behavior

- Editor, Library, and Calendar are full-width screens with bottom navigation. Android Back closes menus, returns to Editor from other tabs, then lets Android exit. The keyboard uses Android resize behavior and safe-area insets.
- Typing automatically saves each change to a private SQLite database (`quicknote-mobile.db`) before showing Saved. Each save writes only the changed note row and any changed settings; it does not serialize Archive, Trash, or the rest of the notebook. Related writes are atomic and use SQLite WAL with full synchronization. Existing snapshot databases migrate automatically in one transaction. Saves remain immediate so there is no debounce window that could lose text on process termination. Failure leaves text in the editor, displays Retry save, and blocks switching notes until the retry succeeds. A failed write is never shown as saved.
- Untouched blank drafts do not create notes. Clearing an existing note preserves it as Empty note. Lists use the first line for the title. Launch resumes the last successfully edited active note; otherwise it opens a blank editor.
- Recent and folder lists order pinned notes first, then most recently updated. Notes may belong to several folders. Folder deletion moves all active members to Trash, including notes in other folders. Archived members remain archived; all memberships in the deleted folder are removed.
- Archived and trashed notes are selectable, read-only text. Restore before editing. Restoring an archived note from Trash returns it to Archive; restore it again to edit. Permanent deletion requires confirmation and is only available in Trash. Trash never expires.
- Calendar counts active notes by local creation date. A new note for a selected date stores local noon on that date; editing does not change its creation date. Archived and trashed notes do not appear in calendar counts.
- Library → Menu offers persisted System, Light, and Dark appearance. Controls use native press handlers and at least 48dp touch targets.

## Checks

```sh
npm run check
npx expo-doctor
npx expo export --platform android
```

Use Node 24 or later for the checks (SQLite tests use Node’s built-in SQLite). Tests cover real SQLite persistence, transactional rollback and retry, snapshot migration, single-row autosave, blank drafts, erased saved notes, atomic persistence and retry, restart selection, pin ordering, archive/read-only rules, Trash restoration and permanent deletion, multiple folder membership and deletion, folder validation, local calendar dates, and theme persistence.

Android is the delivery target. Shared React Native code remains compatible with iPhone; iOS builds, signing, and testing are deferred. Uninstalling the app or clearing its Android storage removes this local notebook. No sync or export is implemented in v0.

For an installed APK on a test emulator, run `python3 scripts/android-smoke.py`. The smoke test uses adb and checks saving, restart persistence, pinning, archive/trash restoration, folder assignment/deletion, permanent deletion confirmation, themes, and calendar editor reset. It creates uniquely named test data and deletes its own completed test notes and folder.

## Android Todo category and widget

Library → Todo is a permanent category, separate from ordinary folders. Choose
New Todo note to start an empty assigned draft, or Editor → Assign → Todo for an
existing note. Assignment survives the first save and can coexist with folders.
Each line starting with `--` (with optional indentation) begins an entry; subsequent
lines supply details. Empty entries and preamble are ignored. A blank marker uses
the first nonempty following line as its title. For example:

```text
-- Buy groceries
Milk, bread, and coffee
-- Call the electrician
Ask about Saturday availability
```

Long-press the Android home screen → Widgets → Quicknote Todo, then drag it onto
the launcher. Resize it by long-pressing the placed widget. The card starts at
approximately 4×3 cells and supports approximately 3×2, depending on the launcher.
Small cards omit details. Tap the heading or empty state for Todo; tap an entry
for its source selection, with the keyboard closed until you touch the editor.
Archived or trashed notes and notes without Todo assignment disappear from both
views. The widget follows saved appearance settings and reads committed SQLite
entries even when React Native is stopped. Expo Go supports the Todo app screens
but cannot load this native widget.

The tracked local Expo module is `modules/quicknote-todo`. Expo autolinking loads
its Kotlin module and merges its library manifest and resources on a clean native
build; no widget code belongs in generated `android/`. The database migration
backfills `todo_entries` transactionally, and saves update only affected Todo
notes within the source save transaction. Widget refreshes coalesce for 350ms;
note persistence remains immediate. Refresh failures never undo note saves and
retry on the next relevant commit, foreground event, or widget update. Stale entry
taps fall back to Todo after checking current source offsets and text identity.

Validation still required on a newly installed native build (build/prebuild and
APK generation intentionally not run for this change at the user's request):

- Clean Expo prebuild, native compilation/tests, and APK installation.
- Launcher placement and picker preview; large scrolling lists, resizing, and multiple instances.
- Light/Dark/System, large fonts, and TalkBack with complete entry labels.
- Cold/warm taps, deleted-entry fallback, entry scrolling/selection without a keyboard,
  and a failed autosave blocking navigation until a successful retry.
- Editing, pin ordering, assignment removal, archive/trash/restore, process termination,
  and reboot rendering.
- App and widget screenshots for review.

Implementation follows Android's [collection widget APIs](https://developer.android.com/develop/ui/views/appwidgets/collections)
and Expo's [local native-code approach](https://docs.expo.dev/workflow/customizing/).
