import type { ThemePreference } from "../types/note";

export function shouldUseDarkTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): boolean {
  if (preference === "dark") {
    return true;
  }

  if (preference === "light") {
    return false;
  }

  return systemPrefersDark;
}
