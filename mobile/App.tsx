import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  active,
  dayKey,
  sorted,
  title,
  type Note,
  type Notebook,
  type Theme,
} from "./src/model";
import { loadNotebook } from "./src/storage";
import { resolveTodoNavigation } from "./src/todoNavigation";
import { todoEntries, type TodoEntry } from "./src/todo";
import { pendingWidgetNavigation, refreshWidgets, widgetsAvailable } from "./src/widget";
type Tab = "Editor" | "Library" | "Calendar";
const light = {
  bg: "#f7faf7",
  surface: "#e8f1ea",
  text: "#172d21",
  muted: "#4e6657",
  green: "#216d43",
  border: "#b9cebf",
};
const dark = {
  bg: "#101d16",
  surface: "#20352a",
  text: "#eef8f0",
  muted: "#adc5b5",
  green: "#92dfaf",
  border: "#405d4b",
};
export default function App() {
  return (
    <SafeAreaProvider>
      <Quicknote />
    </SafeAreaProvider>
  );
}
function Quicknote() {
  const [book, setBook] = useState<Notebook | null>(null);
  const [, refresh] = useState(0);
  const [bootError, setBootError] = useState("");
  const [tab, setTab] = useState<Tab>("Editor");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftDay, setDraftDay] = useState<string | undefined>();
  const [draftTodo, setDraftTodo] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();
  const pendingNavigation = useRef<string | null>(null);
  const navigationHandler = useRef<(url: string) => void>(() => {});
  const [saveError, setSaveError] = useState("");
  const [section, setSection] = useState("Recent");
  const [modal, setModal] = useState<"menu" | "folders" | "create" | null>(
    null,
  );
  const [folderName, setFolderName] = useState("");
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const editor = useRef<TextInput>(null);
  const system = useColorScheme();
  useEffect(() => { refreshWidgets(); }, [system, book]);
  useEffect(() => {
    // Native selection scrolls into view on focus; explicitly suppress the keyboard.
    if (selection && tab === "Editor") editor.current?.focus();
  }, [selection, noteId, tab]);
  const initialize = () => {
    try {
      const loaded = loadNotebook();
      setBook(loaded);
      setBootError("");
      const last = loaded.state.notes.find(
        (n) => n.id === loaded.state.lastEditedId && active(n),
      );
      setNoteId(last?.id ?? null);
      setDraft(last?.content ?? "");
    } catch (error) {
      setBootError(String(error));
    }
  };
  useEffect(initialize, []);
  useEffect(() => {
    const receive = (url: string | null) => {
      if (!url?.startsWith("quicknote://todo")) return;
      pendingNavigation.current = url;
      navigationHandler.current(url);
    };
    void Linking.getInitialURL().then(receive);
    receive(pendingWidgetNavigation());
    const links = Linking.addEventListener("url", ({ url }) => receive(url));
    const lifecycle = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refreshWidgets();
        receive(pendingWidgetNavigation());
      }
    });
    refreshWidgets();
    return () => { links.remove(); lifecycle.remove(); };
  }, []);
  useEffect(() => {
    if (book && !saveError && pendingNavigation.current)
      navigationHandler.current(pendingNavigation.current);
  }, [book, saveError]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (modal) {
        setModal(null);
        return true;
      }
      if (saveError) {
        Alert.alert(
          "Note has not saved",
          "Retry saving before leaving Quicknote.",
        );
        return true;
      }
      if (tab !== "Editor") {
        setTab("Editor");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [modal, tab, saveError]);
  const state = book?.state;
  const colors =
    state?.theme === "dark" || (state?.theme !== "light" && system === "dark")
      ? dark
      : light;
  const note = state?.notes.find((n) => n.id === noteId);
  const readOnly = Boolean(note && !active(note));
  const run = (fn: () => void) => {
    try {
      fn();
      refresh((n) => n + 1);
      return true;
    } catch (error) {
      Alert.alert(
        "Could not complete action",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  };
  const save = (text: string) => {
    setDraft(text);
    try {
      const id = book!.edit(noteId, text, draftDay, draftTodo);
      setNoteId(id);
      if (id) setDraftDay(undefined);
      setSaveError("");
      refresh((n) => n + 1);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  const canLeave = () => !saveError || save(draft);
  const newNote = (day?: string, todo = false) => {
    if (!canLeave()) return;
    Keyboard.dismiss();
    setNoteId(null);
    setDraft("");
    setDraftDay(day);
    setDraftTodo(todo);
    setSelection(undefined);
    setTab("Editor");
    setModal(null);
    setTimeout(() => editor.current?.focus(), 100);
  };
  const open = (n: Note, entry?: TodoEntry) => {
    if (!canLeave()) return;
    Keyboard.dismiss();
    setDraftTodo(false);
    setSelection(entry ? { start: entry.start, end: Math.min(entry.end, n.content.length) } : undefined);
    setModal(null);
    setNoteId(n.id);
    setDraft(n.content);
    setDraftDay(undefined);
    setTab("Editor");
  };
  navigationHandler.current = (url: string) => {
    if (!book || !canLeave()) return;
    const entry = resolveTodoNavigation(url, book.state.notes);
    pendingNavigation.current = null;
    setModal(null);
    if (entry) open(book.state.notes.find((n) => n.id === entry.noteId)!, entry);
    else { Keyboard.dismiss(); setSection("Todo"); setTab("Library"); }
  };
  const change = (
    action: "pin" | "archive" | "trash" | "restore" | "delete",
    id = noteId,
  ) => {
    if (!id || !canLeave()) return;
    if (run(() => book!.change(id, action)) && action === "delete") {
      setNoteId(null);
      setDraft("");
      setDraftDay(undefined);
      setTab("Library");
    }
    Keyboard.dismiss();
  };
  const button = (
    label: string,
    onPress: () => void,
    selected = false,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPressIn={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: selected ? colors.surface : "transparent",
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text style={{ color: colors.green, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  const rows = (notes: Note[]) => (
    <FlatList
      data={notes}
      keyExtractor={(n) => n.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: colors.muted }]}>
          No notes here yet.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${title(item)}`}
          onPressIn={() => open(item)}
          style={[styles.row, { borderColor: colors.border }]}
        >
          <Text
            numberOfLines={1}
            style={[styles.noteTitle, { color: colors.text }]}
          >
            {item.pinned ? "◆ " : ""}
            {title(item)}
          </Text>
          <Text numberOfLines={2} style={{ color: colors.muted, marginTop: 4 }}>
            {item.content.split("\n").slice(1).join(" ").trim() || " "}
          </Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {new Date(item.updatedAt).toLocaleString()}
          </Text>
        </Pressable>
      )}
    />
  );
  if (!book || !state)
    return (
      <SafeAreaView
        style={[styles.fill, { backgroundColor: colors.bg, padding: 24 }]}
      >
        <Text style={{ color: colors.text }}>
          {bootError
            ? `Unable to open your notes. ${bootError}`
            : "Opening Quicknote…"}
        </Text>
        {bootError ? button("Retry", initialize) : null}
      </SafeAreaView>
    );
  const recent = sorted(state.notes.filter(active));
  const todos = todoEntries(state.notes);
  const libraryNotes =
    section === "Recent"
      ? recent
      : section === "Archive"
        ? state.notes
            .filter((n) => n.archivedAt && !n.deletedAt)
            .sort((a, b) => b.archivedAt!.localeCompare(a.archivedAt!))
        : section === "Trash"
          ? state.notes
              .filter((n) => n.deletedAt)
              .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))
          : recent.filter((n) => n.folderIds.includes(section));
  const folder = state.folders.find((f) => f.id === section);
  const monthDays = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const counts = new Map<string, number>();
  recent.forEach((n) => {
    const key = dayKey(new Date(n.createdAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const deleteFolder = () =>
    folder &&
    Alert.alert(
      `Delete “${folder.name}”?`,
      "All active notes in this folder move to Trash, even notes assigned to other folders. Archived notes stay archived. The folder is removed permanently.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete folder",
          style: "destructive",
          onPress: () => {
            if (run(() => book.deleteFolder(folder.id))) setSection("Recent");
          },
        },
      ],
    );
  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: colors.bg }]}
      edges={["top", "bottom", "left", "right"]}
    >
      <StatusBar
        barStyle={colors === dark ? "light-content" : "dark-content"}
        backgroundColor={colors.bg}
      />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { borderColor: colors.border }]}>
          <Text style={[styles.brand, { color: colors.green }]}>Quicknote</Text>
          <Text style={{ color: colors.muted }}>{tab}</Text>
          {button(tab === "Library" ? "Menu" : "New note", () =>
            tab === "Library"
              ? setModal("menu")
              : newNote(tab === "Calendar" ? selectedDay : undefined),
          )}
        </View>
        {saveError ? (
          <View style={[styles.error, { backgroundColor: colors.surface }]}>
            <Text accessibilityRole="alert" style={{ color: colors.text }}>
              Not saved: {saveError}
            </Text>
            {button("Retry save", () => save(draft))}
          </View>
        ) : null}
        {tab === "Editor" ? (
          <View style={styles.fill}>
            {note ? (
              <View style={styles.tools}>
                {readOnly ? (
                  <>
                    {button(
                      note.deletedAt ? "Restore from Trash" : "Restore to edit",
                      () => change("restore"),
                    )}
                    {note.deletedAt
                      ? button("Delete forever", () =>
                          Alert.alert(
                            "Delete forever?",
                            "This note cannot be recovered.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Delete forever",
                                style: "destructive",
                                onPress: () => change("delete"),
                              },
                            ],
                          ),
                        )
                      : button("Move to Trash", () => change("trash"))}
                  </>
                ) : (
                  <>
                    {button(note.pinned ? "Unpin" : "Pin", () => change("pin"))}
                    {button("Assign", () => setModal("folders"))}
                    {button("Archive", () => change("archive"))}
                    {button("Trash", () => change("trash"))}
                  </>
                )}
              </View>
            ) : null}
            {readOnly ? (
              <Text style={[styles.banner, { color: colors.muted }]}>
                {note?.deletedAt ? "Trash" : "Archived"} · Restore before
                editing
                {note?.deletedAt && note.archivedAt
                  ? " · Restoring returns this note to Archive"
                  : ""}
              </Text>
            ) : null}
            {note ? (
              <Text style={[styles.metadata, { color: colors.muted }]}>
                Created {new Date(note.createdAt).toLocaleString()}
                {"\n"}Updated {new Date(note.updatedAt).toLocaleString()}
                {note.folderIds.length
                  ? `\n${state.folders
                      .filter((f) => note.folderIds.includes(f.id))
                      .map((f) => f.name)
                      .join(" · ")}`
                  : ""}
              </Text>
            ) : draftDay ? (
              <Text style={[styles.metadata, { color: colors.muted }]}>
                New note for {draftDay}
              </Text>
            ) : null}
            {(note?.isTodo || (!note && draftTodo)) && !readOnly ? (
              <Text style={[styles.metadata, { color: colors.muted }]}>
                Todo · Start each entry with --. Following lines add details.
                {"\n"}Example: -- Buy groceries{"\n"}Milk, bread, and coffee
              </Text>
            ) : null}
            {readOnly ? (
              <ScrollView
                style={styles.fill}
                contentContainerStyle={styles.readContent}
              >
                <Text
                  selectable
                  style={[styles.editorText, { color: colors.text }]}
                >
                  {note?.content || "Empty note"}
                </Text>
              </ScrollView>
            ) : (
              <TextInput
                ref={editor}
                accessibilityLabel="Note text"
                multiline
                textAlignVertical="top"
                value={draft}
                selection={selection}
                showSoftInputOnFocus={selection === undefined}
                onPressIn={() => setSelection(undefined)}
                onChangeText={(text) => { setSelection(undefined); save(text); }}
                placeholder="Start writing…"
                placeholderTextColor={colors.muted}
                style={[
                  styles.editor,
                  styles.editorText,
                  { color: colors.text },
                ]}
              />
            )}
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.metadata, { color: colors.muted }]}
            >
              {saveError
                ? "Unsaved changes"
                : note
                  ? "Saved on this device"
                  : "Blank drafts are not saved"}
            </Text>
          </View>
        ) : tab === "Library" ? (
          <View style={styles.fill}>
            <View style={styles.tools}>
              {button(section === "Todo" ? "New Todo note" : "New note", () => newNote(undefined, section === "Todo"))}
              {button("New folder", () => {
                setFolderName("");
                setModal("create");
              })}
              {folder ? button("Delete folder", deleteFolder) : null}
            </View>
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tools}
              >
                {["Recent", "Todo", "Archive", "Trash"].map((s) => (
                  <React.Fragment key={s}>
                    {button(s, () => setSection(s), section === s)}
                  </React.Fragment>
                ))}
                {state.folders.map((f) => (
                  <React.Fragment key={f.id}>
                    {button(
                      `${f.name} (${recent.filter((n) => n.folderIds.includes(f.id)).length})`,
                      () => setSection(f.id),
                      section === f.id,
                    )}
                  </React.Fragment>
                ))}
              </ScrollView>
            </View>
            <Text style={[styles.metadata, { color: colors.muted }]}>
              {folder?.name ?? section} · {section === "Todo" ? `${todos.length} entries` : `${libraryNotes.length} notes`}
              {section === "Trash" ? " · Kept until you delete them" : ""}
            </Text>
            {section === "Todo" ? (
              <>
                <Text style={[styles.metadata, { color: colors.muted }]}>
                  Android widget: long-press your home screen → Widgets → Quicknote Todo.
                  {widgetsAvailable ? " Drag it onto the home screen and resize to fit." : " Install the native Android app to use the widget; Expo Go supports the Todo list."}
                </Text>
                <FlatList data={todos} keyExtractor={(entry) => entry.id}
                  contentContainerStyle={styles.list}
                  ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>No todos yet{"\n"}Add a Todo note in Quicknote.</Text>}
                  renderItem={({ item }) => {
                    const source = state.notes.find((n) => n.id === item.noteId)!;
                    return <Pressable accessibilityRole="button" accessibilityLabel={`${item.text}, from ${title(source)}`}
                      onPressIn={() => open(source, item)} style={[styles.row, { borderColor: colors.border }]}>
                      <Text numberOfLines={2} style={[styles.noteTitle, { color: colors.text }]}>{item.title}</Text>
                      {item.details ? <Text numberOfLines={2} style={{ color: colors.muted }}>{item.details}</Text> : null}
                      <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>{title(source)}</Text>
                    </Pressable>;
                  }} />
              </>
            ) : rows(libraryNotes)}
          </View>
        ) : (
          <View style={styles.fill}>
            <View style={styles.monthHeader}>
              {button("‹ Previous", () =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() - 1, 1),
                ),
              )}
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              {button("Next ›", () =>
                setMonth(
                  new Date(month.getFullYear(), month.getMonth() + 1, 1),
                ),
              )}
            </View>
            <View style={styles.grid}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <Text key={d} style={[styles.weekday, { color: colors.muted }]}>
                  {d}
                </Text>
              ))}
              {Array.from({ length: month.getDay() }, (_, i) => (
                <View key={`blank${i}`} style={styles.day} />
              ))}
              {Array.from({ length: monthDays }, (_, i) => {
                const key = dayKey(
                  new Date(month.getFullYear(), month.getMonth(), i + 1),
                );
                const count = counts.get(key) ?? 0;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${key}, ${count} notes`}
                    accessibilityState={{ selected: selectedDay === key }}
                    onPressIn={() => setSelectedDay(key)}
                    style={[
                      styles.day,
                      {
                        backgroundColor:
                          selectedDay === key ? colors.surface : "transparent",
                        borderColor:
                          selectedDay === key ? colors.green : "transparent",
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>{i + 1}</Text>
                    <Text style={[styles.count, { color: colors.green }]}>
                      {count || " "}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.tools}>
              <Text style={{ color: colors.text, flex: 1 }}>{selectedDay}</Text>
              {button("Today", () => {
                const today = new Date();
                setSelectedDay(dayKey(today));
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              })}
              {button("New note", () => newNote(selectedDay))}
            </View>
            {rows(
              recent.filter(
                (n) => dayKey(new Date(n.createdAt)) === selectedDay,
              ),
            )}
          </View>
        )}
        <View style={[styles.nav, { borderColor: colors.border }]}>
          {(["Editor", "Library", "Calendar"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPressIn={() => {
                if (canLeave()) {
                  Keyboard.dismiss();
                  setTab(t);
                }
              }}
              style={[
                styles.navItem,
                { backgroundColor: tab === t ? colors.surface : "transparent" },
              ]}
            >
              <Text
                style={{
                  color: tab === t ? colors.green : colors.muted,
                  fontWeight: "600",
                }}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={modal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(null)}
      >
        <SafeAreaView style={styles.shade}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalWrap}
          >
            <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
              <View style={styles.tools}>
                <Text
                  style={[styles.noteTitle, { color: colors.text, flex: 1 }]}
                >
                  {modal === "menu"
                    ? "Appearance"
                    : modal === "create"
                      ? "New folder"
                      : "Assign note"}
                </Text>
                {button("Done", () => setModal(null))}
              </View>
              {modal === "menu" ? (
                (["system", "light", "dark"] as Theme[]).map((t) => (
                  <React.Fragment key={t}>
                    {button(
                      `${state.theme === t ? "✓ " : ""}${t[0].toUpperCase() + t.slice(1)}`,
                      () => run(() => book.setTheme(t)),
                      state.theme === t,
                    )}
                  </React.Fragment>
                ))
              ) : modal === "create" ? (
                <>
                  <TextInput
                    accessibilityLabel="Folder name"
                    autoFocus
                    maxLength={40}
                    value={folderName}
                    onChangeText={setFolderName}
                    placeholder="Folder name"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.folderInput,
                      { color: colors.text, borderColor: colors.border },
                    ]}
                  />
                  {button("Create folder", () => {
                    if (run(() => book.createFolder(folderName)))
                      setModal(null);
                  })}
                </>
              ) : (
                <ScrollView>
                  {button(`${note?.isTodo ? "✓ " : "○ "}Todo`, () => {
                    if (canLeave()) run(() => book.change(noteId!, "todo"));
                  }, Boolean(note?.isTodo))}
                  {state.folders.length === 0 ? (
                    <Text style={[styles.metadata, { color: colors.muted }]}>
                      Create a folder in Library first.
                    </Text>
                  ) : (
                    state.folders.map((f) => (
                      <React.Fragment key={f.id}>
                        {button(
                          `${note?.folderIds.includes(f.id) ? "✓ " : "○ "}${f.name}`,
                          () =>
                            run(() =>
                              book.change(
                                noteId!,
                                "folders",
                                note!.folderIds.includes(f.id)
                                  ? note!.folderIds.filter((id) => id !== f.id)
                                  : [...note!.folderIds, f.id],
                              ),
                            ),
                          note?.folderIds.includes(f.id),
                        )}
                      </React.Fragment>
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brand: { fontSize: 22, fontWeight: "700" },
  button: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  tools: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 8,
  },
  metadata: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 },
  caption: { fontSize: 12, marginTop: 8 },
  editor: { flex: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  editorText: { fontSize: 17, lineHeight: 26 },
  readContent: { padding: 16 },
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 80,
  },
  noteTitle: { fontSize: 17, fontWeight: "600" },
  empty: { paddingVertical: 32, textAlign: "center" },
  nav: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 4,
  },
  navItem: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 },
  weekday: {
    width: "14.285714%",
    textAlign: "center",
    fontSize: 12,
    paddingVertical: 8,
  },
  day: {
    width: "14.285714%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
  },
  count: { fontSize: 10 },
  shade: { flex: 1, backgroundColor: "#0008", justifyContent: "center" },
  modalWrap: { padding: 20, maxHeight: "85%" },
  sheet: { padding: 12, borderRadius: 16, flexShrink: 1 },
  folderInput: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    marginVertical: 12,
  },
  error: { padding: 12 },
});
