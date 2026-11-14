package com.lawbid.lawbid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Owner row 42 (review of PR #1034): while a video is re-encoded the app
 * stays alive when the person leaves it — a foreground service with a quiet
 * progress notification, the way Android's «Foreground services» guide
 * (developer.android.com/develop/background-work/services/fgs, read
 * 13.11.2026) shows: startForegroundService → startForeground with a type
 * within seconds, stopSelf when the work is done. Type `mediaProcessing`
 * (made for transcoding) on Android 15+, `dataSync` on 10–14.
 *
 * The channel `lawbid_uploads` («Загрузки») is meant to be shared with the
 * upload foreground service another task adds; IMPORTANCE_LOW = no sound.
 * Started and stopped only by [VideoEncoder].
 */
class VideoEncodeService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    /** Android 15+: the type's daily time is used up — stop now, as the
     * guide asks (else the system stops the app). The encode keeps going
     * while the app is open. */
    override fun onTimeout(startId: Int, fgsType: Int) {
        stopForegroundCompat()
        stopSelf()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }
        val percent = intent?.getIntExtra(EXTRA_PERCENT, -1) ?: -1
        val notification = build(this, percent)
        try {
            when {
                Build.VERSION.SDK_INT >= 35 -> startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING,
                )
                Build.VERSION.SDK_INT >= 29 -> startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
                )
                else -> startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            // Not allowed right now (started from the background, the daily
            // limit of the type): the encode still runs while the app lives.
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun stopForegroundCompat() {
        try {
            if (Build.VERSION.SDK_INT >= 24) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            // not in the foreground
        }
    }

    companion object {
        const val CHANNEL = "lawbid_uploads"
        const val NOTIFICATION_ID = 7300
        private const val ACTION_STOP = "com.lawbid.lawbid.VIDEO_ENCODE_STOP"
        private const val EXTRA_PERCENT = "percent"

        /** Starts the service, or updates its progress (0..100, -1 = unknown). */
        fun start(context: Context, percent: Int) {
            val intent = Intent(context, VideoEncodeService::class.java)
                .putExtra(EXTRA_PERCENT, percent)
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                // Android 12+ refuses a start from the background: no service.
            }
        }

        /** Only the notification's progress (no service start each tick). */
        fun progress(context: Context, percent: Int) {
            try {
                context.getSystemService(NotificationManager::class.java)
                    ?.notify(NOTIFICATION_ID, build(context, percent))
            } catch (e: Exception) {
                // notifications off: nothing to update
            }
        }

        fun stop(context: Context) {
            try {
                context.startService(
                    Intent(context, VideoEncodeService::class.java).setAction(ACTION_STOP),
                )
            } catch (e: Exception) {
                // not running
            }
            try {
                context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
            } catch (e: Exception) {
                // nothing to cancel
            }
        }

        private fun build(context: Context, percent: Int): Notification {
            if (Build.VERSION.SDK_INT >= 26) {
                context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL,
                        context.getString(R.string.channel_uploads),
                        NotificationManager.IMPORTANCE_LOW,
                    ),
                )
            }
            return NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(context.applicationInfo.icon)
                .setContentTitle(context.getString(R.string.video_preparing))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setProgress(100, percent.coerceIn(0, 100), percent < 0)
                .build()
        }
    }
}
