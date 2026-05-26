package com.taskbridge.mobile.domain.models

import android.net.Uri
import com.taskbridge.mobile.data.SessionStore
import org.json.JSONObject

object ConnectConfigParser {
    data class ConnectConfig(
        val host: String,
        val port: Int,
        val apiKey: String,
        val secure: Boolean,
    )

    fun parse(raw: String): ConnectConfig? {
        val text = raw.trim()
        if (text.startsWith("{")) {
            return parseJson(text)
        }
        return parseUri(text)
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
