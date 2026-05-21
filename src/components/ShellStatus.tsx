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
    <main className="min-h-screen bg-[#f4f7f4] text-[#172116] dark:bg-[#11170f] dark:text-[#ecf3ea]">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-between px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Quicknote</h1>
            <p className="mt-1 text-sm text-[#536150] dark:text-[#b8c7b4]">
              {isReady ? "Shell ready" : "Checking shell status"}
            </p>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#cad7c7] bg-white text-[#2f5f39] shadow-sm dark:border-[#31402d] dark:bg-[#192217] dark:text-[#9bd38f]"
            aria-label={isReady ? "Shell ready" : "Shell pending"}
          >
            <MonitorCheck size={20} aria-hidden="true" />
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-[#d8e2d5] bg-white p-5 shadow-sm dark:border-[#2c3a29] dark:bg-[#182116]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-medium">Overlay window</h2>
                <p className="mt-1 text-sm text-[#536150] dark:text-[#b8c7b4]">
                  {isOverlayVisible ? "Visible" : "Hidden or running in tray"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void show()}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[#245d38] px-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#1d4d2e] focus:outline-none focus:ring-2 focus:ring-[#7fbd74] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#182116]"
                >
                  <Eye size={17} aria-hidden="true" />
                  Show
                </button>
                <button
                  type="button"
                  onClick={() => void hide()}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[#cad7c7] bg-white px-3 text-sm font-medium text-[#172116] shadow-sm transition hover:bg-[#eef4ec] focus:outline-none focus:ring-2 focus:ring-[#7fbd74] focus:ring-offset-2 focus:ring-offset-white dark:border-[#3a4935] dark:bg-[#202b1d] dark:text-[#ecf3ea] dark:hover:bg-[#273623] dark:focus:ring-offset-[#182116]"
                >
                  <EyeOff size={17} aria-hidden="true" />
                  Hide
                </button>
              </div>
            </div>
          </div>

          <p className="text-sm text-[#536150] dark:text-[#b8c7b4]">
            Persistence APIs and autosave state are available for the editor.
          </p>
          {saveError ? (
            <p className="text-sm font-medium text-[#9b2c2c] dark:text-[#ffb4a8]">
              {saveError}
            </p>
          ) : (
            <p className="text-sm text-[#536150] dark:text-[#b8c7b4]">
              Save status: {saveStatus}
            </p>
          )}
        </div>

        <div className="min-h-6 text-xs text-[#536150] dark:text-[#b8c7b4]">
          {lastCommandResult}
        </div>
      </section>
    </main>
  );
}
