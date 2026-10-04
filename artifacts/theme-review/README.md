# Quicknote theme comparison

Captured in Chromium with the Tauri IPC bridge mocked, at 320 × 480 and 600 × 480. The app's actual React components, CSS, stores, and CodeMirror editor were used. Both modes cover the editor, theme menu, note browser, calendar, folders, deletion confirmation, and theme persistence error.

| View | Light (320px) | Dark (320px) | Light (600px) | Dark (600px) |
| --- | --- | --- | --- | --- |
| editor | [Screenshot](320-light-editor.png) | [Screenshot](320-dark-editor.png) | [Screenshot](600-light-editor.png) | [Screenshot](600-dark-editor.png) |
| theme-menu | [Screenshot](320-light-theme-menu.png) | [Screenshot](320-dark-theme-menu.png) | [Screenshot](600-light-theme-menu.png) | [Screenshot](600-dark-theme-menu.png) |
| browser | [Screenshot](320-light-browser.png) | [Screenshot](320-dark-browser.png) | [Screenshot](600-light-browser.png) | [Screenshot](600-dark-browser.png) |
| calendar | [Screenshot](320-light-calendar.png) | [Screenshot](320-dark-calendar.png) | [Screenshot](600-light-calendar.png) | [Screenshot](600-dark-calendar.png) |
| folders | [Screenshot](320-light-folders.png) | [Screenshot](320-dark-folders.png) | [Screenshot](600-light-folders.png) | [Screenshot](600-dark-folders.png) |
| confirmation | [Screenshot](320-light-confirmation.png) | [Screenshot](320-dark-confirmation.png) | [Screenshot](600-light-confirmation.png) | [Screenshot](600-dark-confirmation.png) |
| error | [Screenshot](320-light-error.png) | [Screenshot](320-dark-error.png) | [Screenshot](600-light-error.png) | [Screenshot](600-dark-error.png) |

Contrast ratios use WCAG relative luminance, measured against main, raised, and selection backgrounds (the lowest value is shown).

| Role | Light | Dark |
| --- | --- | --- |
| Primary text | 11.96:1 | 9.46:1 |
| Secondary text / placeholder | 4.85:1 | 5.04:1 |
| Accent / focus / today / note dot | 5.19:1 | 5.94:1 |
| Error text on error surface | 8.35:1 | 11.64:1 |
| White text on filled green | 6.32:1 | 6.32:1 |

The prescribed filled green has only 2.73:1 contrast against the dark main background, so selected calendar and date-strip cells receive an accent inset outline. Today has an outline without the filled background; note-count dots become white on selected cells.

Browser verification confirmed editor DOM identity, content, and undo survive theme changes. A colocated CodeMirror test also checks cursor and undo depth preservation. Screenshots are a browser review, not a native Tauri window capture.

Reading view with Back at the top-left and note action icons grouped at the top-right: [Light](320-light-reading.png), [Dark](320-dark-reading.png). Verified at 320 × 600 with no header overflow.
