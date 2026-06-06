import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { MouseEvent, RefObject, useEffect, useRef } from "react";

type NoteEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onCursorChange?: (position: number) => void;
  showTitleUnderline?: boolean;
  onEnterAtEndOfTitle?: () => boolean;
  placeholderText?: string;
  editorViewRef?: RefObject<EditorView | null>;
};

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    lineHeight: "1.5rem",
    color: "inherit",
    backgroundColor: "transparent"
  },
  "&.cm-focused": {
    outline: "none"
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit"
  },
  ".cm-content": {
    padding: 0,
    caretColor: "currentColor"
  },
  ".cm-line": {
    padding: 0
  },
  ".cm-cursor": {
    borderLeftColor: "currentColor"
  },
  ".cm-placeholder": {
    color: "#8a9587"
  },
  "&.dark .cm-placeholder": {
    color: "#788475"
  }
});

export function NoteEditor({
  value,
  onChange,
  onCursorChange,
  showTitleUnderline = false,
  onEnterAtEndOfTitle,
  placeholderText = "Title",
  editorViewRef
}: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onEnterAtEndOfTitleRef = useRef(onEnterAtEndOfTitle);
  const syncingRef = useRef(false);

  onChangeRef.current = onChange;
  onCursorChangeRef.current = onCursorChange;
  onEnterAtEndOfTitleRef.current = onEnterAtEndOfTitle;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const startState = EditorState.create({
      doc: value,
      extensions: [
        history(),
        EditorView.lineWrapping,
        editorTheme,
        placeholder(placeholderText),
        keymap.of([
          ...historyKeymap,
          ...defaultKeymap,
          {
            key: "Enter",
            run: (view) => {
              const doc = view.state.doc.toString();
              if (doc.includes("\n")) {
                return false;
              }
              const cursor = view.state.selection.main.head;
              if (cursor !== doc.length) {
                return false;
              }
              if (onEnterAtEndOfTitleRef.current?.()) {
                return true;
              }
              return false;
            }
          }
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncingRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
          if (update.selectionSet) {
            onCursorChangeRef.current?.(update.state.selection.main.head);
          }
        })
      ]
    });

    const view = new EditorView({ state: startState, parent: container });
    viewRef.current = view;
    if (editorViewRef) {
      editorViewRef.current = view;
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorViewRef) {
        editorViewRef.current = null;
      }
    };
  }, [editorViewRef, placeholderText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current === value) {
      return;
    }

    syncingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value }
    });
    syncingRef.current = false;
  }, [value]);

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const clickY = event.clientY - rect.top + container.scrollTop;
    const lineHeight = 24;
    const clickedLine = Math.max(0, Math.floor(clickY / lineHeight));
    const currentLineCount = view.state.doc.lines;

    if (clickedLine >= currentLineCount) {
      const missingLines = clickedLine - currentLineCount + 1;
      const nextContent = `${value}${"\n".repeat(missingLines)}`;
      onChange(nextContent);
      event.preventDefault();
      window.requestAnimationFrame(() => {
        view.focus();
        const end = nextContent.length;
        view.dispatch({ selection: { anchor: end, head: end } });
      });
    }
  };

  const underlineClass = showTitleUnderline
    ? "bg-[linear-gradient(to_right,#c9d5c5,#c9d5c5)] bg-[length:100%_1px] bg-[position:0_1.5rem] bg-no-repeat dark:bg-[linear-gradient(to_right,#3d4939,#3d4939)]"
    : "";

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className={`h-full min-h-0 w-full overflow-x-hidden text-[#172116] dark:text-[#ecf3ea] ${underlineClass}`}
    />
  );
}

export function focusNoteEditor(view: EditorView | null, cursorPosition: number) {
  if (!view) {
    return;
  }

  view.focus();
  const position = Math.min(cursorPosition, view.state.doc.length);
  view.dispatch({ selection: { anchor: position, head: position } });
}

export function getNoteEditorCursorPosition(view: EditorView | null) {
  return view?.state.selection.main.head ?? 0;
}
