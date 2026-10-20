package com.lawbid.lawbid

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Owner 2026-10-20: a call in progress must stay visible like in WhatsApp —
 * an ongoing call notification (call style, so Samsung/Android 12+ show the
 * green chip in the status bar) with a timer; a tap opens the call screen,
 * "Hang up" ends the call. It is also the foreground service that keeps
 * the process and the microphone alive while the app is minimised.
 * Started and stopped from Dart (`lawbid/call_service`).
 */
class CallForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        val name = intent?.getStringExtra(EXTRA_NAME) ?: ""
        val since = intent?.getLongExtra(EXTRA_SINCE, 0L) ?: 0L
        val notification = build(name, since)
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                // Without the microphone permission (first call, before the
                // system asked) only the phone-call type is allowed.
                val micOk = checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
                    (if (micOk) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
                startForeground(NOTIFICATION_ID, notification, type)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            // Not allowed to start right now: show a plain notification.
            getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    private fun build(name: String, since: Long): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            manager?.createNotificationChannel(
                NotificationChannel(
                    CHANNEL,
                    getString(R.string.channel_call),
                    NotificationManager.IMPORTANCE_DEFAULT,
                ),
            )
        }
        val open = PendingIntent.getActivity(
            this,
            1,
            Intent(this, MainActivity::class.java)
                .setAction(ACTION_OPEN)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val hangUp = PendingIntent.getActivity(
            this,
            2,
            Intent(this, MainActivity::class.java)
                .setAction(ACTION_HANGUP)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val b = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        b.setSmallIcon(applicationInfo.icon)
            .setContentTitle(name)
            .setContentText(
                getString(if (since > 0) R.string.call_ongoing else R.string.call_connecting),
            )
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_CALL)
        if (since > 0) {
            b.setWhen(since).setUsesChronometer(true).setShowWhen(true)
        }
        if (Build.VERSION.SDK_INT >= 31) {
            val person = Person.Builder().setName(name.ifEmpty { "LawBid" }).setImportant(true).build()
            b.setStyle(Notification.CallStyle.forOngoingCall(person, hangUp))
        } else {
            @Suppress("DEPRECATION")
            b.addAction(
                Notification.Action.Builder(
                    null,
                    getString(R.string.call_hangup),
                    hangUp,
                ).build(),
            )
        }
        if (Build.VERSION.SDK_INT >= 31) {
            b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
        return b.build()
    }

    companion object {
        const val CHANNEL = "call_ongoing"
        const val NOTIFICATION_ID = 7003
        const val EXTRA_NAME = "name"
        const val EXTRA_SINCE = "since"
        const val ACTION_STOP = "com.lawbid.lawbid.CALL_STOP"
        const val ACTION_OPEN = "com.lawbid.lawbid.CALL_OPEN"
        const val ACTION_HANGUP = "com.lawbid.lawbid.CALL_HANGUP"
    }
}
