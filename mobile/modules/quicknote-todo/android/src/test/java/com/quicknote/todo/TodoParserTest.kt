package com.quicknote.todo

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class TodoParserTest {
    @Test fun sharedFixtures() {
        val fixtures = JSONArray(javaClass.classLoader!!.getResource("todos.json")!!.readText())
        for (i in 0 until fixtures.length()) {
            val fixture = fixtures.getJSONObject(i)
            val parsed = TodoParser.parse(fixture.getString("content"))
            val expected = fixture.getJSONArray("expected")
            assertEquals(fixture.getString("name"), expected.length(), parsed.size)
            parsed.forEachIndexed { index, entry ->
                val e = expected.getJSONObject(index)
                assertEquals(e.getInt("ordinal"), entry.ordinal)
                assertEquals(e.getInt("start"), entry.start)
                assertEquals(e.getInt("end"), entry.end)
                assertEquals(e.getString("title"), entry.title)
                assertEquals(e.getString("details"), entry.details)
                assertEquals(e.getString("text"), entry.text)
                assertEquals(e.getBoolean("completed"), entry.completed)
            }
        }
    }
    @Test fun completionPreservesSourceAndReopens() {
        val source = "Intro 😀\r\n\t-- [ ] Same\r\n  Details\r\n  -- Same\r\nTail"
        val entry = TodoParser.parse(source)[1]
        val done = TodoParser.complete(source, entry)
        assertEquals("Intro 😀\r\n\t-- [ ] Same\r\n  Details\r\n  -- [x] Same\r\nTail", done)
        val parsed = TodoParser.parse(done)[1]
        assertTrue(parsed.completed)
        assertEquals(done, TodoParser.complete(done, parsed))
        assertFalse(TodoParser.parse(done.replace("[x]", "[ ]"))[1].completed)
        assertFalse(TodoParser.parse(done.replace("[x]", ""))[1].completed)
    }
}
