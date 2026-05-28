package com.taskbridge.mobile.domain.models

import android.net.Uri
import com.taskbridge.mobile.data.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object ConnectConfigParser {
    data class ConnectConfig(
        val host: String,
        val port: Int,
        val apiKey: String,
        val secure: Boolean,
    )

    private val fetchClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    fun parse(raw: String): ConnectConfig? {
        val text = raw.trim()
        if (text.startsWith("{")) {
            return parseJson(text)
        }
        return parseUri(text)
    }

    suspend fun resolve(raw: String): ConnectConfig? {
        val text = raw.trim()
        val fetchUrl = when {
            text.startsWith("http", ignoreCase = true) && text.contains("connect.json") -> text
            else -> {
                val uri = Uri.parse(text)
                if (uri.scheme == "taskbridge" && uri.host == "connect") {
                    uri.getQueryParameter("fetch")
                } else {
                    null
                }
            }
        }
        if (!fetchUrl.isNullOrBlank()) {
            fetchJson(fetchUrl)?.let { return it }
        }
        return parse(text)
    }

    private suspend fun fetchJson(url: String): ConnectConfig? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(url)
                .get()
                .addHeader("Accept", "application/json")
                .addHeader("ngrok-skip-browser-warning", "true")
                .build()
            fetchClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string() ?: return@withContext null
                parseJson(body)
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseJson(text: String): ConnectConfig? {
        return try {
            val json = JSONObject(text)
            ConnectConfig(
                host = json.getString("host"),
                port = json.optInt("port", SessionStore.DEFAULT_PORT),
                apiKey = json.optString("apiKey", SessionStore.DEFAULT_API_KEY),
                secure = json.optBoolean("secure", false),
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun parseUri(text: String): ConnectConfig? {
        return try {
            val uri = Uri.parse(text)
            if (uri.scheme != "taskbridge" || uri.host != "connect") return null
            val host = uri.getQueryParameter("host") ?: return null
            val port = uri.getQueryParameter("port")?.toIntOrNull() ?: SessionStore.DEFAULT_PORT
            val apiKey = uri.getQueryParameter("key") ?: SessionStore.DEFAULT_API_KEY
            val secure = uri.getQueryParameter("secure") == "1"
            ConnectConfig(host = host, port = port, apiKey = apiKey, secure = secure)
        } catch (_: Exception) {
            null
        }
    }
}
