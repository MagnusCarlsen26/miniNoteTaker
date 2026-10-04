package com.quicknote.todo

internal data class ParsedTodo(val ordinal: Int, val title: String, val details: String,
    val text: String, val start: Int, val end: Int, val completed: Boolean)
internal object TodoParser {
    fun parse(content: String): List<ParsedTodo> {
        val markers = Regex("^[\\t ]*--([^\\r\\n]*)", RegexOption.MULTILINE).findAll(content).toList()
        return markers.mapIndexedNotNull { ordinal, marker ->
            val end = markers.getOrNull(ordinal + 1)?.range?.first ?: content.length
            val lines = content.substring(marker.range.last + 1, end).split(Regex("\\r?\\n")).toMutableList()
            var heading = marker.groupValues[1].trim()
            val token = Regex("^\\[([xX ])\\]").find(heading)
            val completed = token?.groupValues?.get(1)?.lowercase() == "x"
            if (token != null) heading = heading.substring(token.value.length).trim()
            if (heading.isEmpty()) {
                val first = lines.indexOfFirst { it.trim().isNotEmpty() }
                if (first < 0) return@mapIndexedNotNull null
                heading = lines[first].trim()
                repeat(first + 1) { lines.removeAt(0) }
            }
            val details = lines.joinToString("\n").trim()
            ParsedTodo(ordinal, heading, details, heading + if (details.isEmpty()) "" else "\n$details",
                marker.range.first, end, completed)
        }
    }
    fun complete(content: String, entry: ParsedTodo): String {
        val marker = Regex("[\\t ]*--[\\t ]*(?:\\[[xX ]\\])?").find(content, entry.start)!!
        val original = marker.value
        val dash = original.indexOf("--")
        // Replace only the marker/token; preserve existing whitespace before title.
        val tail = original.substring(dash + 2)
        val token = Regex("\\[[xX ]\\]").find(tail)
        val replacement = if (token != null) original.substring(0, dash + 2) + tail.replaceRange(token.range, "[x]")
            else original.substring(0, dash + 2) + " [x]" + tail
        return content.replaceRange(marker.range, replacement)
    }
}
