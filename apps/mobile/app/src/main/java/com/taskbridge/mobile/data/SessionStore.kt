package com.taskbridge.mobile.data

import android.content.Context
import android.content.SharedPreferences
import com.taskbridge.mobile.domain.models.RecentTask

class SessionStore(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("task_bridge", Context.MODE_PRIVATE)

    var backendHost: String
        get() = prefs.getString(KEY_BACKEND_HOST, DEFAULT_HOST) ?: DEFAULT_HOST
        set(value) = prefs.edit().putString(KEY_BACKEND_HOST, value).apply()

    var backendPort: Int
        get() = prefs.getInt(KEY_BACKEND_PORT, DEFAULT_PORT)
        set(value) = prefs.edit().putInt(KEY_BACKEND_PORT, value).apply()

    var useHttps: Boolean
        get() = prefs.getBoolean(KEY_USE_HTTPS, false)
        set(value) = prefs.edit().putBoolean(KEY_USE_HTTPS, value).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY) ?: DEFAULT_API_KEY
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    var isConfigured: Boolean
        get() = prefs.getBoolean(KEY_CONFIGURED, false)
        set(value) = prefs.edit().putBoolean(KEY_CONFIGURED, value).apply()

    var selectedProjectId: String?
        get() = prefs.getString(KEY_SELECTED_PROJECT_ID, null)
        set(value) = prefs.edit().putString(KEY_SELECTED_PROJECT_ID, value).apply()

    var projectConfirmed: Boolean
        get() = prefs.getBoolean(KEY_PROJECT_CONFIRMED, false)
        set(value) = prefs.edit().putBoolean(KEY_PROJECT_CONFIRMED, value).apply()

    fun baseUrl(): String {
        val scheme = if (useHttps) "https" else "http"
        val defaultPort = if (useHttps) 443 else 80
        return if (backendPort == defaultPort) {
            "$scheme://$backendHost"
        } else {
            "$scheme://$backendHost:$backendPort"
        }
    }

    fun readTaskIds(): Set<Int> {
        val raw = prefs.getString(KEY_READ_TASK_IDS, "") ?: return emptySet()
        if (raw.isBlank()) return emptySet()
        return raw.split(",").mapNotNull { it.trim().toIntOrNull() }.toSet()
    }

    fun markTaskRead(taskId: Int) {
        val updated = readTaskIds() + taskId
        prefs.edit().putString(KEY_READ_TASK_IDS, updated.joinToString(",")).apply()
    }

    fun notifiedTaskIds(): Set<Int> {
        val raw = prefs.getString(KEY_NOTIFIED_TASK_IDS, "") ?: return emptySet()
        if (raw.isBlank()) return emptySet()
        return raw.split(",").mapNotNull { it.trim().toIntOrNull() }.toSet()
    }

    fun markNotified(taskId: Int) {
        val updated = notifiedTaskIds() + taskId
        prefs.edit().putString(KEY_NOTIFIED_TASK_IDS, updated.joinToString(",")).apply()
    }

    fun recentTasks(): List<RecentTask> {
        val raw = prefs.getString(KEY_RECENT_TASKS, "") ?: return emptyList()
        if (raw.isBlank()) return emptyList()
        return raw.split("\n").mapNotNull { line ->
            val parts = line.split("|")
            if (parts.size < 2) return@mapNotNull null
            val id = parts[0].toIntOrNull() ?: return@mapNotNull null
            RecentTask(
                taskId = id,
                title = parts[1],
                projectId = parts.getOrNull(2)?.ifBlank { null },
                projectName = parts.getOrNull(3)?.ifBlank { null },
                createdAt = parts.getOrNull(4)?.ifBlank { null },
            )
        }
    }

    fun addRecentTask(task: RecentTask) {
        val updated = (listOf(task) + recentTasks().filter { it.taskId != task.taskId }).take(10)
        val encoded = updated.joinToString("\n") { task ->
            listOf(
                task.taskId.toString(),
                task.title.replace('|', ' '),
                task.projectId.orEmpty(),
                task.projectName.orEmpty(),
                task.createdAt.orEmpty(),
            ).joinToString("|")
        }
        prefs.edit().putString(KEY_RECENT_TASKS, encoded).apply()
    }

    companion object {
        private const val KEY_BACKEND_HOST = "backend_host"
        private const val KEY_BACKEND_PORT = "backend_port"
        private const val KEY_USE_HTTPS = "use_https"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_CONFIGURED = "configured"
        private const val KEY_SELECTED_PROJECT_ID = "selected_project_id"
        private const val KEY_PROJECT_CONFIRMED = "project_confirmed"
        private const val KEY_READ_TASK_IDS = "read_task_ids"
        private const val KEY_NOTIFIED_TASK_IDS = "notified_task_ids"
        private const val KEY_RECENT_TASKS = "recent_tasks"
        const val DEFAULT_HOST = "10.0.2.2"
        const val DEFAULT_PORT = 3001
        const val DEFAULT_API_KEY = "dev-key"
    }
}
