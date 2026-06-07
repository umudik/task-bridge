package com.taskbridge.mobile.data

import com.taskbridge.mobile.domain.models.AnswerDetail
import com.taskbridge.mobile.domain.models.TaskComment
import com.taskbridge.mobile.domain.models.Project
import com.taskbridge.mobile.domain.models.InboxItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class TaskRepository(
    private val sessionStore: SessionStore,
    private val http: OkHttpClient = defaultClient(),
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    suspend fun fetchProjects(): List<Project> = withContext(Dispatchers.IO) {
        val json = getJson("/projects")
        val items = json.optJSONArray("projects") ?: JSONArray()
        buildList {
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val id = item.optString("id")
                val name = item.optString("name")
                if (id.isNotBlank() && name.isNotBlank()) {
                    add(
                        Project(
                            id = id,
                            name = name,
                            repoPath = item.optString("repoPath").takeIf { it.isNotBlank() },
                        ),
                    )
                }
            }
        }
    }

    suspend fun updateProjectRepoPath(projectId: String, repoPath: String): Project = withContext(Dispatchers.IO) {
        val body = JSONObject().put("repoPath", repoPath)
        val json = putJson("/projects/$projectId/repo-path", body)
        Project(
            id = json.optString("id", projectId),
            name = json.optString("name"),
            repoPath = json.optString("repoPath").takeIf { it.isNotBlank() } ?: repoPath.takeIf { it.isNotBlank() },
        )
    }

    private fun putJson(path: String, body: JSONObject): JSONObject {
        val request = authRequest(path)
            .put(body.toString().toRequestBody(jsonMediaType))
            .build()
        val response = http.newCall(request).execute()
        val raw = response.body?.string() ?: "{}"
        if (!response.isSuccessful) {
            throw IllegalStateException(parseError(raw, response.code))
        }
        if (!raw.trimStart().startsWith("{")) {
            throw IllegalStateException("Invalid backend response. Rescan QR from /setup")
        }
        return JSONObject(raw)
    }

    suspend fun createTask(text: String, projectId: String): CreateTaskResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("text", text)
            .put("projectId", projectId)
        val json = postJson("/epics", body)
        CreateTaskResult(
            id = json.opt("id")?.toString() ?: "",
            name = json.optString("title"),
            projectId = json.optString("projectId").ifBlank { projectId },
            projectName = json.optString("projectName").ifBlank { null },
            createdAt = json.optString("createdAt").ifBlank { null },
        )
    }

    suspend fun fetchInbox(projectId: String? = null): List<InboxItem> = withContext(Dispatchers.IO) {
        val path = if (projectId.isNullOrBlank()) {
            "/inbox"
        } else {
            "/inbox?projectId=${java.net.URLEncoder.encode(projectId, Charsets.UTF_8.name())}"
        }
        val json = getJson(path)
        val items = json.optJSONArray("items") ?: JSONArray()
        buildList {
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val taskId = when {
                    item.has("taskId") -> item.optInt("taskId")
                    else -> item.optString("taskId").toIntOrNull() ?: continue
                }
                add(
                    InboxItem(
                        taskId = taskId,
                        title = item.optString("title"),
                        preview = item.optString("preview").ifBlank { null },
                        status = item.optString("status", "pending"),
                        updatedAt = item.optString("updatedAt").ifBlank { null },
                        createdAt = item.optString("createdAt").ifBlank { null },
                        answeredAt = item.optString("answeredAt").ifBlank { null },
                        projectId = item.optString("projectId").ifBlank { null },
                        projectName = item.optString("projectName").ifBlank { null },
                        stageTitle = item.optString("stageTitle").ifBlank { null },
                        assignee = item.optString("assignee").ifBlank { null },
                    ),
                )
            }
        }
    }

    suspend fun fetchAnswerDetail(taskId: Int): AnswerDetail = withContext(Dispatchers.IO) {
        val json = getJson("/answers/$taskId")
        AnswerDetail(
            taskId = json.optInt("taskId", taskId),
            title = json.optString("title"),
            request = json.optString("request"),
            description = json.optString("description").ifBlank { null },
            acceptanceCriteria = json.optString("acceptanceCriteria").ifBlank { null },
            aiSummary = json.optString("aiSummary").ifBlank { null },
            answer = json.optString("aiSummary").ifBlank { json.optString("answer").ifBlank { null } },
            status = json.optString("status", "pending"),
            createdAt = json.optString("createdAt").ifBlank { null },
            updatedAt = json.optString("updatedAt").ifBlank { null },
            answeredAt = json.optString("answeredAt").ifBlank { null },
            durationMs = if (json.has("durationMs") && !json.isNull("durationMs")) json.getLong("durationMs") else null,
            createdBy = json.optString("createdBy", "You"),
            answeredBy = json.optString("answeredBy").ifBlank { null },
            projectId = json.optString("projectId").ifBlank { null },
            projectName = json.optString("projectName").ifBlank { null },
            stageTitle = json.optJSONObject("stage")?.optString("title")?.ifBlank { null }
                ?: json.optString("stageId").ifBlank { null },
            assignee = json.optString("assignee").ifBlank { null },
            comments = parseComments(json.optJSONArray("comments")),
        )
    }

    suspend fun postTaskComment(taskId: Int, text: String): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("text", text)
            .put("by", "mobile")
        postJson("/tasks/$taskId/comments", body)
    }

    private fun parseComments(array: JSONArray?): List<TaskComment> {
        if (array == null) return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                val id = item.optString("id")
                val body = item.optString("body").ifBlank { item.optString("text") }
                if (id.isBlank() || body.isBlank()) continue
                val authorType = item.optString("authorType")
                val role = when {
                    authorType == "human" -> "user"
                    authorType == "ai" -> "assistant"
                    else -> item.optString("role", "user")
                }
                val tags = buildList {
                    val tagsArray = item.optJSONArray("tags")
                    if (tagsArray != null) {
                        for (index in 0 until tagsArray.length()) {
                            val tag = tagsArray.optString(index).trim()
                            if (tag.isNotEmpty()) add(tag)
                        }
                    } else {
                        val legacyType = item.optString("type").trim()
                        if (legacyType.isNotEmpty()) add(legacyType)
                    }
                }
                add(
                    TaskComment(
                        id = id,
                        by = item.optString("authorId").ifBlank { item.optString("by", "You") },
                        text = body,
                        at = item.optString("at"),
                        role = role,
                        tags = tags,
                    ),
                )
            }
        }
    }

    private fun authRequest(path: String): Request.Builder {
        val builder = Request.Builder()
            .url("${sessionStore.baseUrl()}$path")
            .addHeader("X-Api-Key", sessionStore.apiKey)
            .addHeader("Accept", "application/json")
        if (sessionStore.useHttps) {
            builder.addHeader("ngrok-skip-browser-warning", "true")
        }
        builder.addHeader("User-Agent", "TaskBridge/1.0")
        return builder
    }

    private fun getJson(path: String): JSONObject {
        val request = authRequest(path).get().build()
        val response = http.newCall(request).execute()
        val raw = response.body?.string() ?: "{}"
        if (!response.isSuccessful) {
            throw IllegalStateException(parseError(raw, response.code))
        }
        if (!raw.trimStart().startsWith("{")) {
            throw IllegalStateException("Invalid backend response. Rescan QR from /setup")
        }
        return JSONObject(raw)
    }

    private fun postJson(path: String, body: JSONObject): JSONObject {
        val request = authRequest(path)
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        val response = http.newCall(request).execute()
        val raw = response.body?.string() ?: "{}"
        if (!response.isSuccessful) {
            throw IllegalStateException(parseError(raw, response.code))
        }
        if (!raw.trimStart().startsWith("{")) {
            throw IllegalStateException("Invalid backend response. Rescan QR from /setup")
        }
        return JSONObject(raw)
    }

    private fun parseError(raw: String, code: Int): String {
        val error = runCatching { JSONObject(raw).optString("error", raw) }.getOrDefault(raw)
        return when (code) {
            401 -> "Unauthorized — check API key"
            404 -> "Not found ($code). Rebuild backend and rescan QR"
            else -> error.ifBlank { "HTTP $code" }
        }
    }

    data class CreateTaskResult(
        val id: String,
        val name: String,
        val projectId: String,
        val projectName: String?,
        val createdAt: String? = null,
    )

    companion object {
        private fun defaultClient(): OkHttpClient {
            return OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build()
        }
    }
}
