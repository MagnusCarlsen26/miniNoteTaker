import type { Note } from "../types/note";
import { presentNote } from "../lib/notePreview";
export function NoteReading({ note }: { note: Note }) {
  const { title, body } = presentNote(note.content);
  return <article className="reading"><div className="reading-content"><h2>{title}</h2><div className="note-body">{body}</div><p className="metadata">{note.folders.map(folder => folder.name).join(" · ")}</p></div></article>;
}
