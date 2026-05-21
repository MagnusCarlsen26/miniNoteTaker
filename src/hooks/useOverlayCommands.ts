import { useCallback } from "react";
import { appReady, hideOverlay, showOverlay } from "../lib/tauri";
import { useUiStore } from "../store/uiStore";

function readableError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Command failed";
}

export function useOverlayCommands() {
  const setOverlayVisible = useUiStore((state) => state.setOverlayVisible);
  const setLastCommandResult = useUiStore((state) => state.setLastCommandResult);

  const show = useCallback(async () => {
    try {
      await showOverlay();
      setOverlayVisible(true);
      setLastCommandResult("Overlay shown");
    } catch (error) {
      setLastCommandResult(`Show failed: ${readableError(error)}`);
    }
  }, [setLastCommandResult, setOverlayVisible]);

  const hide = useCallback(async () => {
    try {
      await hideOverlay();
      setOverlayVisible(false);
      setLastCommandResult("Overlay hidden");
    } catch (error) {
      setLastCommandResult(`Hide failed: ${readableError(error)}`);
    }
  }, [setLastCommandResult, setOverlayVisible]);

  const checkReady = useCallback(async () => {
    try {
      const result = await appReady();
      setLastCommandResult(result === "ready" ? "Shell ready" : result);
    } catch (error) {
      setLastCommandResult(`Ready check failed: ${readableError(error)}`);
    }
  }, [setLastCommandResult]);

  return { show, hide, checkReady };
}

