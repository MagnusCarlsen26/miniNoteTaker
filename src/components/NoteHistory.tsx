import dayjs from "dayjs";
import { Pin } from "lucide-react";
import { MouseEvent, useEffect, useMemo, useState } from "react";
import { useNoteStore } from "../store/noteStore";
import type { Note } from "../types/note";

type NoteHistoryProps = {
  selectedNoteId: string | null;
  onSelectNote: (note: Note) => void;
};

function previewContent(note: Note) {
  return note.content.replace(/\s+/g, " ").trim() || "Empty note";
}

function formatRelativeTime(updatedAt: string) {
  const now = dayjs();
  const updated = dayjs(updatedAt);
  const minutes = Math.abs(now.diff(updated, "minute"));

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.abs(now.diff(updated, "hour"));
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.abs(now.diff(updated, "day"));
  if (days < 30) {
    return `${days}d`;
  }

  const months = Math.abs(now.diff(updated, "month"));
  return `${Math.max(months, 1)} months`;
}

export function NoteHistory({ selectedNoteId, onSelectNote }: NoteHistoryProps) {
  const notes = useNoteStore((state) => state.notes);
  const initialIndex = useMemo(() => {
    if (!selectedNoteId) {
      return 0;
    }

    const noteIndex = notes.findIndex((note) => note.id === selectedNoteId);
    return noteIndex >= 0 ? noteIndex : 0;
  }, [notes, selectedNoteId]);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const visibleNotes = useMemo(() => notes.slice(0, 5), [notes]);

  useEffect(() => {
    setSelectedIndex((index) => {
      const selectedVisibleIndex = visibleNotes.findIndex((note) => note.id === selectedNoteId);
      if (selectedVisibleIndex >= 0) {
        return selectedVisibleIndex;
      }

      return Math.min(index, Math.max(visibleNotes.length - 1, 0));
    });
  }, [selectedNoteId, visibleNotes]);

  if (visibleNotes.length === 0) {
    return null;
  }

  const handleMouseDownSelect = (event: MouseEvent<HTMLButtonElement>, note: Note) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    onSelectNote(note);
  };

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
            onSelectNote(note);
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
            aria-selected={note.id === selectedNoteId || index === selectedIndex}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(event) => handleMouseDownSelect(event, note)}
            onClick={() => onSelectNote(note)}
            className="grid h-9 grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 text-left text-sm text-[#253022] transition hover:bg-[#eef4ec] aria-selected:bg-[#e5eee1] dark:text-[#e2eadf] dark:hover:bg-[#202a1d] dark:aria-selected:bg-[#263220]"
          >
            <span className="flex min-w-0 items-center gap-2">
              {note.pinned ? (
                <Pin size={13} className="shrink-0 text-[#2f6b43] dark:text-[#8ed081]" aria-hidden="true" />
              ) : null}
              <span className="truncate">{previewContent(note)}</span>
            </span>
            <span className="whitespace-nowrap text-xs text-[#657064] dark:text-[#aeb9aa]">
              {formatRelativeTime(note.updated_at)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
