package com.taskbridge.mobile.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Numbers
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.taskbridge.mobile.ui.components.AppBackground
import com.taskbridge.mobile.ui.components.GlassField
import com.taskbridge.mobile.ui.theme.AccentSoft
import com.taskbridge.mobile.ui.theme.Primary
import com.taskbridge.mobile.ui.theme.PrimarySoft
import com.taskbridge.mobile.ui.theme.SurfaceBorder
import com.taskbridge.mobile.ui.theme.TextMuted
import com.taskbridge.mobile.ui.theme.TextPrimary
import com.taskbridge.mobile.ui.theme.TextSecondary

@Composable
fun ConnectScreen(
    state: AppUiState,
    onHostChange: (String) -> Unit,
    onPortChange: (String) -> Unit,
    onApiKeyChange: (String) -> Unit,
    onScanQr: () -> Unit,
    onManualConnect: () -> Unit,
    onSelectProject: () -> Unit,
) {
    var showManual by rememberSaveable { mutableStateOf(false) }

    AppBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(32.dp))

            Box(
                modifier = Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .background(Brush.linearGradient(colors = listOf(PrimarySoft, Primary, AccentSoft)))
                    .border(1.dp, SurfaceBorder, RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = "TB", style = MaterialTheme.typography.headlineLarge, color = Color.White)
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Task Bridge",
                style = MaterialTheme.typography.displayLarge,
                color = TextPrimary,
            )
            Text(
                text = if (state.isConfigured) {
                    "Connected — pick a project to continue"
                } else {
                    "Scan QR or enter connection manually"
                },
                style = MaterialTheme.typography.bodyLarge,
                color = TextMuted,
                modifier = Modifier.padding(top = 12.dp),
            )

            Spacer(modifier = Modifier.height(40.dp))

            if (state.isConfigured) {
                Button(
                    onClick = onSelectProject,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary),
                ) {
                    Text("Select project", style = MaterialTheme.typography.titleMedium)
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            Button(
                onClick = onScanQr,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp)),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimarySoft),
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = if (state.isConfigured) "Rescan QR" else "Scan QR code",
                    style = MaterialTheme.typography.titleMedium,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            OutlinedButton(
                onClick = { showManual = !showManual },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(
                    text = if (showManual) "Hide manual setup" else "Manual setup",
                    color = TextSecondary,
                )
            }

            AnimatedVisibility(
                visible = showManual,
                enter = fadeIn() + slideInVertically { it / 2 },
                exit = fadeOut(),
            ) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    GlassField(
                        value = state.backendHost,
                        onValueChange = onHostChange,
                        label = "Host",
                        leadingIcon = Icons.Outlined.Language,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    GlassField(
                        value = state.backendPort.toString(),
                        onValueChange = onPortChange,
                        label = "Port",
                        leadingIcon = Icons.Outlined.Numbers,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    GlassField(
                        value = state.apiKey,
                        onValueChange = onApiKeyChange,
                        label = "API Key",
                        leadingIcon = Icons.Outlined.Key,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = onManualConnect,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("Connect")
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
