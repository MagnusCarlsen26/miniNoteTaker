import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";

type EventCallback = () => void | Promise<void>;

const mocks = vi.hoisted(() => ({
  eventListeners: new Map<string, EventCallback>(),
  setSizeMock: vi.fn().mockResolvedValue(undefined),
  centerMock: vi.fn().mockResolvedValue(undefined),
  innerSizeMock: vi.fn(),
  scaleFactorMock: vi.fn(),
  hideOverlayMock: vi.fn().mockResolvedValue(undefined),
  saveWindowSizeMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    setSize: mocks.setSizeMock,
    center: mocks.centerMock,
    innerSize: mocks.innerSizeMock,
    scaleFactor: mocks.scaleFactorMock
  })),
  LogicalSize: class LogicalSize {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  }
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: EventCallback) => {
    mocks.eventListeners.set(event, callback);
    return Promise.resolve(vi.fn());
  })
}));

vi.mock("../hooks/useAppShortcuts", () => ({
  useAppShortcuts: vi.fn()
}));

vi.mock("../lib/tauri", () => ({
  createFolder: vi.fn(),
  createNote: vi.fn(),
  deleteFolder: vi.fn(),
  deleteEmptyNote: vi.fn(),
  getRegisteredShortcut: vi.fn().mockResolvedValue("Super+Space"),
  getSetting: vi.fn().mockResolvedValue("system"),
  getShortcutFailure: vi.fn().mockResolvedValue(null),
  hideOverlay: mocks.hideOverlayMock,
  listFolders: vi.fn().mockResolvedValue([]),
  listNotes: vi.fn().mockResolvedValue([]),
  listNotesByFolder: vi.fn().mockResolvedValue([]),
  quitApp: vi.fn(),
  registerShortcut: vi.fn(),
  saveWindowSize: mocks.saveWindowSizeMock,
  setNoteFolders: vi.fn(),
  setPinned: vi.fn(),
  updateNote: vi.fn()
}));

import { OverlayEditor } from "./OverlayEditor";

function resetStores() {
  useNoteStore.setState({
    activeNote: null,
    draftContent: "",
    notes: [],
    folders: [],
    selectedFolderId: null,
    folderError: null,
    saveStatus: "idle",
    saveError: null,
    pendingSave: null
  });
  useUiStore.setState({
    isOverlayVisible: false,
    lastCommandResult: null,
    theme: "system",
    toastMessage: null,
    lastCursorPosition: 0,
    activeNoteId: null,
    shortcutFailure: null,
    viewMode: "editor",
    selectedSidebarItem: "recent",
    selectedHistoryNoteId: null
  });
}

async function triggerCloseRequest() {
  await waitFor(() => expect(mocks.eventListeners.get("overlay:close-requested")).toBeDefined());
  await mocks.eventListeners.get("overlay:close-requested")?.();
}

function expectLastSetSize(width: number, height: number) {
  expect(mocks.setSizeMock).toHaveBeenLastCalledWith(expect.objectContaining({ width, height }));
}

describe("OverlayEditor window sizing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventListeners.clear();
    resetStores();
    mocks.innerSizeMock.mockResolvedValue({
      width: 600,
      height: 400,
      toLogical: (scaleFactor: number) => ({ width: 600 / scaleFactor, height: 400 / scaleFactor })
    });
    mocks.scaleFactorMock.mockResolvedValue(1);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("resizes larger when opening the dashboard", async () => {
    render(<OverlayEditor />);

    fireEvent.mouseDown(screen.getByLabelText("Open dashboard"), { button: 0 });

    await waitFor(() => expectLastSetSize(920, 560));
    expect(mocks.centerMock).toHaveBeenCalled();
  });

  it("resizes compact when returning to the editor", async () => {
    render(<OverlayEditor />);

    fireEvent.mouseDown(screen.getByLabelText("Open dashboard"), { button: 0 });
    await screen.findByText("Dashboard");
    fireEvent.mouseDown(screen.getByLabelText("New note"), { button: 0 });

    await waitFor(() => expectLastSetSize(600, 400));
  });

  it("does not persist dashboard size when closing from dashboard", async () => {
    render(<OverlayEditor />);

    fireEvent.mouseDown(screen.getByLabelText("Open dashboard"), { button: 0 });
    await screen.findByText("Dashboard");
    mocks.setSizeMock.mockClear();

    await triggerCloseRequest();

    expect(mocks.saveWindowSizeMock).not.toHaveBeenCalledWith(920, 560);
    await waitFor(() =>
      expect(mocks.setSizeMock).toHaveBeenCalledWith(expect.objectContaining({ width: 600, height: 400 }))
    );
    await waitFor(() => expect(mocks.hideOverlayMock).toHaveBeenCalled());
  });

  it("persists editor logical size instead of physical size", async () => {
    mocks.innerSizeMock.mockResolvedValue({
      width: 1200,
      height: 800,
      toLogical: (scaleFactor: number) => ({ width: 1200 / scaleFactor, height: 800 / scaleFactor })
    });
    mocks.scaleFactorMock.mockResolvedValue(2);
    render(<OverlayEditor />);

    await triggerCloseRequest();

    await waitFor(() => expect(mocks.saveWindowSizeMock).toHaveBeenCalledWith(600, 400));
    expect(mocks.saveWindowSizeMock).not.toHaveBeenCalledWith(1200, 800);
  });
});
