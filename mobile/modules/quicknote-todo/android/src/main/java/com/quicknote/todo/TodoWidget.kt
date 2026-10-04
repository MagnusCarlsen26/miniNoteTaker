package com.quicknote.todo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONObject
import java.io.File

private fun fingerprint(text: String): String {
    var hash = 2166136261L.toInt()
    text.forEach { hash = (hash xor it.code) * 16777619 }
    return Integer.toUnsignedString(hash, 16)
}
internal data class Entry(val id: String, val noteId: String, val ordinal: Int,
    val title: String, val details: String, val text: String, val start: Int)
internal data class Projection(val entries: List<Entry>, val dark: Boolean, val count: Int = entries.size)
internal object TodoData {
    fun read(context: Context, includeEntries: Boolean = true): Projection {
        val systemDark = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        // Expo SQLite's default private directory. Open read-only: widgets never create or write it.
        val file = File(context.filesDir, "SQLite/quicknote-mobile.db")
        if (!file.exists()) return Projection(emptyList(), systemDark)
        return try {
            SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                val theme = db.rawQuery("SELECT data FROM mobile_settings WHERE id = 1", null).use {
                    if (it.moveToFirst()) JSONObject(it.getString(0)).optString("theme", "system") else "system"
                }
                val entries = mutableListOf<Entry>()
                if (includeEntries) db.rawQuery("SELECT id, note_id, ordinal, title, details, text, start_offset FROM todo_entries ORDER BY pinned DESC, updated_at DESC, (SELECT rowid FROM mobile_notes WHERE mobile_notes.id = todo_entries.note_id), ordinal", null).use {
                    while (it.moveToNext()) entries.add(Entry(it.getString(0), it.getString(1), it.getInt(2), it.getString(3), it.getString(4), it.getString(5), it.getInt(6)))
                }
                val count = if (includeEntries) entries.size else db.rawQuery("SELECT COUNT(*) FROM todo_entries", null).use {
                    if (it.moveToFirst()) it.getInt(0) else 0
                }
                Projection(entries, theme == "dark" || (theme != "light" && systemDark), count)
            }
        } catch (_: Exception) { Projection(emptyList(), systemDark) }
    }
}
class TodoWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { ids.forEach { update(context, manager, it) } }
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { update(context, manager, id) }
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == Intent.ACTION_CONFIGURATION_CHANGED) refresh(context)
    }
    companion object {
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            manager.getAppWidgetIds(ComponentName(context, TodoWidget::class.java)).forEach { update(context, manager, it) }
        }
        @Suppress("DEPRECATION")
        private fun update(context: Context, manager: AppWidgetManager, id: Int) {
            val data = TodoData.read(context, includeEntries = false)
            val options = manager.getAppWidgetOptions(id)
            val compact = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) < 180 || options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) < 220
            val views = RemoteViews(context.packageName, R.layout.todo_widget)
            views.setInt(R.id.todo_card, "setBackgroundResource", if (data.dark) R.drawable.todo_dark else R.drawable.todo_light)
            val text = Color.parseColor(if (data.dark) "#eef8f0" else "#172d21")
            views.setTextColor(R.id.todo_header, text)
            views.setTextColor(R.id.todo_empty, Color.parseColor(if (data.dark) "#adc5b5" else "#4e6657"))
            views.setTextViewText(R.id.todo_header, "Todo · ${data.count}")
            val adapter = Intent(context, TodoService::class.java).apply {
                putExtra("compact", compact)
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                this.data = Uri.parse("quicknote-widget://adapter/$id/$compact/${data.dark}")
            }
            views.setRemoteAdapter(R.id.todo_list, adapter)
            views.setEmptyView(R.id.todo_list, R.id.todo_empty)
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            launch.data = Uri.parse("quicknote://todo")
            val heading = PendingIntent.getActivity(context, id, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.todo_header, heading)
            views.setOnClickPendingIntent(R.id.todo_empty, heading)
            // Only this explicit app activity receives mutable collection fill-in intents.
            val template = Intent(launch).apply { this.data = null }
            views.setPendingIntentTemplate(R.id.todo_list, PendingIntent.getActivity(context, id + 100000, template, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE))
            manager.updateAppWidget(id, views)
            manager.notifyAppWidgetViewDataChanged(id, R.id.todo_list)
        }
    }
}
class TodoService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext, intent.getBooleanExtra("compact", false))
    private class Factory(val context: Context, val compact: Boolean) : RemoteViewsFactory {
        var projection = Projection(emptyList(), false)
        override fun onCreate() { onDataSetChanged() }
        override fun onDataSetChanged() { projection = TodoData.read(context) }
        override fun onDestroy() { projection = Projection(emptyList(), false) }
        override fun getCount() = projection.entries.size
        override fun getViewAt(position: Int): RemoteViews? {
            val entry = projection.entries.getOrNull(position) ?: return null
            return RemoteViews(context.packageName, R.layout.todo_row).apply {
                setTextViewText(R.id.todo_title, entry.title.take(2000))
                setTextViewText(R.id.todo_details, entry.details.take(2000))
                setViewVisibility(R.id.todo_details, if (compact || entry.details.isBlank()) View.GONE else View.VISIBLE)
                setTextColor(R.id.todo_title, Color.parseColor(if (projection.dark) "#eef8f0" else "#172d21"))
                setTextColor(R.id.todo_details, Color.parseColor(if (projection.dark) "#adc5b5" else "#4e6657"))
                setTextColor(R.id.todo_bullet, Color.parseColor(if (projection.dark) "#92dfaf" else "#216d43"))
                setContentDescription(R.id.todo_row, entry.text)
                val uri = Uri.Builder().scheme("quicknote").authority("todo").appendQueryParameter("note", entry.noteId)
                    .appendQueryParameter("ordinal", entry.ordinal.toString()).appendQueryParameter("fingerprint", fingerprint(entry.text))
                    .appendQueryParameter("start", entry.start.toString()).build()
                setOnClickFillInIntent(R.id.todo_row, Intent().setData(uri))
            }
        }
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        // Position ids avoid hash collisions for duplicate text; dataset changes invalidate positions.
        override fun getItemId(position: Int) = position.toLong()
        override fun hasStableIds() = false
    }
}
