export type Folder = {
  id: string;
  name: string;
  note_count: number;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  content: string;
  pinned: boolean;
  folders: Folder[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ThemePreference = "system" | "light" | "dark";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
