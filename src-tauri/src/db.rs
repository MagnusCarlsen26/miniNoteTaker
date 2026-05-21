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
             WHERE id = ?3",
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
            "SELECT id, content, pinned, created_at, updated_at
             FROM notes
             ORDER BY pinned DESC, updated_at DESC
             LIMIT ?1",
        )?;

        let notes = statement
            .query_map(params![limit], note_from_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(notes)
    }

    pub fn get_note(&self, id: String) -> Result<Option<NoteDto>, AppError> {
        let connection = self.lock_connection();
        connection
            .query_row(
                "SELECT id, content, pinned, created_at, updated_at
                 FROM notes
                 WHERE id = ?1",
                params![id],
                note_from_row,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn set_pinned(&self, id: String, pinned: bool) -> Result<NoteDto, AppError> {
        let updated_at = now_timestamp();
        let connection = self.lock_connection();
        let affected = connection.execute(
            "UPDATE notes
             SET pinned = ?1, updated_at = ?2
             WHERE id = ?3",
            params![pinned as i64, updated_at, id],
        )?;

        if affected == 0 {
            return Err(AppError::NoteNotFound);
        }
        drop(connection);

        self.get_note(id)?.ok_or(AppError::NoteNotFound)
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
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_notes_updated_at
        ON notes(updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated_at
        ON notes(pinned DESC, updated_at DESC);

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ",
    )?;

    Ok(())
}

fn note_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteDto> {
    Ok(NoteDto {
        id: row.get(0)?,
        content: row.get(1)?,
        pinned: row.get::<_, i64>(2)? != 0,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
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
    fn set_pinned_persists_pinned_state() {
        let database = Database::new_in_memory().unwrap();
        let note = database.create_note("pin me".to_string()).unwrap();

        let pinned = database.set_pinned(note.id.clone(), true).unwrap();
        let fetched = database.get_note(note.id).unwrap().unwrap();

        assert!(pinned.pinned);
        assert!(fetched.pinned);
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
}
