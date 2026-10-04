import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";
import { OverlayEditor } from "./OverlayEditor";
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../lib/tauri", () => ({ getSetting: vi.fn(async () => "light"), hideOverlay: vi.fn(), quitApp: vi.fn(), setSetting: vi.fn(), LAST_OPEN_NOTE_ID_KEY: "last" }));
vi.mock("./NoteEditor", () => ({ NoteEditor: () => <div data-testid="editor" />, focusNoteEditor: vi.fn(), getNoteEditorCursorPosition: () => 0 }));
vi.mock("./DateStrip", () => ({ DateStrip: ({ onSelectDate }: { onSelectDate: (date: string) => void }) => <button onMouseDown={() => onSelectDate("2026-05-20")}>Choose date</button> }));
vi.mock("./MonthCalendar", () => ({ MonthCalendar: () => <div>Month grid</div> }));
vi.mock("../hooks/useZoomShortcuts", () => ({ useZoomShortcuts: () => {} }));
const original = useNoteStore.getState();
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) });
  useNoteStore.setState({ ...original, activeNote: null, notes: [], folders: [], draftContent: "", revision: 0, pendingSave: null, saveStatus: "idle", saveError: null,
    loadNotes: vi.fn(async () => {}), loadFolders: vi.fn(async () => {}), loadArchivedNotes: vi.fn(async () => {}), loadTrashedNotes: vi.fn(async () => {}) });
  useUiStore.setState({ viewMode: "editor", selectedSidebarItem: "recent", readingOpen: false, isOverlayVisible: false, selectedHistoryNoteId: null });
});
afterEach(cleanup);
describe("editor navigation", () => {
  it("blocks New after failed save and retains the draft", async () => {
    useNoteStore.setState({ draftContent: "Keep this", saveStatus: "error", saveError: "Not saved", saveDraft: vi.fn(async () => null) });
    render(<OverlayEditor />); fireEvent.mouseDown(screen.getByRole("button", { name: "New note" }), { button: 0 });
    await screen.findByRole("alert"); expect(useNoteStore.getState().draftContent).toBe("Keep this");
    fireEvent.mouseDown(screen.getByRole("button", { name: "Keep editing" }), { button: 0 });
    expect(useNoteStore.getState().draftContent).toBe("Keep this");
  });
  it("date-specific New resets before assigning its date", async () => {
    render(<OverlayEditor />); fireEvent.mouseDown(screen.getByText("Choose date"), { button: 0 });
    fireEvent.mouseDown(screen.getByRole("button", { name: "New on this date" }), { button: 0 });
    await waitFor(() => expect(useNoteStore.getState().draftCreatedDate).toBe("2026-05-20"));
    expect(useNoteStore.getState().draftContent).toBe("");
  });
  it("closes folders on outside pointer down and offers an accessible X", () => {
    render(<OverlayEditor />); fireEvent.mouseDown(screen.getByRole("button", { name: "Folders" }), { button: 0 });
    expect(screen.getByRole("button", { name: "Close folders" })).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId("editor")); expect(screen.queryByRole("dialog", { name: "Folders" })).toBeNull();
  });
  it.each(["recent", "folders", "archive", "trash", "calendar"] as const)("has one note create control in %s", section => {
    useUiStore.setState({ viewMode: "home", selectedSidebarItem: section }); render(<OverlayEditor />);
    expect(screen.getAllByRole("button", { name: /New/ })).toHaveLength(1);
  });
});

it("places Back first in the browser header and uses accessible icon actions", async () => {
  const note = { id: "sample", content: "Sample title\nBody", created_at: "2026-05-20T12:00:00Z", updated_at: "2026-05-20T12:00:00Z", folders: [], pinned: false, archived_at: null, deleted_at: null };
  useNoteStore.setState({ notes: [note] });
  useUiStore.setState({ viewMode: "home", readingOpen: true, selectedHistoryNoteId: note.id });
  const { container } = render(<OverlayEditor />);
  const back = screen.getByRole("button", { name: "Back" });
  expect(container.querySelector(".browse-header")?.firstElementChild).toBe(back);
  for (const name of ["Back", "Edit", "Archive", "Trash"]) {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toBeTruthy();
    expect(container.querySelector(".browse-header")?.contains(button)).toBe(true);
  }
  expect(container.querySelector(".reading .toolbar")).toBeNull();
  fireEvent.mouseDown(back, { button: 0 });
  expect(useUiStore.getState().readingOpen).toBe(false);
});
