package com.quicknote.todo

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TodoMutationsTest {
    private lateinit var context: Context
    private lateinit var file: File
    private fun db() = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READWRITE)
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        file = File(context.filesDir, "SQLite/quicknote-mobile.db")
        file.parentFile!!.mkdirs(); file.delete()
        SQLiteDatabase.openOrCreateDatabase(file, null).use {
            it.execSQL("CREATE TABLE mobile_notes(id TEXT PRIMARY KEY,data TEXT NOT NULL)")
            it.execSQL("CREATE TABLE mobile_settings(id INTEGER PRIMARY KEY,data TEXT NOT NULL)")
            it.execSQL("INSERT INTO mobile_settings VALUES(1,'{\"theme\":\"light\",\"lastEditedId\":\"previous\"}')")
            it.execSQL("CREATE TABLE todo_schema(id INTEGER PRIMARY KEY,version INTEGER NOT NULL)")
            it.execSQL("INSERT INTO todo_schema VALUES(1,2)")
            it.execSQL("CREATE TABLE todo_entries(id TEXT PRIMARY KEY,note_id TEXT,ordinal INTEGER,title TEXT,details TEXT,text TEXT,start_offset INTEGER,end_offset INTEGER,pinned INTEGER,updated_at TEXT)")
        }
    }
    private fun note(id: String): JSONObject = db().use { database ->
        database.rawQuery("SELECT data FROM mobile_notes WHERE id=?", arrayOf(id)).use { assertTrue(it.moveToFirst()); JSONObject(it.getString(0)) }
    }
    private fun count(table: String) = db().use { database -> database.rawQuery("SELECT COUNT(*) FROM $table", null).use { it.moveToFirst(); it.getInt(0) } }
    private fun tap(content: String, ordinal: Int): Uri {
        val entry = TodoParser.parse(content).first { it.ordinal == ordinal }
        return Uri.Builder().scheme("quicknote").authority("todo").appendQueryParameter("note", "test")
            .appendQueryParameter("ordinal", ordinal.toString()).appendQueryParameter("start", entry.start.toString())
            .appendQueryParameter("fingerprint", fingerprint(entry.text)).build()
    }
    @Test fun createIsIdempotentAndPreservesSelectionAcrossRestart() {
        TodoMutations.create(context, "test", "First 😀", "Details\n-- Second")
        TodoMutations.create(context, "test", "Duplicate", "")
        assertEquals(1, count("mobile_notes")); assertEquals(2, count("todo_entries"))
        assertEquals("-- First 😀\nDetails\n-- Second", note("test").getString("content"))
        assertTrue(note("test").getBoolean("isTodo")); assertEquals(0, note("test").getJSONArray("folderIds").length())
        db().use { database -> database.rawQuery("SELECT data FROM mobile_settings", null).use { it.moveToFirst(); assertEquals("previous", JSONObject(it.getString(0)).getString("lastEditedId")) } }
    }
    @Test fun completionRejectsStaleTapsAndRepeatedRequestsAreHarmless() {
        TodoMutations.create(context, "test", "Same", "-- Same")
        val original = note("test").getString("content")
        val first = tap(original, 0); val second = tap(original, 1)
        TodoMutations.complete(context, first)
        TodoMutations.complete(context, first)
        TodoMutations.complete(context, second) // offset shifted: must refresh, not complete.
        assertEquals("-- [x] Same\n-- Same", note("test").getString("content"))
        assertEquals(1, count("todo_entries"))
        TodoMutations.complete(context, tap(note("test").getString("content"), 1))
        assertEquals(0, count("todo_entries"))
    }
    @Test fun mutationRollbackRetainsSourceAndProjectionAndAllowsRetry() {
        TodoMutations.create(context, "test", "First", "-- Second")
        val original = note("test").getString("content")
        db().use { it.execSQL("CREATE TRIGGER fail BEFORE INSERT ON todo_entries BEGIN SELECT RAISE(ABORT,'disk full'); END") }
        try { TodoMutations.complete(context, tap(original, 0)); fail("Expected rollback") } catch (_: android.database.SQLException) {}
        assertEquals(original, note("test").getString("content")); assertEquals(2, count("todo_entries"))
        try { TodoMutations.create(context, "new", "New", ""); fail("Expected rollback") } catch (_: android.database.SQLException) {}
        assertEquals(1, count("mobile_notes"))
        db().use { it.execSQL("DROP TRIGGER fail") }
        TodoMutations.create(context, "new", "New", "")
        assertEquals(2, count("mobile_notes"))
    }
    @Test fun schemaMigrationExcludesPreviouslyCompletedEntries() {
        TodoMutations.create(context, "test", "[x] Done", "-- Active")
        db().use { it.execSQL("UPDATE todo_schema SET version=1"); it.execSQL("UPDATE todo_entries SET title='old'") }
        TodoMutations.create(context, "new", "New", "")
        assertEquals(2, count("todo_entries"))
        db().use { database -> database.rawQuery("SELECT title FROM todo_entries WHERE note_id='test'", null).use { it.moveToFirst(); assertEquals("Active", it.getString(0)) } }
    }
}
