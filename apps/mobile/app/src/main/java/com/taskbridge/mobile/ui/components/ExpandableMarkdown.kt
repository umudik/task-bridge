package com.taskbridge.mobile.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import com.taskbridge.mobile.ui.theme.AccentSoft

@Composable
fun ExpandableMarkdown(
    text: String,
    modifier: Modifier = Modifier,
    collapsedMaxLines: Int = 8,
    color: Color = MaterialTheme.colorScheme.onSurface,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyLarge,
) {
    var expanded by rememberSaveable(text) { mutableStateOf(false) }
    var canExpand by rememberSaveable(text) { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxWidth()) {
        MarkdownText(
            text = text,
            color = color,
            style = style,
            maxLines = if (expanded) Int.MAX_VALUE else collapsedMaxLines,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { result ->
                if (!expanded) {
                    canExpand = result.hasVisualOverflow || result.lineCount >= collapsedMaxLines
                }
            },
        )
        if (canExpand) {
            Text(
                text = if (expanded) "Show less" else "Show more",
                style = MaterialTheme.typography.labelLarge,
                color = AccentSoft,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded },
            )
        }
    }
}
