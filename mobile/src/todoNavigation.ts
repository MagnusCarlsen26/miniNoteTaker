import { todoEntries, type TodoEntry } from "./todo";
import type { Note } from "./model";
export function resolveTodoNavigation(url: string, notes: Note[]): TodoEntry | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "quicknote:" || parsed.hostname !== "todo") return;
    const query = parsed.searchParams;
    // Verify against the current committed entry; stale taps must never open another block.
    return todoEntries(notes).find((entry) => entry.noteId === query.get("note") &&
      entry.ordinal === Number(query.get("ordinal")) &&
      entry.start === Number(query.get("start")) &&
      fingerprint(entry.text) === query.get("fingerprint"));
  } catch { return; }
}
// Compact identity in tap intents, avoiding full note text in Android Binder payloads.
export function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
