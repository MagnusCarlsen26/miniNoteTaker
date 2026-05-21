import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Pin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNoteStore } from "../store/noteStore";
import type { Note } from "../types/note";

dayjs.extend(relativeTime);

type NoteHistoryProps = {
  onSelectNote: () => void;
};

function previewContent(note: Note) {
  return note.content.replace(/\s+/g, " ").trim() || "Empty note";
}

export function NoteHistory({ onSelectNote }: NoteHistoryProps) {
  const notes = useNoteStore((state) => state.notes);
  const setActiveNote = useNoteStore((state) => state.setActiveNote);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const visibleNotes = useMemo(() => notes.slice(0, 5), [notes]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(visibleNotes.length - 1, 0)));
  }, [visibleNotes.length]);

  const selectNote = (note: Note) => {
    setActiveNote(note);
    onSelectNote();
  };

  if (visibleNotes.length === 0) {
    return null;
  }

  return (
    <div
      className="border-t border-[#dce5d8] pt-3 dark:border-[#2c3628]"
      role="listbox"
      aria-label="Recent notes"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((index) => Math.min(index + 1, visibleNotes.length - 1));
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((index) => Math.max(index - 1, 0));
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const note = visibleNotes[selectedIndex];
          if (note) {
            selectNote(note);
          }
        }
      }}
    >
      <div className="mb-2 text-xs font-medium uppercase text-[#657064] dark:text-[#aeb9aa]">
        Recent
      </div>
      <div className="grid gap-1">
        {visibleNotes.map((note, index) => (
          <button
            key={note.id}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => selectNote(note)}
            className="grid h-9 grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 text-left text-sm text-[#253022] transition hover:bg-[#eef4ec] aria-selected:bg-[#e5eee1] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-selected:bg-[#263220]"
          >
            <span className="flex min-w-0 items-center gap-2">
              {note.pinned ? (
                <Pin size={13} className="shrink-0 text-[#2f6b43] dark:text-[#8ed081]" aria-hidden="true" />
              ) : null}
              <span className="truncate">{previewContent(note)}</span>
            </span>
            <span className="whitespace-nowrap text-xs text-[#657064] dark:text-[#aeb9aa]">
              {dayjs(note.updated_at).fromNow()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
