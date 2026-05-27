package com.taskbridge.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import com.taskbridge.mobile.ui.components.ScrollToTopFab
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.taskbridge.mobile.ui.components.AppBackground
import com.taskbridge.mobile.ui.theme.Accent
import com.taskbridge.mobile.ui.theme.AccentSoft
import com.taskbridge.mobile.ui.theme.Error
import com.taskbridge.mobile.ui.theme.PrimarySoft
import com.taskbridge.mobile.ui.theme.Success
import com.taskbridge.mobile.ui.theme.SurfaceBorder
import com.taskbridge.mobile.ui.theme.SurfaceElevated
import com.taskbridge.mobile.ui.theme.TextMuted
import com.taskbridge.mobile.ui.theme.TextPrimary
import com.taskbridge.mobile.ui.theme.TextSecondary
import kotlinx.coroutines.delay

@Composable
fun AnswerDetailScreen(
    taskId: Int,
    state: AppUiState,
    onBack: () -> Unit,
    onLoad: (Int) -> Unit,
    onPoll: (Int) -> Unit,
    onToggleSpeech: (String) -> Unit,
) {
    LaunchedEffect(taskId) { onLoad(taskId) }

    val detail = state.activeDetail
    val isPending = detail?.status == "pending"

    LaunchedEffect(taskId, isPending) {
        if (!isPending) return@LaunchedEffect
        while (true) {
            delay(12_000)
            onPoll(taskId)
        }
    }

    AppBackground {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = detail?.title ?: "Task #$taskId",
                            style = MaterialTheme.typography.titleLarge,
                            color = TextPrimary,
                        )
                        StatusBadge(
                            ready = detail?.status == "ready",
                            loading = state.isLoadingDetail && detail == null,
                        )
                    }
                }

                if (state.isLoadingDetail && detail == null) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = AccentSoft)
                    }
                    return@Column
                }

                val detailError = state.detailError
                if (detailError != null && detail == null) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(detailError, color = Error)
                    }
                    return@Column
                }

                if (detail == null) return@Column

                val scrollState = rememberScrollState()
                val scope = rememberCoroutineScope()

                Box(modifier = Modifier.weight(1f)) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                    Spacer(modifier = Modifier.height(4.dp))

                    DetailSection(title = "Your request") {
                        MetaRow("Created by", detail.createdBy)
                        MetaRow("Sent at", formatTimestamp(detail.createdAt))
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = detail.request,
                            style = MaterialTheme.typography.bodyLarge,
                            color = TextPrimary,
                        )
                    }

                    if (detail.status == "ready" && !detail.answer.isNullOrBlank()) {
                        DetailSection(title = "Answer") {
                            MetaRow("Answered by", detail.answeredBy ?: "Cursor AI")
                            MetaRow("Answered at", formatTimestamp(detail.answeredAt))
                            MetaRow("Duration", formatDuration(detail.durationMs))
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = detail.answer,
                                style = MaterialTheme.typography.bodyLarge,
                                color = TextPrimary,
                            )
                        }
                    } else {
                        DetailSection(title = "Answer") {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Accent,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(modifier = Modifier.size(12.dp))
                                Text(
                                    text = "Waiting for Cursor AI...",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = AccentSoft,
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(80.dp))
                    }

                    ScrollToTopFab(
                        visible = scrollState.value > 200,
                        onClick = { scope.launch { scrollState.animateScrollTo(0) } },
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(bottom = 8.dp),
                    )
                }
            }

            val readyAnswer = detail?.takeIf { it.status == "ready" }?.answer?.takeIf { it.isNotBlank() }
            if (readyAnswer != null) {
                FloatingActionButton(
                    onClick = { onToggleSpeech(readyAnswer) },
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(24.dp),
                    containerColor = if (state.isSpeaking) Accent else PrimarySoft,
                ) {
                    Icon(
                        imageVector = if (state.isSpeaking) Icons.Default.Stop else Icons.Default.PlayArrow,
                        contentDescription = if (state.isSpeaking) "Stop" else "Listen",
                        tint = Color.White,
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(ready: Boolean, loading: Boolean) {
    val (label, color) = when {
        loading -> "Loading" to TextMuted
        ready -> "Ready" to Success
        else -> "Waiting" to AccentSoft
    }
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = color,
        modifier = Modifier.padding(top = 2.dp),
    )
}

@Composable
private fun DetailSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceElevated.copy(alpha = 0.75f))
            .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
            .padding(16.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = TextMuted,
            modifier = Modifier.padding(bottom = 10.dp),
        )
        content()
    }
}

@Composable
private fun MetaRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = TextMuted)
        Text(text = value, style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
    }
}
