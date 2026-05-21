import { invoke } from "@tauri-apps/api/core";

export function showOverlay(): Promise<void> {
  return invoke<void>("show_overlay");
}

export function hideOverlay(): Promise<void> {
  return invoke<void>("hide_overlay");
}

export function appReady(): Promise<string> {
  return invoke<string>("app_ready");
}

