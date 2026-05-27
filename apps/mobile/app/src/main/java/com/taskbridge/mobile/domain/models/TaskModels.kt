package com.taskbridge.mobile.domain.models

data class InboxItem(
    val taskId: Int,
    val title: String,
    val preview: String,
    val status: String = "pending",
    val updatedAt: String?,
    val createdAt: String? = null,
    val answeredAt: String? = null,
    val projectId: String? = null,
    val projectName: String? = null,
) {
    val isReady: Boolean
        get() = status == "ready"
}

data class RecentTask(
    val taskId: Int,
    val title: String,
    val projectId: String? = null,
    val projectName: String? = null,
    val createdAt: String? = null,
)

data class AnswerDetail(
    val taskId: Int,
    val title: String,
    val request: String,
    val answer: String?,
    val status: String,
    val createdAt: String?,
    val answeredAt: String?,
    val durationMs: Long?,
    val createdBy: String,
    val answeredBy: String?,
    val projectId: String? = null,
    val projectName: String? = null,
)

sealed class AnswerEntry {
    abstract val taskId: Int

    data class Pending(
        override val taskId: Int,
        val title: String,
    ) : AnswerEntry()

    data class Ready(
        val item: InboxItem,
    ) : AnswerEntry() {
        override val taskId: Int = item.taskId
    }
}

private fun parseEpoch(value: String?): Long? {
    if (value.isNullOrBlank()) return null
    return runCatching { java.time.Instant.parse(value).toEpochMilli() }.getOrNull()
        ?: runCatching {
            java.time.OffsetDateTime.parse(value).toInstant().toEpochMilli()
        }.getOrNull()
        ?: runCatching {
            java.time.LocalDateTime.parse(value).atZone(java.time.ZoneId.systemDefault()).toInstant()
                .toEpochMilli()
        }.getOrNull()
}

private fun AnswerEntry.sortKey(
    inboxById: Map<Int, InboxItem>,
    recentById: Map<Int, RecentTask>,
): Long {
    val item = inboxById[taskId]
    val recent = recentById[taskId]
    return parseEpoch(recent?.createdAt)
        ?: parseEpoch(item?.createdAt)
        ?: parseEpoch(item?.updatedAt)
        ?: taskId.toLong()
}

fun taskBelongsToProject(
    taskProjectId: String?,
    selectedProjectId: String,
    projects: List<Project>,
): Boolean {
    if (taskProjectId.isNullOrBlank()) return false
    if (taskProjectId == selectedProjectId) return true
    val selected = projects.find { it.id == selectedProjectId } ?: return false
    if (taskProjectId == selected.vikunjaProjectId.toString()) return true
    val owner = projects.find { it.id == taskProjectId }
        ?: projects.find { it.vikunjaProjectId.toString() == taskProjectId }
    return owner?.id == selectedProjectId
}

fun buildAnswerEntries(
    recentTasks: List<RecentTask>,
    inboxItems: List<InboxItem>,
    projectId: String? = null,
    projects: List<Project> = emptyList(),
): List<AnswerEntry> {
    val filteredRecent = if (projectId.isNullOrBlank()) {
        recentTasks
    } else {
        recentTasks.filter { taskBelongsToProject(it.projectId, projectId, projects) }
    }
    val filteredInbox = if (projectId.isNullOrBlank()) {
        inboxItems
    } else {
        inboxItems.filter { taskBelongsToProject(it.projectId, projectId, projects) }
    }
    val inboxById = filteredInbox.associateBy { it.taskId }
    val recentById = filteredRecent.associateBy { it.taskId }
    val taskIds = (inboxById.keys + recentById.keys).toSet()
    val entries = taskIds.map { taskId ->
        val inbox = inboxById[taskId]
        val recent = recentById[taskId]
        when {
            inbox != null && inbox.isReady -> AnswerEntry.Ready(inbox)
            inbox != null -> AnswerEntry.Pending(taskId, inbox.title.ifBlank { recent?.title ?: "Task #$taskId" })
            else -> AnswerEntry.Pending(taskId, recent?.title ?: "Task #$taskId")
        }
    }
    return entries.sortedWith(
        compareByDescending<AnswerEntry> { it.sortKey(inboxById, recentById) }
            .thenByDescending { it.taskId },
    )
}
