import type { ReactNode } from "react";
import type { Note } from "../types/note";
import { presentNote } from "../lib/notePreview";
export function NoteReading({ note, actions }: { note: Note; actions: ReactNode }) {
  const { title, body } = presentNote(note.content);
  return <article className="reading"><div className="toolbar">{actions}</div><div className="reading-content"><h2>{title}</h2><div className="note-body">{body}</div><p className="metadata">{note.folders.map(folder => folder.name).join(" · ")}</p></div></article>;
}
