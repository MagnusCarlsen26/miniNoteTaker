use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("app data directory is unavailable")]
    MissingDataDir,

    #[error("note not found")]
    NoteNotFound,

    #[error("empty notes cannot be created")]
    EmptyNote,

    #[error("folder name cannot be empty")]
    EmptyFolderName,

    #[error("folder name cannot be longer than 40 characters")]
    FolderNameTooLong,

    #[error("folder not found")]
    FolderNotFound,

    #[error("shortcut error: {0}")]
    Shortcut(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct NoteDto {
    pub id: String,
    pub content: String,
    pub pinned: bool,
    pub folders: Vec<FolderDto>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FolderDto {
    pub id: String,
    pub name: String,
    pub note_count: u32,
    pub created_at: String,
    pub updated_at: String,
}

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self, AppError> {
        let database_path = database_path()?;
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent)?;
        }

        Self::from_connection(Connection::open(database_path)?)
    }

    #[cfg(test)]
    pub fn new_in_memory() -> Result<Self, AppError> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(connection: Connection) -> Result<Self, AppError> {
        initialize_connection(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn create_note(&self, content: String) -> Result<NoteDto, AppError> {
        if content.trim().is_empty() {
            return Err(AppError::EmptyNote);
        }

        let id = Uuid::new_v4().to_string();
        let now = now_timestamp();
        let connection = self.lock_connection();

        connection.execute(
            "INSERT INTO notes (id, content, pinned, created_at, updated_at)
             VALUES (?1, ?2, 0, ?3, ?3)",
            params![id, content, now],
        )?;
        drop(connection);

        self.get_note(id)?.ok_or(AppError::NoteNotFound)
    }

    pub fn update_note(&self, id: String, content: String) -> Result<NoteDto, AppError> {
        let updated_at = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET content = ?1, updated_at = ?2
             WHERE id = ?3 AND deleted_at IS NULL",
            params![content, updated_at, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }
        drop(connection);

        self.get_note(id)?.ok_or(AppError::NoteNotFound)
    }

    pub fn list_notes(&self, limit: Option<u32>) -> Result<Vec<NoteDto>, AppError> {
        let limit = limit.unwrap_or(1000).min(1000);
        let connection = self.lock_connection();
        let mut statement = connection.prepare(
            "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
             FROM notes
             WHERE deleted_at IS NULL AND archived_at IS NULL
             ORDER BY pinned DESC, updated_at DESC
             LIMIT ?1",
        )?;

        let notes = statement
            .query_map(params![limit], note_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        hydrate_note_folders(&connection, notes)
    }

    pub fn get_note(&self, id: String) -> Result<Option<NoteDto>, AppError> {
        let connection = self.lock_connection();
        let note = connection
            .query_row(
                "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
                 FROM notes
                 WHERE id = ?1 AND deleted_at IS NULL AND archived_at IS NULL",
                params![id],
                note_from_row,
            )
            .optional()
            .map_err(AppError::from)?;

        match note {
            Some(note) => Ok(hydrate_note_folders(&connection, vec![note])?.pop()),
            None => Ok(None),
        }
    }

    pub fn archive_note(&self, id: String) -> Result<NoteDto, AppError> {
        let now = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET archived_at = ?1, updated_at = ?1, pinned = 0
             WHERE id = ?2 AND deleted_at IS NULL AND archived_at IS NULL",
            params![now, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }
        drop(connection);

        self.get_archived_note(id)?.ok_or(AppError::NoteNotFound)
    }

    pub fn unarchive_note(&self, id: String) -> Result<NoteDto, AppError> {
        let now = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET archived_at = NULL, updated_at = ?1
             WHERE id = ?2 AND deleted_at IS NULL AND archived_at IS NOT NULL",
            params![now, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }
        drop(connection);

        self.get_note(id)?.ok_or(AppError::NoteNotFound)
    }

    pub fn list_archived_notes(&self, limit: Option<u32>) -> Result<Vec<NoteDto>, AppError> {
        let limit = limit.unwrap_or(1000).min(1000);
        let connection = self.lock_connection();
        let mut statement = connection.prepare(
            "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
             FROM notes
             WHERE deleted_at IS NULL AND archived_at IS NOT NULL
             ORDER BY archived_at DESC
             LIMIT ?1",
        )?;

        let notes = statement
            .query_map(params![limit], note_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        hydrate_note_folders(&connection, notes)
    }

    pub fn get_archived_note(&self, id: String) -> Result<Option<NoteDto>, AppError> {
        let connection = self.lock_connection();
        let note = connection
            .query_row(
                "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
                 FROM notes
                 WHERE id = ?1 AND deleted_at IS NULL AND archived_at IS NOT NULL",
                params![id],
                note_from_row,
            )
            .optional()
            .map_err(AppError::from)?;

        match note {
            Some(note) => Ok(hydrate_note_folders(&connection, vec![note])?.pop()),
            None => Ok(None),
        }
    }

    pub fn set_pinned(&self, id: String, pinned: bool) -> Result<NoteDto, AppError> {
        let updated_at = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET pinned = ?1, updated_at = ?2
             WHERE id = ?3 AND deleted_at IS NULL",
            params![pinned as i64, updated_at, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }
        drop(connection);

        self.get_note(id)?.ok_or(AppError::NoteNotFound)
    }

    pub fn soft_delete_note(&self, id: String) -> Result<(), AppError> {
        let now = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET deleted_at = ?1, updated_at = ?1, pinned = 0
             WHERE id = ?2 AND deleted_at IS NULL",
            params![now, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }

        Ok(())
    }

    pub fn restore_note(&self, id: String) -> Result<NoteDto, AppError> {
        let now = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET deleted_at = NULL, updated_at = ?1
             WHERE id = ?2 AND deleted_at IS NOT NULL",
            params![now, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }
        drop(connection);

        self.get_note(id)?.ok_or(AppError::NoteNotFound)
    }

    pub fn permanently_delete_note(&self, id: String) -> Result<(), AppError> {
        let connection = self.lock_connection();
        let affected = connection.execute(
            "DELETE FROM notes
             WHERE id = ?1 AND deleted_at IS NOT NULL",
            params![id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }

        Ok(())
    }

    pub fn list_trashed_notes(&self, limit: Option<u32>) -> Result<Vec<NoteDto>, AppError> {
        let limit = limit.unwrap_or(1000).min(1000);
        let connection = self.lock_connection();
        let mut statement = connection.prepare(
            "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
             FROM notes
             WHERE deleted_at IS NOT NULL
             ORDER BY deleted_at DESC
             LIMIT ?1",
        )?;

        let notes = statement
            .query_map(params![limit], note_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        hydrate_note_folders(&connection, notes)
    }

    pub fn get_trashed_note(&self, id: String) -> Result<Option<NoteDto>, AppError> {
        let connection = self.lock_connection();
        let note = connection
            .query_row(
                "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
                 FROM notes
                 WHERE id = ?1 AND deleted_at IS NOT NULL",
                params![id],
                note_from_row,
            )
            .optional()
            .map_err(AppError::from)?;

        match note {
            Some(note) => Ok(hydrate_note_folders(&connection, vec![note])?.pop()),
            None => Ok(None),
        }
    }

    pub fn delete_empty_note(&self, id: String) -> Result<(), AppError> {
        let connection = self.lock_connection();
        connection.execute(
            "DELETE FROM notes
             WHERE id = ?1
             AND TRIM(content, char(9) || char(10) || char(11) || char(12) || char(13) || char(32)) = ''",
            params![id],
        )?;
        Ok(())
    }

    pub fn create_folder(&self, name: String) -> Result<FolderDto, AppError> {
        let name = validate_folder_name(name)?;
        let id = Uuid::new_v4().to_string();
        let now = now_timestamp();
        let connection = self.lock_connection();

        let affected = connection.execute(
            "INSERT OR IGNORE INTO folders (id, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)",
            params![id, name, now],
        )?;

        if affected == 0 {
            return connection
                .query_row(
                    "SELECT f.id, f.name, COUNT(n.id) AS note_count, f.created_at, f.updated_at
                     FROM folders f
                     LEFT JOIN note_folders nf ON nf.folder_id = f.id
                     LEFT JOIN notes n ON n.id = nf.note_id AND n.deleted_at IS NULL AND n.archived_at IS NULL
                     WHERE f.name = ?1 COLLATE NOCASE
                     GROUP BY f.id",
                    params![name],
                    folder_from_row,
                )
                .map_err(AppError::from);
        }

        self.folder_by_id_locked(&connection, &id)?
            .ok_or(AppError::FolderNotFound)
    }

    pub fn list_folders(&self) -> Result<Vec<FolderDto>, AppError> {
        let connection = self.lock_connection();
        let mut statement = connection.prepare(
            "SELECT f.id, f.name, COUNT(n.id) AS note_count, f.created_at, f.updated_at
             FROM folders f
             LEFT JOIN note_folders nf ON nf.folder_id = f.id
             LEFT JOIN notes n ON n.id = nf.note_id AND n.deleted_at IS NULL AND n.archived_at IS NULL
             GROUP BY f.id
             ORDER BY f.updated_at DESC",
        )?;

        let folders = statement
            .query_map([], folder_from_row)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(folders)
    }

    pub fn delete_folder(&self, id: String) -> Result<(), AppError> {
        let mut connection = self.lock_connection();
        let exists = folder_exists(&connection, &id)?;
        if !exists {
            return Err(AppError::FolderNotFound);
        }

        let transaction = connection.transaction()?;
        let note_ids = {
            let mut statement = transaction.prepare(
                "SELECT n.id
                 FROM notes n
                 INNER JOIN note_folders nf ON nf.note_id = n.id
                 WHERE nf.folder_id = ?1 AND n.deleted_at IS NULL AND n.archived_at IS NULL",
            )?;
            let note_ids = statement
                .query_map(params![id], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            note_ids
        };

        for note_id in note_ids {
            let now = now_timestamp();
            transaction.execute(
                "UPDATE notes
                 SET deleted_at = ?1, updated_at = ?1, pinned = 0
                 WHERE id = ?2 AND deleted_at IS NULL",
                params![now, note_id],
            )?;
        }
        transaction.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
        transaction.commit()?;
        Ok(())
    }

    pub fn list_notes_by_created_date(
        &self,
        start_iso: String,
        end_iso: String,
        limit: Option<u32>,
    ) -> Result<Vec<NoteDto>, AppError> {
        let limit = limit.unwrap_or(1000).min(1000);
        let connection = self.lock_connection();
        let mut statement = connection.prepare(
            "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
             FROM notes
             WHERE deleted_at IS NULL AND archived_at IS NULL
               AND created_at >= ?1 AND created_at < ?2
             ORDER BY pinned DESC, created_at DESC
             LIMIT ?3",
        )?;

        let notes = statement
            .query_map(params![start_iso, end_iso, limit], note_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        hydrate_note_folders(&connection, notes)
    }

    pub fn list_notes_by_folder(
        &self,
        folder_id: String,
        limit: Option<u32>,
    ) -> Result<Vec<NoteDto>, AppError> {
        let limit = limit.unwrap_or(1000).min(1000);
        let connection = self.lock_connection();
        if !folder_exists(&connection, &folder_id)? {
            return Err(AppError::FolderNotFound);
        }

        let mut statement = connection.prepare(
            "SELECT n.id, n.content, n.pinned, n.created_at, n.updated_at, n.deleted_at, n.archived_at
             FROM notes n
             INNER JOIN note_folders nf ON nf.note_id = n.id
             WHERE nf.folder_id = ?1 AND n.deleted_at IS NULL AND n.archived_at IS NULL
             ORDER BY n.pinned DESC, n.updated_at DESC
             LIMIT ?2",
        )?;

        let notes = statement
            .query_map(params![folder_id, limit], note_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        drop(statement);

        hydrate_note_folders(&connection, notes)
    }

    pub fn set_note_folders(
        &self,
        note_id: String,
        folder_ids: Vec<String>,
    ) -> Result<NoteDto, AppError> {
        let mut connection = self.lock_connection();
        if self.note_by_id_locked(&connection, &note_id)?.is_none() {
            return Err(AppError::NoteNotFound);
        }

        let transaction = connection.transaction()?;
        for folder_id in &folder_ids {
            let exists: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM folders WHERE id = ?1)",
                params![folder_id],
                |row| row.get(0),
            )?;
            if !exists {
                return Err(AppError::FolderNotFound);
            }
        }

        transaction.execute(
            "DELETE FROM note_folders WHERE note_id = ?1",
            params![note_id],
        )?;
        let now = now_timestamp();
        for folder_id in folder_ids {
            transaction.execute(
                "INSERT INTO note_folders (note_id, folder_id, created_at)
                 VALUES (?1, ?2, ?3)",
                params![note_id, folder_id, now],
            )?;
        }
        transaction.commit()?;

        let note = self
            .note_by_id_locked(&connection, &note_id)?
            .ok_or(AppError::NoteNotFound)?;
        hydrate_note_folders(&connection, vec![note])?
            .pop()
            .ok_or(AppError::NoteNotFound)
    }

    #[allow(dead_code)]
    pub fn add_note_to_folder(
        &self,
        note_id: String,
        folder_id: String,
    ) -> Result<NoteDto, AppError> {
        let mut note = self
            .get_note(note_id.clone())?
            .ok_or(AppError::NoteNotFound)?;
        if !note.folders.iter().any(|folder| folder.id == folder_id) {
            let mut folder_ids = note
                .folders
                .iter()
                .map(|folder| folder.id.clone())
                .collect::<Vec<_>>();
            folder_ids.push(folder_id);
            note = self.set_note_folders(note_id, folder_ids)?;
        }
        Ok(note)
    }

    #[allow(dead_code)]
    pub fn remove_note_from_folder(
        &self,
        note_id: String,
        folder_id: String,
    ) -> Result<NoteDto, AppError> {
        let note = self
            .get_note(note_id.clone())?
            .ok_or(AppError::NoteNotFound)?;
        let folder_ids = note
            .folders
            .iter()
            .filter(|folder| folder.id != folder_id)
            .map(|folder| folder.id.clone())
            .collect::<Vec<_>>();
        self.set_note_folders(note_id, folder_ids)
    }

    pub fn get_setting(&self, key: String) -> Result<Option<String>, AppError> {
        let connection = self.lock_connection();
        connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn set_setting(&self, key: String, value: String) -> Result<(), AppError> {
        let connection = self.lock_connection();
        connection.execute(
            "INSERT INTO settings (key, value)
             VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    fn lock_connection(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.connection
            .lock()
            .expect("database connection mutex was poisoned")
    }

    fn note_by_id_locked(
        &self,
        connection: &Connection,
        id: &str,
    ) -> Result<Option<NoteDto>, AppError> {
        connection
            .query_row(
                "SELECT id, content, pinned, created_at, updated_at, deleted_at, archived_at
                 FROM notes
                 WHERE id = ?1 AND deleted_at IS NULL AND archived_at IS NULL",
                params![id],
                note_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }

    fn folder_by_id_locked(
        &self,
        connection: &Connection,
        id: &str,
    ) -> Result<Option<FolderDto>, AppError> {
        connection
            .query_row(
                "SELECT f.id, f.name, COUNT(n.id) AS note_count, f.created_at, f.updated_at
                 FROM folders f
                 LEFT JOIN note_folders nf ON nf.folder_id = f.id
                 LEFT JOIN notes n ON n.id = nf.note_id AND n.deleted_at IS NULL AND n.archived_at IS NULL
                 WHERE f.id = ?1
                 GROUP BY f.id",
                params![id],
                folder_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }
}

fn database_path() -> Result<PathBuf, AppError> {
    let data_dir = dirs::data_dir().ok_or(AppError::MissingDataDir)?;
    Ok(data_dir.join("Quicknote").join("quicknote.db"))
}

fn initialize_connection(connection: &Connection) -> Result<(), AppError> {
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;

    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_notes_updated_at
        ON notes(updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated_at
        ON notes(pinned DESC, updated_at DESC);

        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS note_folders (
          note_id TEXT NOT NULL,
          folder_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (note_id, folder_id),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_note_folders_folder_id
        ON note_folders(folder_id);

        CREATE INDEX IF NOT EXISTS idx_folders_updated_at
        ON folders(updated_at DESC);

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ",
    )?;

    migrate_deleted_at(connection)?;
    migrate_archived_at(connection)?;
    migrate_created_at_index(connection)?;

    Ok(())
}

fn migrate_deleted_at(connection: &Connection) -> Result<(), AppError> {
    let has_deleted_at = {
        let mut statement = connection.prepare("PRAGMA table_info(notes)")?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        columns.iter().any(|column| column == "deleted_at")
    };

    if !has_deleted_at {
        connection.execute("ALTER TABLE notes ADD COLUMN deleted_at TEXT", [])?;
    }

    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at DESC)",
        [],
    )?;

    Ok(())
}

fn migrate_created_at_index(connection: &Connection) -> Result<(), AppError> {
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC)",
        [],
    )?;

    Ok(())
}

fn migrate_archived_at(connection: &Connection) -> Result<(), AppError> {
    let has_archived_at = {
        let mut statement = connection.prepare("PRAGMA table_info(notes)")?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        columns.iter().any(|column| column == "archived_at")
    };

    if !has_archived_at {
        connection.execute("ALTER TABLE notes ADD COLUMN archived_at TEXT", [])?;
    }

    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_archived_at ON notes(archived_at DESC)",
        [],
    )?;

    Ok(())
}

fn note_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteDto> {
    Ok(NoteDto {
        id: row.get(0)?,
        content: row.get(1)?,
        pinned: row.get::<_, i64>(2)? != 0,
        folders: Vec::new(),
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(5)?,
        archived_at: row.get(6)?,
    })
}

fn folder_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FolderDto> {
    Ok(FolderDto {
        id: row.get(0)?,
        name: row.get(1)?,
        note_count: row.get::<_, i64>(2)? as u32,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn validate_folder_name(name: String) -> Result<String, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::EmptyFolderName);
    }
    if name.chars().count() > 40 {
        return Err(AppError::FolderNameTooLong);
    }
    Ok(name)
}

fn folder_exists(connection: &Connection, id: &str) -> Result<bool, AppError> {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM folders WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )
        .map_err(AppError::from)
}

fn hydrate_note_folders(
    connection: &Connection,
    mut notes: Vec<NoteDto>,
) -> Result<Vec<NoteDto>, AppError> {
    if notes.is_empty() {
        return Ok(notes);
    }

    for note in &mut notes {
        let mut statement = connection.prepare(
            "SELECT f.id, f.name, COUNT(all_notes.id) AS note_count, f.created_at, f.updated_at
             FROM folders f
             INNER JOIN note_folders nf ON nf.folder_id = f.id
             LEFT JOIN note_folders all_nf ON all_nf.folder_id = f.id
             LEFT JOIN notes all_notes ON all_notes.id = all_nf.note_id AND all_notes.deleted_at IS NULL AND all_notes.archived_at IS NULL
             WHERE nf.note_id = ?1
             GROUP BY f.id
             ORDER BY f.name COLLATE NOCASE ASC",
        )?;
        note.folders = statement
            .query_map(params![note.id], folder_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
    }

    Ok(notes)
}

fn now_timestamp() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn initializes_schema_without_error() {
        let database = Database::new_in_memory();
        assert!(database.is_ok());
    }

    #[test]
    fn create_note_inserts_non_empty_note() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("hello".to_string()).unwrap();

        assert_eq!(note.content, "hello");
        assert!(!note.pinned);
        assert!(Uuid::parse_str(&note.id).is_ok());
        assert!(!note.created_at.is_empty());
        assert_eq!(note.created_at, note.updated_at);
    }

    #[test]
    fn create_note_rejects_whitespace_only_content() {
        let database = Database::new_in_memory().unwrap();
        let result = database.create_note("   \n\t".to_string());

        assert!(matches!(result, Err(AppError::EmptyNote)));
    }

    #[test]
    fn update_note_changes_content_and_updated_at() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("before".to_string()).unwrap();
        thread::sleep(Duration::from_millis(2));

        let updated = database
            .update_note(note.id.clone(), "after".to_string())
            .unwrap();

        assert_eq!(updated.content, "after");
        assert_ne!(updated.updated_at, note.updated_at);
        assert_eq!(updated.created_at, note.created_at);
    }

    #[test]
    fn get_note_returns_none_for_missing_id() {
        let database = Database::new_in_memory().unwrap();

        assert!(database.get_note("missing".to_string()).unwrap().is_none());
    }

    #[test]
    fn list_notes_returns_pinned_first_then_newest_updated() {
        let database = Database::new_in_memory().unwrap();
        let first = database.create_note("first".to_string()).unwrap();
        thread::sleep(Duration::from_millis(2));
        let second = database.create_note("second".to_string()).unwrap();
        thread::sleep(Duration::from_millis(2));
        let third = database.create_note("third".to_string()).unwrap();

        database.set_pinned(first.id.clone(), true).unwrap();
        database.set_pinned(third.id.clone(), true).unwrap();

        let notes = database.list_notes(None).unwrap();
        let ids = notes
            .iter()
            .map(|note| note.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            ids,
            vec![third.id.as_str(), first.id.as_str(), second.id.as_str()]
        );
    }

    #[test]
    fn list_notes_caps_limit_at_one_thousand() {
        let database = Database::new_in_memory().unwrap();
        for index in 0..1005 {
            database.create_note(format!("note {index}")).unwrap();
        }

        let notes = database.list_notes(Some(5000)).unwrap();

        assert_eq!(notes.len(), 1000);
    }

    #[test]
    fn list_notes_respects_small_caller_limit() {
        let database = Database::new_in_memory().unwrap();
        for index in 0..5 {
            database.create_note(format!("note {index}")).unwrap();
        }

        let notes = database.list_notes(Some(2)).unwrap();

        assert_eq!(notes.len(), 2);
    }

    #[test]
    fn update_missing_note_returns_not_found() {
        let database = Database::new_in_memory().unwrap();
        let result = database.update_note("missing".to_string(), "content".to_string());

        assert!(matches!(result, Err(AppError::NoteNotFound)));
    }

    #[test]
    fn set_pinned_persists_pinned_state() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("pin me".to_string()).unwrap();

        let pinned = database.set_pinned(note.id.clone(), true).unwrap();
        let fetched = database.get_note(note.id).unwrap().unwrap();

        assert!(pinned.pinned);
        assert!(fetched.pinned);
    }

    #[test]
    fn set_pinned_missing_note_returns_not_found() {
        let database = Database::new_in_memory().unwrap();
        let result = database.set_pinned("missing".to_string(), true);

        assert!(matches!(result, Err(AppError::NoteNotFound)));
    }

    #[test]
    fn delete_empty_note_removes_only_whitespace_content_notes() {
        let database = Database::new_in_memory().unwrap();
        let empty = database.create_note("not empty yet".to_string()).unwrap();
        database
            .update_note(empty.id.clone(), "   \n".to_string())
            .unwrap();
        let non_empty = database.create_note("keep".to_string()).unwrap();

        database.delete_empty_note(empty.id.clone()).unwrap();
        database.delete_empty_note(non_empty.id.clone()).unwrap();

        assert!(database.get_note(empty.id).unwrap().is_none());
        assert!(database.get_note(non_empty.id).unwrap().is_some());
    }

    #[test]
    fn delete_empty_note_is_harmless_for_missing_ids() {
        let database = Database::new_in_memory().unwrap();

        assert!(database.delete_empty_note("missing".to_string()).is_ok());
    }

    #[test]
    fn soft_delete_note_hides_note_from_list_and_get() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("trash me".to_string()).unwrap();

        database.soft_delete_note(note.id.clone()).unwrap();

        assert!(database.list_notes(None).unwrap().is_empty());
        assert!(database.get_note(note.id.clone()).unwrap().is_none());
        assert_eq!(database.list_trashed_notes(None).unwrap()[0].id, note.id);
    }

    #[test]
    fn restore_note_returns_note_to_active_lists() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("restore me".to_string()).unwrap();
        database.soft_delete_note(note.id.clone()).unwrap();

        let restored = database.restore_note(note.id.clone()).unwrap();

        assert_eq!(restored.id, note.id);
        assert_eq!(database.list_notes(None).unwrap()[0].id, note.id);
        assert!(database.list_trashed_notes(None).unwrap().is_empty());
    }

    #[test]
    fn permanently_delete_note_removes_trashed_note() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("delete me".to_string()).unwrap();
        database.soft_delete_note(note.id.clone()).unwrap();

        database.permanently_delete_note(note.id.clone()).unwrap();

        assert!(database.get_note(note.id.clone()).unwrap().is_none());
        assert!(database.get_trashed_note(note.id).unwrap().is_none());
    }

    #[test]
    fn settings_round_trip_and_overwrite() {
        let database = Database::new_in_memory().unwrap();

        assert_eq!(database.get_setting("theme".to_string()).unwrap(), None);

        database
            .set_setting("theme".to_string(), "light".to_string())
            .unwrap();
        assert_eq!(
            database.get_setting("theme".to_string()).unwrap(),
            Some("light".to_string())
        );

        database
            .set_setting("theme".to_string(), "dark".to_string())
            .unwrap();
        assert_eq!(
            database.get_setting("theme".to_string()).unwrap(),
            Some("dark".to_string())
        );
    }

    #[test]
    fn initializes_folder_tables_on_fresh_database() {
        let database = Database::new_in_memory().unwrap();
        let connection = database.lock_connection();

        let folder_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('folders', 'note_folders')",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(folder_count, 2);
    }

    #[test]
    fn create_folder_trims_name() {
        let database = Database::new_in_memory().unwrap();

        let folder = database.create_folder("  Work  ".to_string()).unwrap();

        assert_eq!(folder.name, "Work");
        assert_eq!(folder.note_count, 0);
    }

    #[test]
    fn create_folder_rejects_empty_name() {
        let database = Database::new_in_memory().unwrap();
        let result = database.create_folder("  \n\t ".to_string());

        assert!(matches!(result, Err(AppError::EmptyFolderName)));
    }

    #[test]
    fn create_folder_rejects_overlong_name() {
        let database = Database::new_in_memory().unwrap();
        let result = database.create_folder("a".repeat(41));

        assert!(matches!(result, Err(AppError::FolderNameTooLong)));
    }

    #[test]
    fn duplicate_folder_creation_returns_existing_folder() {
        let database = Database::new_in_memory().unwrap();
        let first = database.create_folder("Work".to_string()).unwrap();
        let second = database.create_folder("work".to_string()).unwrap();

        assert_eq!(second.id, first.id);
        assert_eq!(database.list_folders().unwrap().len(), 1);
    }

    #[test]
    fn assigns_multiple_folders_to_note() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("file me".to_string()).unwrap();
        let work = database.create_folder("Work".to_string()).unwrap();
        let home = database.create_folder("Home".to_string()).unwrap();

        let updated = database
            .set_note_folders(note.id, vec![work.id.clone(), home.id.clone()])
            .unwrap();

        let folder_ids = updated
            .folders
            .iter()
            .map(|folder| folder.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(folder_ids, vec![home.id.as_str(), work.id.as_str()]);
    }

    #[test]
    fn removing_all_folders_leaves_note_unfiled() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("file me".to_string()).unwrap();
        let folder = database.create_folder("Work".to_string()).unwrap();
        database
            .set_note_folders(note.id.clone(), vec![folder.id])
            .unwrap();

        let updated = database.set_note_folders(note.id, vec![]).unwrap();

        assert!(updated.folders.is_empty());
    }

    #[test]
    fn listing_notes_by_folder_returns_only_matching_notes() {
        let database = Database::new_in_memory().unwrap();
        let matching = database.create_note("matching".to_string()).unwrap();
        let other = database.create_note("other".to_string()).unwrap();
        let folder = database.create_folder("Work".to_string()).unwrap();
        database
            .set_note_folders(matching.id.clone(), vec![folder.id.clone()])
            .unwrap();

        let notes = database.list_notes_by_folder(folder.id, None).unwrap();

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, matching.id);
        assert_ne!(notes[0].id, other.id);
    }

    #[test]
    fn folder_note_counts_are_correct() {
        let database = Database::new_in_memory().unwrap();
        let first = database.create_note("first".to_string()).unwrap();
        let second = database.create_note("second".to_string()).unwrap();
        let folder = database.create_folder("Work".to_string()).unwrap();
        database
            .set_note_folders(first.id, vec![folder.id.clone()])
            .unwrap();
        database
            .set_note_folders(second.id, vec![folder.id.clone()])
            .unwrap();

        let folders = database.list_folders().unwrap();

        assert_eq!(folders[0].note_count, 2);
    }

    #[test]
    fn list_notes_by_folder_excludes_trashed_notes() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("filed".to_string()).unwrap();
        let folder = database.create_folder("Work".to_string()).unwrap();
        database
            .set_note_folders(note.id.clone(), vec![folder.id.clone()])
            .unwrap();

        database.soft_delete_note(note.id).unwrap();

        assert_eq!(database.list_folders().unwrap()[0].note_count, 0);
        assert!(database
            .list_notes_by_folder(folder.id, None)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn deleting_folder_with_notes_moves_those_notes_to_trash() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("delete me".to_string()).unwrap();
        let folder = database.create_folder("Work".to_string()).unwrap();
        database
            .set_note_folders(note.id.clone(), vec![folder.id.clone()])
            .unwrap();

        database.delete_folder(folder.id).unwrap();

        assert!(database.get_note(note.id).unwrap().is_none());
        assert_eq!(database.list_trashed_notes(None).unwrap().len(), 1);
        assert!(database.list_folders().unwrap().is_empty());
    }

    #[test]
    fn deleting_folder_with_shared_notes_moves_shared_notes_to_trash() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("shared".to_string()).unwrap();
        let work = database.create_folder("Work".to_string()).unwrap();
        let home = database.create_folder("Home".to_string()).unwrap();
        database
            .set_note_folders(note.id.clone(), vec![work.id.clone(), home.id.clone()])
            .unwrap();

        database.delete_folder(work.id).unwrap();

        assert!(database.get_note(note.id.clone()).unwrap().is_none());
        assert_eq!(database.list_trashed_notes(None).unwrap()[0].id, note.id);
        assert_eq!(
            database.list_notes_by_folder(home.id, None).unwrap().len(),
            0
        );
    }

    #[test]
    fn initialize_connection_migrates_old_notes_table() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE notes (
                  id TEXT PRIMARY KEY,
                  content TEXT NOT NULL,
                  pinned INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                ",
            )
            .unwrap();

        initialize_connection(&connection).unwrap();

        let columns = {
            let mut statement = connection.prepare("PRAGMA table_info(notes)").unwrap();
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert!(columns.iter().any(|column| column == "deleted_at"));
    }

    #[test]
    fn deleting_missing_folder_returns_not_found() {
        let database = Database::new_in_memory().unwrap();
        let result = database.delete_folder("missing".to_string());

        assert!(matches!(result, Err(AppError::FolderNotFound)));
    }

    #[test]
    fn archive_note_hides_note_from_recent_lists() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("archive me".to_string()).unwrap();
        database.set_pinned(note.id.clone(), true).unwrap();

        let archived = database.archive_note(note.id.clone()).unwrap();

        assert!(archived.archived_at.is_some());
        assert!(!archived.pinned);
        assert!(database.list_notes(None).unwrap().is_empty());
        assert_eq!(database.list_archived_notes(None).unwrap()[0].id, note.id);
        assert!(database.get_note(note.id.clone()).unwrap().is_none());
    }

    #[test]
    fn unarchive_note_restores_note_to_recent_lists() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("restore archive".to_string()).unwrap();
        database.archive_note(note.id.clone()).unwrap();

        let restored = database.unarchive_note(note.id.clone()).unwrap();

        assert!(restored.archived_at.is_none());
        assert_eq!(database.list_notes(None).unwrap()[0].id, note.id);
        assert!(database.list_archived_notes(None).unwrap().is_empty());
    }

    #[test]
    fn list_notes_by_folder_excludes_archived_notes() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("filed".to_string()).unwrap();
        let folder = database.create_folder("Work".to_string()).unwrap();
        database
            .set_note_folders(note.id.clone(), vec![folder.id.clone()])
            .unwrap();

        database.archive_note(note.id).unwrap();

        assert_eq!(database.list_folders().unwrap()[0].note_count, 0);
        assert!(database
            .list_notes_by_folder(folder.id, None)
            .unwrap()
            .is_empty());
    }

    impl Database {
        fn set_created_at_for_test(&self, id: &str, created_at: &str) -> Result<(), AppError> {
            let connection = self.lock_connection();
            connection.execute(
                "UPDATE notes SET created_at = ?1 WHERE id = ?2",
                params![created_at, id],
            )?;
            Ok(())
        }
    }

    #[test]
    fn list_notes_by_created_date_returns_notes_within_day_bounds() {
        let database = Database::new_in_memory().unwrap();
        let in_day = database.create_note("today note".to_string()).unwrap();
        let next_day = database.create_note("tomorrow note".to_string()).unwrap();
        database
            .set_created_at_for_test(&in_day.id, "2026-06-08T14:30:00Z")
            .unwrap();
        database
            .set_created_at_for_test(&next_day.id, "2026-06-09T00:00:01Z")
            .unwrap();

        let notes = database
            .list_notes_by_created_date(
                "2026-06-08T00:00:00Z".to_string(),
                "2026-06-09T00:00:00Z".to_string(),
                None,
            )
            .unwrap();

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, in_day.id);
    }

    #[test]
    fn list_notes_by_created_date_excludes_trashed_and_archived_notes() {
        let database = Database::new_in_memory().unwrap();
        let active = database.create_note("active".to_string()).unwrap();
        let trashed = database.create_note("trashed".to_string()).unwrap();
        let archived = database.create_note("archived".to_string()).unwrap();
        let start = "2026-06-08T00:00:00Z".to_string();
        let end = "2026-06-09T00:00:00Z".to_string();

        for note in [&active, &trashed, &archived] {
            database
                .set_created_at_for_test(&note.id, "2026-06-08T12:00:00Z")
                .unwrap();
        }

        database.soft_delete_note(trashed.id.clone()).unwrap();
        database.archive_note(archived.id.clone()).unwrap();

        let notes = database
            .list_notes_by_created_date(start, end, None)
            .unwrap();

        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, active.id);
    }

    #[test]
    fn list_notes_by_created_date_orders_pinned_first_then_newest_created() {
        let database = Database::new_in_memory().unwrap();
        let older = database.create_note("older".to_string()).unwrap();
        let newer = database.create_note("newer".to_string()).unwrap();
        database
            .set_created_at_for_test(&older.id, "2026-06-08T10:00:00Z")
            .unwrap();
        database
            .set_created_at_for_test(&newer.id, "2026-06-08T18:00:00Z")
            .unwrap();
        database.set_pinned(older.id.clone(), true).unwrap();

        let notes = database
            .list_notes_by_created_date(
                "2026-06-08T00:00:00Z".to_string(),
                "2026-06-09T00:00:00Z".to_string(),
                None,
            )
            .unwrap();
        let ids = notes.iter().map(|note| note.id.as_str()).collect::<Vec<_>>();

        assert_eq!(ids, vec![older.id.as_str(), newer.id.as_str()]);
    }

    #[test]
    fn initialize_connection_migrates_archived_at_column() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE notes (
                  id TEXT PRIMARY KEY,
                  content TEXT NOT NULL,
                  pinned INTEGER NOT NULL DEFAULT 0,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  deleted_at TEXT
                );
                ",
            )
            .unwrap();

        initialize_connection(&connection).unwrap();

        let columns = {
            let mut statement = connection.prepare("PRAGMA table_info(notes)").unwrap();
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        assert!(columns.iter().any(|column| column == "archived_at"));
    }
}
