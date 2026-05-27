package com.taskbridge.mobile.domain.models

data class Project(
    val id: String,
    val name: String,
    val vikunjaProjectId: Int = 0,
    val repoPath: String? = null,
)
