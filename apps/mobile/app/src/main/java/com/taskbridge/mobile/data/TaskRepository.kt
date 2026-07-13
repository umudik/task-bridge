package com.taskbridge.mobile.data

import com.taskbridge.mobile.domain.models.AnswerDetail
import com.taskbridge.mobile.domain.models.EpicListItem
import com.taskbridge.mobile.domain.models.EpicPageResult
import com.taskbridge.mobile.domain.models.InboxItem
import com.taskbridge.mobile.domain.models.Project
import com.taskbridge.mobile.domain.models.TaskComment
import com.taskbridge.mobile.domain.models.TaskParentRef
import com.taskbridge.mobile.domain.models.TaskSubtaskSummary
import com.taskbridge.mobile.domain.models.WorkflowStageItem
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
                        ),
                    )
                }
            }
        }
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

    private fun patchJson(path: String, body: JSONObject): JSONObject {
        val request = authRequest(path)
            .patch(body.toString().toRequestBody(jsonMediaType))
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

    suspend fun fetchWorkflowStages(projectId: String): List<WorkflowStageItem> = withContext(Dispatchers.IO) {
        val encoded = java.net.URLEncoder.encode(projectId, Charsets.UTF_8.name())
        val json = getJson("/projects/$encoded/workflow")
        val stages = json.optJSONArray("stages") ?: JSONArray()
        buildList {
            for (index in 0 until stages.length()) {
                val item = stages.getJSONObject(index)
                val id = item.optString("id")
                val title = item.optString("title")
                if (id.isBlank() || title.isBlank()) continue
                add(
                    WorkflowStageItem(
                        id = id,
                        title = title,
                        position = item.optInt("position", index),
                    ),
                )
            }
        }.sortedBy { it.position }
    }

    suspend fun createEpicSubtask(
        parentId: Int,
        title: String,
        description: String,
        stageId: String? = null,
    ): Int = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("parentId", parentId)
            .put("title", title)
            .put("description", description)
        stageId?.trim()?.takeIf { it.isNotBlank() }?.let { body.put("stageId", it) }
        val json = postJson("/tasks", body)
        when {
            json.has("id") && !json.isNull("id") -> json.optInt("id")
            else -> json.optString("id").toIntOrNull() ?: 0
        }
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

    suspend fun fetchEpics(
        projectId: String,
        limit: Int = 100,
    ): EpicPageResult = withContext(Dispatchers.IO) {
        val encodedProject = java.net.URLEncoder.encode(projectId, Charsets.UTF_8.name())
        val allItems = mutableListOf<EpicListItem>()
        var cursor: String? = null
        var hasMore = true
        var pageLimit = limit
        while (hasMore) {
            val cursorParam = cursor?.let { "&cursor=${java.net.URLEncoder.encode(it, Charsets.UTF_8.name())}" } ?: ""
            val json = getJson("/inbox?projectId=$encodedProject&epicsOnly=true&limit=$limit$cursorParam")
            val items = json.optJSONArray("items") ?: JSONArray()
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val taskId = when {
                    item.has("taskId") -> item.optInt("taskId")
                    else -> item.optString("taskId").toIntOrNull() ?: continue
                }
                allItems.add(
                    EpicListItem(
                        taskId = taskId,
                        title = item.optString("title"),
                        stageTitle = item.optString("stageTitle").ifBlank { null },
                        preview = item.optString("preview").ifBlank { null },
                        updatedAt = item.optString("updatedAt").ifBlank { null },
                    ),
                )
            }
            pageLimit = json.optInt("limit", limit)
            cursor = json.optString("nextCursor").ifBlank { null }
            hasMore = json.optBoolean("hasMore", false) && cursor != null
        }
        EpicPageResult(
            items = allItems,
            limit = pageLimit,
            nextCursor = null,
            hasMore = false,
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
        val json = getJson("/tasks/$taskId")
        val parentJson = json.optJSONObject("parent")
        val parent = if (parentJson != null) {
            TaskParentRef(
                taskId = parentJson.optInt("taskId"),
                title = parentJson.optString("title"),
                stageId = parentJson.optString("stageId").ifBlank { null },
            )
        } else {
            null
        }
        AnswerDetail(
            taskId = json.optInt("taskId", taskId),
            title = json.optString("title"),
            request = json.optString("request"),
            description = json.optString("description").ifBlank { null },
            status = json.optString("status", "pending"),
            createdAt = json.optString("createdAt").ifBlank { null },
            updatedAt = json.optString("updatedAt").ifBlank { null },
            createdBy = json.optString("createdBy", "You"),
            projectId = json.optString("projectId").ifBlank { null },
            projectName = json.optString("projectName").ifBlank { null },
            stageId = json.optString("stageId").ifBlank { null },
            stageTitle = json.optJSONObject("stage")?.optString("title")?.ifBlank { null }
                ?: json.optString("stageId").ifBlank { null },
            assignee = json.optString("assignee").ifBlank { null },
            isEpic = json.optBoolean("isEpic", false),
            workStatusLabel = json.optString("workStatusLabel").ifBlank { null },
            parentId = if (json.has("parentId") && !json.isNull("parentId")) json.optInt("parentId") else null,
            parent = parent,
            subtasks = parseSubtasks(json.optJSONArray("subtasks")),
            comments = parseComments(json.optJSONArray("comments")),
        )
    }

    suspend fun postTaskComment(taskId: Int, text: String): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put(
                "comment",
                JSONObject()
                    .put("text", text)
                    .put("by", "mobile"),
            )
        patchJson("/tasks/$taskId", body)
    }

    private fun parseSubtasks(array: JSONArray?): List<TaskSubtaskSummary> {
        if (array == null) return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                val taskId = when {
                    item.has("taskId") -> item.optInt("taskId")
                    else -> item.optString("taskId").toIntOrNull() ?: continue
                }
                add(
                    TaskSubtaskSummary(
                        taskId = taskId,
                        title = item.optString("title"),
                        stageId = item.optString("stageId").ifBlank { null },
                        stageTitle = item.optString("stageTitle").ifBlank { null },
                        workStatus = item.optString("workStatus").ifBlank { null },
                        workStatusLabel = item.optString("workStatusLabel").ifBlank { null },
                        done = item.optBoolean("done", false),
                    ),
                )
            }
        }
    }

    private fun parseComments(array: JSONArray?): List<TaskComment> {
        if (array == null) return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.getJSONObject(index)
                val id = item.optString("id").trim()
                val body = item.optString("body").trim()
                if (id.isEmpty() || body.isEmpty()) continue
                val roleField = item.optString("role").trim()
                if (roleField != "user" && roleField != "system") continue
                val authorId = item.optString("authorId").trim()
                if (authorId.isEmpty()) continue
                val tags = buildList {
                    val tagsArray = item.optJSONArray("tags") ?: return@buildList
                    for (tagIndex in 0 until tagsArray.length()) {
                        val tag = tagsArray.optString(tagIndex).trim()
                        if (tag.isNotEmpty()) add(tag)
                    }
                }
                add(
                    TaskComment(
                        id = id,
                        by = authorId,
                        text = body,
                        at = item.optString("at"),
                        role = roleField,
                        tags = tags,
                    ),
                )
            }
        }
    }

    private fun baseRequest(path: String): Request.Builder {
        val builder = Request.Builder()
            .url("${sessionStore.baseUrl()}/api$path")
            .addHeader("Accept", "application/json")
        if (sessionStore.useHttps) {
            builder.addHeader("ngrok-skip-browser-warning", "true")
        }
        builder.addHeader("User-Agent", "TaskBridge/1.0")
        return builder
    }

    private fun authRequest(path: String): Request.Builder {
        return baseRequest(path).addHeader("Authorization", "Bearer ${sessionStore.authToken}")
    }

    suspend fun login(email: String, password: String): LoginResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
        val request = baseRequest("/auth/login")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()
        val response = http.newCall(request).execute()
        val raw = response.body?.string() ?: "{}"
        if (!response.isSuccessful) {
            throw IllegalStateException(parseError(raw, response.code))
        }
        val json = JSONObject(raw)
        val token = json.optString("token")
        if (token.isBlank()) {
            throw IllegalStateException("Login failed — no token returned")
        }
        val userName = json.optJSONObject("user")?.optString("name").orEmpty()
        LoginResult(token = token, userName = userName)
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
            401 -> error.ifBlank { "Unauthorized — please log in again" }
            404 -> "Not found ($code). Rebuild backend and rescan QR"
            else -> error.ifBlank { "HTTP $code" }
        }
    }

    data class LoginResult(
        val token: String,
        val userName: String,
    )

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
