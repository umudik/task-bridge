package com.taskbridge.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.taskbridge.mobile.data.SessionStore
import com.taskbridge.mobile.data.TaskRepository
import com.taskbridge.mobile.domain.models.AnswerDetail
import com.taskbridge.mobile.domain.models.AnswerEntry
import com.taskbridge.mobile.domain.models.ConnectConfigParser
import com.taskbridge.mobile.domain.models.InboxItem
import com.taskbridge.mobile.domain.models.Project
import com.taskbridge.mobile.domain.models.RecentTask
import com.taskbridge.mobile.domain.models.buildAnswerEntries
import com.taskbridge.mobile.domain.models.taskBelongsToProject
import com.taskbridge.mobile.speech.SpeechRecognizerHelper
import com.taskbridge.mobile.speech.TextToSpeechHelper
import com.taskbridge.mobile.notifications.InboxPollWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AppUiState(
    val backendHost: String = SessionStore.DEFAULT_HOST,
    val backendPort: Int = SessionStore.DEFAULT_PORT,
    val apiKey: String = SessionStore.DEFAULT_API_KEY,
    val useHttps: Boolean = false,
    val isConfigured: Boolean = false,
    val projects: List<Project> = emptyList(),
    val selectedProjectId: String? = null,
    val projectConfirmed: Boolean = false,
    val projectsError: String? = null,
    val isLoadingProjects: Boolean = false,
    val isListening: Boolean = false,
    val isSending: Boolean = false,
    val isLoadingInbox: Boolean = false,
    val isLoadingDetail: Boolean = false,
    val isSpeaking: Boolean = false,
    val recentTasks: List<RecentTask> = emptyList(),
    val inboxItems: List<InboxItem> = emptyList(),
    val answerEntries: List<AnswerEntry> = emptyList(),
    val inboxError: String? = null,
    val readTaskIds: Set<Int> = emptySet(),
    val activeDetail: AnswerDetail? = null,
    val detailError: String? = null,
    val lastTranscript: String? = null,
    val pendingTranscript: String? = null,
    val liveTranscript: String? = null,
    val statusMessage: String? = null,
    val showManualSetup: Boolean = false,
    val textMessage: String? = null,
)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val taskRepository = TaskRepository(sessionStore)
    private val speechHelper = SpeechRecognizerHelper(application)
    private val ttsHelper = TextToSpeechHelper(application)
    private var accumulatedTranscript: String? = null
    private var lastInboxRefreshAt = 0L
    private var projectsRequestId = 0

    private val _uiState = MutableStateFlow(
        run {
            val recent = sessionStore.recentTasks()
            val savedProjectId = sessionStore.selectedProjectId
            val confirmed = sessionStore.projectConfirmed
            AppUiState(
                backendHost = sessionStore.backendHost,
                backendPort = sessionStore.backendPort,
                apiKey = sessionStore.apiKey,
                useHttps = sessionStore.useHttps,
                isConfigured = sessionStore.isConfigured,
                selectedProjectId = savedProjectId,
                projectConfirmed = confirmed,
                readTaskIds = sessionStore.readTaskIds(),
                recentTasks = recent,
                answerEntries = buildAnswerEntries(
                    recent,
                    emptyList(),
                    savedProjectId?.takeIf { confirmed },
                    emptyList(),
                ),
            )
        },
    )
    val uiState: StateFlow<AppUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            speechHelper.segments.collect { segment ->
                appendSegment(segment)
            }
        }
        viewModelScope.launch {
            speechHelper.partials.collect { partial ->
                updateLiveTranscript(partial)
            }
        }
        viewModelScope.launch {
            speechHelper.sessionEnded.collect {
                finalizeRecording()
            }
        }
        viewModelScope.launch {
            speechHelper.errors.collect { error ->
                _uiState.update { it.copy(isListening = false, statusMessage = error) }
            }
        }
        viewModelScope.launch {
            ttsHelper.isSpeaking.collect { speaking ->
                _uiState.update { it.copy(isSpeaking = speaking) }
            }
        }
        if (sessionStore.isConfigured) {
            refreshProjects(silent = true, autoConfirm = false)
            if (sessionStore.projectConfirmed) {
                InboxPollWorker.start(getApplication())
                refreshInbox(silent = true)
            }
        }
    }

    fun refreshProjects(silent: Boolean = false, autoConfirm: Boolean = false) {
        val requestId = ++projectsRequestId
        viewModelScope.launch {
            try {
                _uiState.update {
                    it.copy(
                        isLoadingProjects = true,
                        projectsError = if (silent) it.projectsError else null,
                    )
                }
                val projects = taskRepository.fetchProjects()
                if (requestId != projectsRequestId) return@launch
                val savedId = sessionStore.selectedProjectId
                val selectedId = when {
                    savedId != null && projects.any { it.id == savedId } -> savedId
                    autoConfirm && projects.isNotEmpty() -> projects.first().id
                    else -> savedId?.takeIf { id -> projects.any { it.id == id } }
                }
                if (selectedId != null) {
                    sessionStore.selectedProjectId = selectedId
                }
                val confirmed = if (autoConfirm && selectedId != null && !sessionStore.projectConfirmed) {
                    sessionStore.projectConfirmed = true
                    true
                } else {
                    sessionStore.projectConfirmed
                }
                if (confirmed && selectedId != null) {
                    InboxPollWorker.start(getApplication())
                }
                _uiState.update {
                    it.copy(
                        projects = projects,
                        selectedProjectId = selectedId,
                        projectConfirmed = confirmed,
                        isLoadingProjects = false,
                        answerEntries = answerEntriesFor(
                            it.recentTasks,
                            it.inboxItems,
                            selectedId,
                            confirmed,
                            projects,
                        ),
                        projectsError = if (projects.isEmpty()) {
                            "No projects returned — check backend connection"
                        } else {
                            null
                        },
                    )
                }
                if (confirmed) {
                    refreshInbox(silent = true)
                }
            } catch (e: Exception) {
                if (requestId != projectsRequestId) return@launch
                _uiState.update {
                    it.copy(
                        isLoadingProjects = false,
                        projectsError = e.message ?: "Projects failed",
                    )
                }
            }
        }
    }

    fun updateTextMessage(text: String) {
        _uiState.update { it.copy(textMessage = text.takeIf { it.isNotEmpty() }) }
    }

    fun submitTextMessage() {
        val text = _uiState.value.textMessage?.trim()?.takeIf { it.isNotEmpty() } ?: return
        submitTask(text)
        _uiState.update { it.copy(textMessage = null) }
    }

    fun selectProject(projectId: String) {
        sessionStore.selectedProjectId = projectId
        _uiState.update { state ->
            state.copy(
                selectedProjectId = projectId,
                pendingTranscript = null,
                textMessage = null,
                answerEntries = answerEntriesFor(
                    state.recentTasks,
                    state.inboxItems,
                    projectId,
                    state.projectConfirmed,
                    state.projects,
                ),
            )
        }
    }

    fun confirmProjectSelection(): Boolean {
        val projectId = _uiState.value.selectedProjectId ?: return false
        sessionStore.selectedProjectId = projectId
        sessionStore.projectConfirmed = true
        _uiState.update {
            it.copy(
                projectConfirmed = true,
                pendingTranscript = null,
                textMessage = null,
                answerEntries = answerEntriesFor(it.recentTasks, it.inboxItems, projectId, true, it.projects),
            )
        }
        InboxPollWorker.start(getApplication())
        refreshInbox(silent = true, force = true)
        return true
    }

    fun resetProjectSelection() {
        sessionStore.projectConfirmed = false
        _uiState.update { it.copy(projectConfirmed = false) }
    }

    private fun appendSegment(segment: String) {
        if (!_uiState.value.isListening || segment.isBlank()) return
        accumulatedTranscript = accumulatedTranscript?.let { "$it $segment" } ?: segment
        _uiState.update {
            it.copy(
                liveTranscript = accumulatedTranscript,
                statusMessage = "Listening...",
            )
        }
    }

    private fun updateLiveTranscript(partial: String) {
        if (!_uiState.value.isListening || partial.isBlank()) return
        val preview = accumulatedTranscript?.let { "$it $partial" } ?: partial
        _uiState.update { it.copy(liveTranscript = preview) }
    }

    private fun finalizeRecording() {
        val transcript = accumulatedTranscript?.trim()?.takeIf { it.isNotBlank() }
            ?: _uiState.value.liveTranscript?.trim()?.takeIf { it.isNotBlank() }
        accumulatedTranscript = null
        if (transcript == null) {
            _uiState.update {
                it.copy(isListening = false, liveTranscript = null, statusMessage = "Nothing heard")
            }
            return
        }

        _uiState.update {
            it.copy(
                pendingTranscript = transcript,
                lastTranscript = transcript,
                liveTranscript = null,
                isListening = false,
                statusMessage = "Review and send",
            )
        }
    }

    fun refreshInbox(silent: Boolean = false, force: Boolean = false) {
        if (!_uiState.value.projectConfirmed) return
        val now = System.currentTimeMillis()
        if (silent && !force && now - lastInboxRefreshAt < 30_000) return
        lastInboxRefreshAt = now
        viewModelScope.launch {
            try {
                if (!silent) {
                    _uiState.update { it.copy(isLoadingInbox = true, inboxError = null) }
                }
                val items = taskRepository.fetchInbox()
                InboxPollWorker.notifyNewAnswers(getApplication(), sessionStore, items)
                syncRecentTasksFromInbox(items)
                val recent = sessionStore.recentTasks()
                val entries = answerEntriesFor(
                    recent,
                    items,
                    _uiState.value.selectedProjectId,
                    _uiState.value.projectConfirmed,
                    _uiState.value.projects,
                )
                _uiState.update {
                    it.copy(
                        isLoadingInbox = false,
                        recentTasks = recent,
                        inboxItems = items,
                        answerEntries = entries,
                        inboxError = null,
                        statusMessage = if (!silent && it.projectConfirmed) {
                            when {
                                entries.any { entry -> entry is AnswerEntry.Pending } -> "Waiting for answer"
                                else -> "${entries.size} answers"
                            }
                        } else {
                            it.statusMessage
                        },
                    )
                }
            } catch (e: Exception) {
                val message = e.message ?: "Inbox failed"
                _uiState.update {
                    it.copy(
                        isLoadingInbox = false,
                        inboxError = message,
                        statusMessage = if (it.projectConfirmed) "Inbox failed" else it.statusMessage,
                        answerEntries = answerEntriesFor(it.recentTasks, emptyList(), it.selectedProjectId, it.projectConfirmed, it.projects),
                    )
                }
            }
        }
    }

    fun loadAnswerDetail(taskId: Int, silent: Boolean = false) {
        viewModelScope.launch {
            try {
                if (!silent) {
                    _uiState.update {
                        it.copy(isLoadingDetail = true, detailError = null, activeDetail = null)
                    }
                }
                val detail = taskRepository.fetchAnswerDetail(taskId)
                if (detail.status == "ready") {
                    sessionStore.markTaskRead(taskId)
                }
                _uiState.update {
                    it.copy(
                        isLoadingDetail = false,
                        activeDetail = detail,
                        detailError = null,
                        readTaskIds = sessionStore.readTaskIds(),
                        inboxItems = it.inboxItems,
                        answerEntries = answerEntriesFor(it.recentTasks, it.inboxItems, it.selectedProjectId, it.projectConfirmed, it.projects),
                    )
                }
                if (detail.status == "ready") {
                    refreshInbox(silent = true)
                }
            } catch (e: Exception) {
                val recent = _uiState.value.recentTasks.find { it.taskId == taskId }
                if (recent != null && !silent) {
                    _uiState.update {
                        it.copy(
                            isLoadingDetail = false,
                            activeDetail = AnswerDetail(
                                taskId = taskId,
                                title = recent.title,
                                request = recent.title,
                                answer = null,
                                status = "pending",
                                createdAt = null,
                                answeredAt = null,
                                durationMs = null,
                                createdBy = "You",
                                answeredBy = null,
                                projectId = recent.projectId,
                                projectName = recent.projectName,
                            ),
                            detailError = null,
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            isLoadingDetail = false,
                            detailError = e.message ?: "Load failed",
                        )
                    }
                }
            }
        }
    }

    fun clearActiveDetail() {
        stopSpeech()
        _uiState.update { it.copy(activeDetail = null, detailError = null) }
    }

    fun toggleSpeech(text: String) {
        if (_uiState.value.isSpeaking) {
            stopSpeech()
        } else {
            speak(text)
        }
    }

    fun speak(text: String) {
        if (text.isBlank()) return
        ttsHelper.speak(text)
    }

    fun stopSpeech() {
        ttsHelper.stop()
    }

    fun updateBackendHost(host: String) {
        sessionStore.backendHost = host
        _uiState.update { it.copy(backendHost = host) }
    }

    fun updateBackendPort(port: Int) {
        sessionStore.backendPort = port
        _uiState.update { it.copy(backendPort = port) }
    }

    fun updateApiKey(key: String) {
        sessionStore.apiKey = key
        _uiState.update { it.copy(apiKey = key) }
    }

    fun applyConnectPayload(raw: String): Boolean {
        val config = ConnectConfigParser.parse(raw) ?: run {
            _uiState.update { it.copy(statusMessage = "Invalid QR") }
            return false
        }
        _uiState.update {
            it.copy(
                backendHost = config.host,
                backendPort = config.port,
                apiKey = config.apiKey,
                useHttps = config.secure,
                showManualSetup = true,
                statusMessage = "Scan QR then tap Connect",
            )
        }
        return true
    }

    fun connectFromQr(raw: String, resetProject: Boolean = true): Boolean {
        val config = ConnectConfigParser.parse(raw) ?: run {
            _uiState.update { it.copy(statusMessage = "Invalid QR") }
            return false
        }
        sessionStore.backendHost = config.host
        sessionStore.backendPort = config.port
        sessionStore.apiKey = config.apiKey
        sessionStore.useHttps = config.secure
        sessionStore.isConfigured = true
        if (resetProject) {
            sessionStore.projectConfirmed = false
            sessionStore.selectedProjectId = null
        }
        _uiState.update {
            val projectUpdate = if (resetProject) {
                it.copy(projectConfirmed = false, selectedProjectId = null)
            } else {
                it
            }
            projectUpdate.copy(
                backendHost = config.host,
                backendPort = config.port,
                apiKey = config.apiKey,
                useHttps = config.secure,
                isConfigured = true,
                showManualSetup = false,
                statusMessage = if (resetProject) "Connected" else "Connection updated",
            )
        }
        refreshProjects(silent = true, autoConfirm = false)
        return true
    }

    fun saveSettings(resetProject: Boolean = true) {
        sessionStore.backendHost = _uiState.value.backendHost
        sessionStore.backendPort = _uiState.value.backendPort
        sessionStore.apiKey = _uiState.value.apiKey
        sessionStore.useHttps = _uiState.value.useHttps
        sessionStore.isConfigured = true
        _uiState.update {
            it.copy(
                isConfigured = true,
                showManualSetup = false,
                statusMessage = "Connected",
            )
        }
        if (resetProject) {
            sessionStore.projectConfirmed = false
            sessionStore.selectedProjectId = null
            _uiState.update {
                it.copy(
                    projectConfirmed = false,
                    selectedProjectId = null,
                    statusMessage = "Connected",
                )
            }
        }
        refreshProjects(silent = true, autoConfirm = false)
    }

    fun startPushToTalk() {
        accumulatedTranscript = null
        _uiState.update {
            it.copy(
                isListening = true,
                pendingTranscript = null,
                liveTranscript = null,
                statusMessage = "Listening — tap stop when done",
            )
        }
        speechHelper.startSession()
    }

    fun stopPushToTalk() {
        if (!_uiState.value.isListening) return
        _uiState.update {
            it.copy(statusMessage = "Processing...")
        }
        speechHelper.endSession()
    }

    fun discardPendingTranscript() {
        _uiState.update { it.copy(pendingTranscript = null, statusMessage = "Discarded") }
    }

    fun submitPendingTranscript() {
        val text = _uiState.value.pendingTranscript?.trim()?.takeIf { it.isNotEmpty() } ?: return
        submitTask(text)
        _uiState.update { it.copy(pendingTranscript = null) }
    }

    fun submitTask(text: String) {
        if (text.isBlank()) return
        val projectId = _uiState.value.selectedProjectId
        if (projectId.isNullOrBlank() || !_uiState.value.projectConfirmed) {
            _uiState.update { it.copy(statusMessage = "Select a project first") }
            refreshProjects(silent = true)
            return
        }
        viewModelScope.launch {
            try {
                _uiState.update { it.copy(isSending = true, statusMessage = "Sending...") }
                val result = taskRepository.createTask(text, projectId)
                val taskId = result.id.toIntOrNull()
                if (taskId != null) {
                    sessionStore.addRecentTask(
                        RecentTask(
                            taskId = taskId,
                            title = result.name,
                            projectId = result.projectId,
                            projectName = result.projectName,
                            createdAt = result.createdAt ?: java.time.Instant.now().toString(),
                        ),
                    )
                }
                val recent = sessionStore.recentTasks()
                _uiState.update {
                    it.copy(
                        recentTasks = recent,
                        answerEntries = answerEntriesFor(recent, it.inboxItems, it.selectedProjectId, it.projectConfirmed, it.projects),
                        lastTranscript = text,
                        pendingTranscript = null,
                        isSending = false,
                        statusMessage = "Sent — waiting for answer",
                    )
                }
                refreshInbox(silent = true, force = true)
                InboxPollWorker.start(getApplication())
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSending = false, statusMessage = "Failed: ${e.message}")
                }
            }
        }
    }

    private fun answerEntriesFor(
        recentTasks: List<RecentTask>,
        inboxItems: List<InboxItem>,
        selectedProjectId: String? = _uiState.value.selectedProjectId,
        projectConfirmed: Boolean = _uiState.value.projectConfirmed,
        projects: List<Project> = _uiState.value.projects,
    ): List<AnswerEntry> {
        val projectId = selectedProjectId?.takeIf { projectConfirmed }
        return buildAnswerEntries(recentTasks, inboxItems, projectId, projects)
    }

    private fun syncRecentTasksFromInbox(items: List<InboxItem>) {
        val state = _uiState.value
        val projectId = state.selectedProjectId?.takeIf { state.projectConfirmed }
        val scopedItems = if (projectId.isNullOrBlank()) {
            items
        } else {
            items.filter { item -> taskBelongsToProject(item.projectId, projectId, state.projects) }
        }
        scopedItems.asReversed().forEach { item ->
            sessionStore.addRecentTask(
                RecentTask(
                    taskId = item.taskId,
                    title = item.title,
                    projectId = item.projectId,
                    projectName = item.projectName,
                    createdAt = item.createdAt,
                ),
            )
        }
    }

    override fun onCleared() {
        speechHelper.destroy()
        ttsHelper.destroy()
        super.onCleared()
    }
}
