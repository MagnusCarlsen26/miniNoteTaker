package com.quicknote.todo

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class QuicknoteTodoModule : Module() {
    private var pending: String? = null
    override fun definition() = ModuleDefinition {
        Name("QuicknoteTodo")
        AsyncFunction("refresh") { appContext.reactContext?.let { TodoWidget.refresh(it) } }
        OnNewIntent { intent ->
            val uri = intent.data
            if (uri?.scheme == "quicknote" && uri.host == "todo") pending = uri.toString()
        }
        Function("getPendingNavigation") {
            val intent = appContext.currentActivity?.intent
            val uri = intent?.data
            if (uri?.scheme == "quicknote" && uri.host == "todo") {
                intent?.data = null
                val result = pending ?: uri.toString()
                pending = null
                result
            } else pending.also { pending = null }
        }
    }
}
