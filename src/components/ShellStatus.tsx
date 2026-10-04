import { ActionButton } from "./ActionButton";
import { Eye, EyeOff, MonitorCheck } from "lucide-react";
import { useOverlayCommands } from "../hooks/useOverlayCommands";
import { useNoteStore } from "../store/noteStore";
import { useUiStore } from "../store/uiStore";

export function ShellStatus() {
  const { show, hide } = useOverlayCommands();
  const isOverlayVisible = useUiStore((state) => state.isOverlayVisible);
  const lastCommandResult = useUiStore((state) => state.lastCommandResult);
  const saveStatus = useNoteStore((state) => state.saveStatus);
  const saveError = useNoteStore((state) => state.saveError);
  const isReady = lastCommandResult === "Shell ready";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-between px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Quicknote</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {isReady ? "Shell ready" : "Checking shell status"}
            </p>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-sm"
            aria-label={isReady ? "Shell ready" : "Shell pending"}
          >
            <MonitorCheck size={20} aria-hidden="true" />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-medium">Overlay window</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {isOverlayVisible ? "Visible" : "Hidden or running in tray"}
                </p>
              </div>
              <div className="flex gap-2">
                <ActionButton
                  type="button"
                  onAction={() => void show()}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--active)] px-3 text-sm font-medium text-[var(--on-active)] shadow-sm transition hover:bg-[var(--active)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
                >
                  <Eye size={17} aria-hidden="true" />
                  Show
                </ActionButton>
                <ActionButton
                  type="button"
                  onAction={() => void hide()}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] shadow-sm transition hover:bg-[var(--hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
                >
                  <EyeOff size={17} aria-hidden="true" />
                  Hide
                </ActionButton>
              </div>
            </div>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            Persistence APIs and autosave state are available for the editor.
          </p>
          {saveError ? (
            <p className="text-sm font-medium text-[var(--error-text)]">
              {saveError}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Save status: {saveStatus}
            </p>
          )}
        </div>

        <div className="min-h-6 text-xs text-[var(--text-secondary)]">
          {lastCommandResult}
        </div>
      </section>
    </main>
  );
}
