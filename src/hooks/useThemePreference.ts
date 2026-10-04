import { useEffect, useRef, useState } from "react";
import { getSetting, setSetting } from "../lib/tauri";
import { shouldUseDarkTheme } from "../lib/theme";
import { useUiStore } from "../store/uiStore";
import type { ThemePreference } from "../types/note";

export function useThemePreference() {
  const preference = useUiStore(state => state.theme);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    void getSetting("theme.preference").then(value => {
      if (active && revision.current === initialRevision) {
        useUiStore.getState().setTheme(value === "dark" || value === "light" ? value : "system");
      }
    }).catch(() => {
      if (active && revision.current === initialRevision) setError("Could not load theme.");
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", shouldUseDarkTheme(preference, media.matches));
    apply();
    if (preference !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  const choose = (value: ThemePreference) => {
    const selectedRevision = ++revision.current;
    useUiStore.getState().setTheme(value);
    setError(null);
    writes.current = writes.current.then(() => setSetting("theme.preference", value)).catch(() => {
      if (revision.current === selectedRevision) setError("Could not save theme. Using it for this session.");
    });
  };
  return { preference, choose, error };
}
