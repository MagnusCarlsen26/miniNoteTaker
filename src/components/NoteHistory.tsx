import dayjs from "dayjs";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { presentNote } from "../lib/notePreview";
import { useNoteStore } from "../store/noteStore";
import type { Note } from "../types/note";
import { ActionButton } from "./ActionButton";
type Props = { selectedNoteId: string | null; onSelectNote: (note: Note) => void; onOpenNote?: (note: Note) => void; notesOverride?: Note[]; title?: string; emptyTitle?: string; timestampField?: "updated_at" | "deleted_at" | "created_at"; ariaLabel?: string; maxVisible?: number; onCreateNote?: () => void; createNoteLabel?: string };
export function NoteHistory({ selectedNoteId, onSelectNote, onOpenNote, notesOverride, title = "Recent", emptyTitle = "No notes yet", timestampField = "updated_at", ariaLabel = "Recent notes", maxVisible = 1000, onCreateNote, createNoteLabel = "New note" }: Props) {
  const stored = useNoteStore(state => state.notes);
  const notes = (notesOverride ?? stored).slice(0, maxVisible);
  const [focused, setFocused] = useState(0);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="history" role="listbox" aria-label={ariaLabel} tabIndex={0} onKeyDown={event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); const next = Math.max(0, Math.min(notes.length - 1, focused + (event.key === "ArrowDown" ? 1 : -1)));
      setFocused(next); rows.current[next]?.focus(); rows.current[next]?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && notes[focused]) { event.preventDefault(); event.stopPropagation(); (onOpenNote ?? onSelectNote)(notes[focused]); }
  }}><div className="toolbar"><span className="metadata">{title}</span>{onCreateNote && <ActionButton aria-label={createNoteLabel} onAction={onCreateNote}><Plus size={18} aria-hidden="true" /></ActionButton>}</div>
    {!notes.length && <p className="empty">{emptyTitle}</p>}
    {notes.map((note, index) => { const presentation = presentNote(note.content); return <ActionButton key={note.id} ref={element => { rows.current[index] = element; }} role="option" aria-selected={note.id === selectedNoteId} data-note-id={note.id} className="note-row" onFocus={() => setFocused(index)} onAction={() => onSelectNote(note)} onDoubleClick={() => onOpenNote?.(note)}>
      <span className="row-title">{note.pinned ? "• " : ""}{presentation.title}</span><span className="excerpt">{presentation.excerpt}</span><span className="metadata row-meta"><span>{note.folders.map(folder => folder.name).join(" · ")}</span><time>{dayjs(note[timestampField] ?? note.updated_at).format("MMM D, HH:mm")}</time></span>
    </ActionButton>; })}</div>;
}
