package com.taskbridge.mobile.notifications

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.taskbridge.mobile.data.SessionStore
import com.taskbridge.mobile.data.TaskRepository
import com.taskbridge.mobile.domain.models.InboxItem
import java.util.concurrent.TimeUnit

class InboxPollWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val session = SessionStore(applicationContext)
        if (!session.isConfigured || !session.projectConfirmed) return Result.success()

        var shouldContinue = session.recentTasks().isNotEmpty()
        try {
            val items = TaskRepository(session).fetchInbox()
            notifyNewAnswers(applicationContext, session, items)
            shouldContinue = items.any { it.status == "pending" }
        } catch (_: Exception) {
        }

        if (shouldContinue) {
            scheduleNext(applicationContext)
        }
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "inbox_poll"

        fun start(context: Context) {
            val request = OneTimeWorkRequestBuilder<InboxPollWorker>()
                .setInitialDelay(10, TimeUnit.SECONDS)
                .setConstraints(networkConstraints())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request,
            )
        }

        fun scheduleNext(context: Context) {
            val request = OneTimeWorkRequestBuilder<InboxPollWorker>()
                .setInitialDelay(10, TimeUnit.SECONDS)
                .setConstraints(networkConstraints())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }

        private fun networkConstraints(): Constraints {
            return Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        }

        fun notifyNewAnswers(
            context: Context,
            session: SessionStore,
            items: List<InboxItem>,
        ) {
            val notifier = NotificationHelper(context)
            val notified = session.notifiedTaskIds()
            val recentIds = session.recentTasks().map { it.taskId }.toSet()
            for (item in items) {
                if (item.isReady && item.taskId in recentIds && item.taskId !in notified) {
                    notifier.showAnswerReady(item)
                    session.markNotified(item.taskId)
                }
            }
        }
    }
}
