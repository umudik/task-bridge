package com.taskbridge.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.taskbridge.mobile.domain.models.AnswerEntry
import com.taskbridge.mobile.ui.components.AppBackground
import com.taskbridge.mobile.ui.components.ScrollToTopFab
import com.taskbridge.mobile.ui.theme.Accent
import com.taskbridge.mobile.ui.theme.AccentSoft
import com.taskbridge.mobile.ui.theme.Error
import com.taskbridge.mobile.ui.theme.PrimarySoft
import com.taskbridge.mobile.ui.theme.SurfaceBorder
import com.taskbridge.mobile.ui.theme.SurfaceElevated
import com.taskbridge.mobile.ui.theme.TextMuted
import com.taskbridge.mobile.ui.theme.TextPrimary
import com.taskbridge.mobile.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun AnswersListScreen(
    state: AppUiState,
    onBack: () -> Unit,
    onPoll: () -> Unit,
    onOpenTask: (Int) -> Unit,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val scrollToTop: () -> Unit = {
        scope.launch { listState.animateScrollToItem(0) }
    }

    LaunchedEffect(Unit) { onPoll() }

    LaunchedEffect(Unit) {
        while (true) {
            delay(12_000)
            onPoll()
        }
    }

    AppBackground {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable(onClick = scrollToTop),
                    ) {
                        Text(
                            text = "Inbox",
                            style = MaterialTheme.typography.headlineMedium,
                            color = TextPrimary,
                        )
                        Text(
                            text = "${state.answerEntries.size} tasks",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextMuted,
                        )
                    }
                }

                if (state.inboxError.isNotEmpty()) {
                    Text(
                        text = state.inboxError,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Error,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                if (state.isLoadingInbox && state.answerEntries.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = AccentSoft)
                    }
                    return@Column
                }

                if (state.answerEntries.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No tasks yet", color = TextMuted, style = MaterialTheme.typography.bodyLarge)
                    }
                    return@Column
                }

                LazyColumn(
                    state = listState,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.answerEntries, key = { "${it::class.simpleName}-${it.taskId}" }) { entry ->
                        when (entry) {
                            is AnswerEntry.Pending -> ListRow(
                                title = textSnippet(entry.title),
                                subtitle = "Waiting",
                                subtitleColor = AccentSoft,
                                onClick = { onOpenTask(entry.taskId) },
                            )
                            is AnswerEntry.Ready -> ListRow(
                                title = textSnippet(entry.item.title),
                                subtitle = textSnippet(
                                    if (entry.item.preview.isNotBlank()) entry.item.preview else entry.item.title,
                                ),
                                subtitleColor = TextSecondary,
                                isRead = entry.taskId in state.readTaskIds,
                                onClick = { onOpenTask(entry.taskId) },
                            )
                        }
                    }
                }
            }

            ScrollToTopFab(
                visible = listState.firstVisibleItemIndex > 0 ||
                    listState.firstVisibleItemScrollOffset > 0,
                onClick = scrollToTop,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(20.dp),
            )
        }
    }
}

@Composable
private fun ListRow(
    title: String,
    subtitle: String,
    subtitleColor: androidx.compose.ui.graphics.Color,
    isRead: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(SurfaceElevated.copy(alpha = 0.7f))
            .border(1.dp, SurfaceBorder, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = subtitleColor,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (isRead) {
            Text(
                text = "Read",
                style = MaterialTheme.typography.labelSmall,
                color = TextMuted,
                modifier = Modifier.padding(end = 4.dp),
            )
        }
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted)
    }
}
