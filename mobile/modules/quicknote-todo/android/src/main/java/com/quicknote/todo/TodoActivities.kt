package com.quicknote.todo

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.content.Context
import android.text.InputType
import android.text.TextWatcher
import android.text.Editable
import android.widget.*
import java.util.UUID

class TodoActionActivity : Activity() {
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val uri = intent.data
        if (intent.getStringExtra("operation") != "complete") {
            packageManager.getLaunchIntentForPackage(packageName)?.let {
                it.data = uri
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                startActivity(it)
            }
            finish()
            return
        }
        val context = applicationContext
        TodoMutations.executor.execute {
            try { if (uri != null) TodoMutations.complete(context, uri) }
            catch (_: Exception) { runOnUiThread { Toast.makeText(context, "Could not complete todo. Try again.", Toast.LENGTH_SHORT).show() } }
            finally { runOnUiThread { finish() } }
        }
    }
}
class TodoCreateActivity : Activity() {
    private var saving = false
    private lateinit var title: EditText
    private lateinit var details: EditText
    private lateinit var save: Button
    private lateinit var error: TextView
    private var submission = UUID.randomUUID().toString()
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        submission = state?.getString("submission") ?: submission
        TodoMutations.executor.execute {
            val dark = TodoData.read(applicationContext, false).dark
            runOnUiThread { if (!isFinishing) showDialog(state, dark) }
        }
    }
    private fun showDialog(state: Bundle?, dark: Boolean) {
        val foreground = Color.parseColor(if (dark) "#eef8f0" else "#172d21")
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            setBackgroundColor(Color.parseColor(if (dark) "#163326" else "#e8f5eb"))
        }
        root.addView(TextView(this).apply { text = "Create todo"; textSize = 20f; setTextColor(foreground) })
        title = EditText(this).apply { id = 101; hint = "Title"; contentDescription = "Todo title"; setSingleLine(true); setTextColor(foreground); setHintTextColor(foreground); inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES }
        details = EditText(this).apply { id = 102; hint = "Details (optional)"; setTextColor(foreground); setHintTextColor(foreground); inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE; minLines = 2; maxLines = 4 }
        title.setText(state?.getString("title") ?: "")
        details.setText(state?.getString("details") ?: "")
        val fields = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fields.addView(title); fields.addView(details)
        error = TextView(this).apply { setTextColor(foreground) }; fields.addView(error)
        val scroll = ScrollView(this).apply { isFillViewport = true; addView(fields) }
        // Fields can shrink and scroll while the action row stays above the IME.
        root.addView(scroll, LinearLayout.LayoutParams(-1, -2, 1f))
        val actions = LinearLayout(this)
        val cancel = Button(this).apply { text = "Cancel"; setOnClickListener { if (!saving) finish() } }
        save = Button(this).apply { text = "Save"; isEnabled = false }
        actions.addView(cancel, LinearLayout.LayoutParams(0, -2, 1f)); actions.addView(save, LinearLayout.LayoutParams(0, -2, 1f)); root.addView(actions)
        title.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { save.isEnabled = !saving && valid() }
            override fun afterTextChanged(s: Editable?) {}
        })
        save.isEnabled = valid()
        save.setOnClickListener {
            if (saving || !valid()) return@setOnClickListener
            saving = true; save.isEnabled = false; cancel.isEnabled = false
            title.isEnabled = false; details.isEnabled = false
            val heading = title.text.toString(); val body = details.text.toString()
            TodoMutations.executor.execute {
                try {
                    TodoMutations.create(applicationContext, submission, heading, body)
                    runOnUiThread { finish() }
                } catch (_: Exception) {
                    runOnUiThread {
                        saving = false; save.isEnabled = valid(); cancel.isEnabled = true
                        title.isEnabled = true; details.isEnabled = true
                        error.text = "Could not save. Retry."; save.text = "Retry"
                    }
                }
            }
        }
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        setContentView(root)
        window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        title.requestFocus()
        title.post { (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(title, InputMethodManager.SHOW_IMPLICIT) }
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun valid() = title.text.toString().let { it.trim().isNotEmpty() && !it.contains('\n') && !it.contains('\r') }
    override fun onSaveInstanceState(out: Bundle) {
        out.putString("submission", submission)
        if (::title.isInitialized) { out.putString("title", title.text.toString()); out.putString("details", details.text.toString()) }
        super.onSaveInstanceState(out)
    }
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (!saving) super.onBackPressed() }
}
