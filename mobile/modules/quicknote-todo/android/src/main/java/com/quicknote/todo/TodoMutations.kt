package com.quicknote.todo

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

internal object TodoMutations {
    private fun now() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
    val executor = Executors.newSingleThreadExecutor()
    private fun transaction(context: Context, action: (SQLiteDatabase) -> Unit) {
        val file = File(context.filesDir, "SQLite/quicknote-mobile.db")
        check(file.exists()) { "Open Quicknote once before using the widget." }
        SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING).use { db ->
            db.execSQL("PRAGMA synchronous = FULL")
            db.beginTransaction()
            try { migrate(db); action(db); db.setTransactionSuccessful() }
            finally { db.endTransaction() }
        }
        try { TodoWidget.refresh(context) } catch (_: Exception) { /* A refresh cannot undo a commit. */ }
    }
    fun ensureSchema(context: Context) {
        val file = File(context.filesDir, "SQLite/quicknote-mobile.db")
        val version = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
            db.rawQuery("SELECT version FROM todo_schema WHERE id=1", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }
        }
        if (version >= 2) return
        SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.ENABLE_WRITE_AHEAD_LOGGING).use { db ->
            db.execSQL("PRAGMA synchronous = FULL")
            db.beginTransaction()
            try { migrate(db); db.setTransactionSuccessful() } finally { db.endTransaction() }
        }
    }
    private fun migrate(db: SQLiteDatabase) {
        val version = db.rawQuery("SELECT version FROM todo_schema WHERE id=1", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }
        if (version >= 2) return
        db.execSQL("DELETE FROM todo_entries")
        db.rawQuery("SELECT data FROM mobile_notes", null).use {
            while (it.moveToNext()) project(db, JSONObject(it.getString(0)))
        }
        db.execSQL("INSERT OR REPLACE INTO todo_schema(id,version) VALUES(1,2)")
    }
    private fun project(db: SQLiteDatabase, note: JSONObject) {
        val id = note.getString("id")
        db.execSQL("DELETE FROM todo_entries WHERE note_id=?", arrayOf(id))
        if (!note.optBoolean("isTodo") || !note.isNull("deletedAt") || !note.isNull("archivedAt")) return
        TodoParser.parse(note.getString("content")).filter { !it.completed }.forEach {
            db.execSQL("INSERT INTO todo_entries(id,note_id,ordinal,title,details,text,start_offset,end_offset,pinned,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                arrayOf("$id:${it.ordinal}", id, it.ordinal, it.title, it.details, it.text, it.start, it.end, if (note.optBoolean("pinned")) 1 else 0, note.getString("updatedAt")))
        }
    }
    fun complete(context: Context, uri: Uri) = transaction(context) { db ->
        val id = uri.getQueryParameter("note") ?: return@transaction
        val note = db.rawQuery("SELECT data FROM mobile_notes WHERE id=?", arrayOf(id)).use {
            if (it.moveToFirst()) JSONObject(it.getString(0)) else null
        } ?: return@transaction
        if (!note.optBoolean("isTodo") || !note.isNull("deletedAt") || !note.isNull("archivedAt")) return@transaction
        val content = note.getString("content")
        val entry = TodoParser.parse(content).find {
            it.ordinal == uri.getQueryParameter("ordinal")?.toIntOrNull() &&
                it.start == uri.getQueryParameter("start")?.toIntOrNull() && fingerprint(it.text) == uri.getQueryParameter("fingerprint")
        } ?: return@transaction
        if (entry.completed) return@transaction
        note.put("content", TodoParser.complete(content, entry)).put("updatedAt", now())
        db.execSQL("UPDATE mobile_notes SET data=? WHERE id=?", arrayOf(note.toString(), id))
        project(db, note)
    }
    fun create(context: Context, id: String, title: String, details: String) {
        require(title.trim().isNotEmpty() && !title.contains('\n') && !title.contains('\r'))
        transaction(context) { db ->
            val exists = db.rawQuery("SELECT id FROM mobile_notes WHERE id=?", arrayOf(id)).use { it.moveToFirst() }
            if (exists) return@transaction
            val now = now()
            val note = JSONObject().put("id", id).put("content", "-- ${title.trim()}" + if (details.isEmpty()) "" else "\n$details")
                .put("createdAt", now).put("updatedAt", now).put("pinned", false).put("isTodo", true)
                .put("folderIds", JSONArray()).put("archivedAt", JSONObject.NULL).put("deletedAt", JSONObject.NULL)
            db.execSQL("INSERT INTO mobile_notes(id,data) VALUES(?,?)", arrayOf(id, note.toString()))
            project(db, note)
        }
    }
}
