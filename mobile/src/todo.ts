import { active, sorted, type Note } from "./model";
export type TodoEntry = {
  completed: boolean;
  id: string;
  noteId: string;
  ordinal: number;
  title: string;
  details: string;
  text: string;
  start: number;
  end: number;
};
// Offsets use JavaScript / Android UTF-16 indices, including original CRLFs.
export function parseTodos(noteId: string, content: string): TodoEntry[] {
  const markers = [...content.matchAll(/^[\t ]*--([^\r\n]*)/gm)];
  return markers.flatMap((marker, ordinal) => {
    const start = marker.index!;
    const end = markers[ordinal + 1]?.index ?? content.length;
    const lines = content.slice(start + marker[0].length, end).split(/\r?\n/);
    let heading = marker[1].trim();
    const token = heading.match(/^\[([xX ])\]/);
    const completed = Boolean(token && token[1].toLowerCase() === "x");
    if (token) heading = heading.slice(token[0].length).trim();
    if (!heading) {
      const first = lines.findIndex((line) => Boolean(line.trim()));
      if (first < 0) return [];
      heading = lines[first].trim();
      lines.splice(0, first + 1);
    }
    const details = lines.join("\n").trim();
    return [{ completed, id: `${noteId}:${ordinal}`, noteId, ordinal, title: heading,
      details, text: heading + (details ? `\n${details}` : ""), start, end }];
  });
}
export function todoEntries(notes: Note[]) {
  return sorted(notes.filter((note) => active(note) && note.isTodo))
    .flatMap((note) => parseTodos(note.id, note.content).filter((entry) => !entry.completed));
}
