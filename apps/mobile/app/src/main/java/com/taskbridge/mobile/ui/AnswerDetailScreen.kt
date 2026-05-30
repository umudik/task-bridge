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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import com.taskbridge.mobile.ui.components.ExpandableMarkdown
import com.taskbridge.mobile.ui.components.MarkdownText
import com.taskbridge.mobile.ui.components.ScrollToTopFab
import java.time.Instant
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.taskbridge.mobile.ui.components.AppBackground
import com.taskbridge.mobile.ui.theme.AccentSoft
import com.taskbridge.mobile.ui.theme.Error
import com.taskbridge.mobile.ui.theme.SurfaceBorder
import com.taskbridge.mobile.ui.theme.SurfaceElevated
import com.taskbridge.mobile.ui.theme.TextMuted
import com.taskbridge.mobile.ui.theme.TextPrimary

@Composable
fun AnswerDetailScreen(
    taskId: Int,
    state: AppUiState,
    onBack: () -> Unit,
    onLoad: (Int) -> Unit,
    onSendComment: (Int, String) -> Unit,
) {
    LaunchedEffect(taskId) { onLoad(taskId) }

    val detail = state.activeDetail

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
                    Text(
                        text = detail?.title?.takeIf { it.isNotBlank() } ?: "Task",
                        style = MaterialTheme.typography.headlineSmall,
                        color = TextPrimary,
                        modifier = Modifier.weight(1f),
                    )
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
                var commentText by rememberSaveable { mutableStateOf("") }

                Box(modifier = Modifier.weight(1f)) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(bottom = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Spacer(modifier = Modifier.height(8.dp))

                        DetailSection(title = "Description") {
                            ExpandableMarkdown(
                                text = detail.description?.takeIf { it.isNotBlank() } ?: detail.request,
                                color = TextPrimary,
                            )
                        }

                        DetailSection(title = "Comments") {
                            if (detail.comments.isEmpty()) {
                                Text(
                                    text = "No comments yet.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = TextMuted,
                                )
                            } else {
                                Column(modifier = Modifier.fillMaxWidth()) {
                                    detail.comments
                                        .sortedBy { parseCommentTime(it.at) }
                                        .forEachIndexed { index, comment ->
                                            if (index > 0) {
                                                Box(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .padding(vertical = 8.dp)
                                                        .height(1.dp)
                                                        .background(SurfaceBorder),
                                                )
                                            }
                                            FlatCommentRow(comment)
                                        }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(24.dp))
                    }

                    ScrollToTopFab(
                        visible = scrollState.value > 200,
                        onClick = { scope.launch { scrollState.animateScrollTo(0) } },
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(bottom = 8.dp),
                    )
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                        .background(SurfaceElevated.copy(alpha = 0.95f))
                        .border(1.dp, SurfaceBorder, RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = commentText,
                        onValueChange = { commentText = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Add a comment…") },
                        enabled = !state.isSendingComment,
                        minLines = 2,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(
                            onClick = {
                                val text = commentText.trim()
                                if (text.isNotBlank()) {
                                    onSendComment(taskId, text)
                                    commentText = ""
                                }
                            },
                            enabled = !state.isSendingComment && commentText.isNotBlank(),
                        ) {
                            Text(if (state.isSendingComment) "Saving…" else "Comment")
                        }
                    }
                }
            }
        }
    }
}

private fun parseCommentTime(value: String?): Long {
    if (value.isNullOrBlank()) return 0L
    return runCatching { Instant.parse(value).toEpochMilli() }.getOrDefault(0L)
}

private fun commentAuthor(comment: com.taskbridge.mobile.domain.models.TaskComment): String {
    val name = comment.by.trim()
    if (name.isNotEmpty()) return name
    return if (comment.isUser) "User" else "Cursor AI"
}

@Composable
private fun FlatCommentRow(comment: com.taskbridge.mobile.domain.models.TaskComment) {
    val name = commentAuthor(comment)
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = buildString {
                append(name)
                if (comment.at.isNotBlank()) {
                    append(" · ")
                    append(formatTimestamp(comment.at))
                }
            },
            style = MaterialTheme.typography.labelMedium,
            color = TextMuted,
        )
        Spacer(modifier = Modifier.height(4.dp))
        MarkdownText(
            text = comment.text,
            color = TextPrimary,
        )
    }
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

