package com.lawbid.lawbid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * Owner 2026-10-26 («уведомления с аватарками, как в WhatsApp»): a
 * notification that is not a chat message but has a person behind it — a
 * bid, a case update, a comment, a like, a follow, a missed call. The
 * server sends it data-only to apps that registered `actorStyle`
 * (`data.style == "actor"`); this draws it in the «Уведомления» channel
 * with that person's round photo (or the app's letters avatar) as the
 * large icon, the full text when expanded, and a tap that opens the same
 * screen the in-app bell would (MainActivity → Dart `open`).
 */
object ActorNotifications {
    const val NOTIFICATION_ID = 7200
    private const val CHANNEL = MainActivity.CHANNEL_NOTIFICATIONS

    /** Keys the tap passes to Dart (the deep link; no picture links). */
    private val SKIP = setOf("actorAvatar", "actorAvatarKey", "title", "body", "style", "iconBadge")

    fun show(context: Context, data: Map<String, String>) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        val noBadge = data["iconBadge"] == "0"
        ensureChannel(context, noBadge)
        val name = data["actorName"].orEmpty()
        val title = data["title"].orEmpty().ifEmpty { name }
        val body = data["body"].orEmpty()
        val key = ChatNotifications.avatarKey(data["actorAvatarKey"], data["actorAvatar"])
        ChatNotifications.cacheAvatar(context, key, data["actorAvatar"])
        val photo = ChatNotifications.avatarBitmap(context, key)
            ?: ChatNotifications.initialsBitmap(name)

        val tag = data["notificationId"]?.takeIf { it.isNotEmpty() }
            ?: "${data["type"]}:${System.currentTimeMillis()}"
        val payload = JSONObject()
        for ((k, v) in data) if (k !in SKIP) payload.put(k, v)
        val open = PendingIntent.getActivity(
            context,
            tag.hashCode(),
            Intent(context, MainActivity::class.java)
                .setAction(ChatNotifications.ACTION_OPEN_NOTIFICATION)
                .putExtra(ChatNotifications.EXTRA_DATA, payload.toString())
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = NotificationCompat.Builder(context, if (noBadge) CHANNEL + MainActivity.NO_BADGE else CHANNEL)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(
                if (data["type"] == "missed_call") NotificationCompat.CATEGORY_MISSED_CALL
                else NotificationCompat.CATEGORY_SOCIAL,
            )
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setShowWhen(true)
        photo?.let { builder.setLargeIcon(it) }
        if (noBadge) builder.setBadgeIconType(NotificationCompat.BADGE_ICON_NONE).setNumber(0)
        try {
            manager.notify(tag, NOTIFICATION_ID, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS refused meanwhile.
        }
    }

    /** The «Notifications» channel, as MainActivity creates it. */
    private fun ensureChannel(context: Context, noBadge: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val id = if (noBadge) CHANNEL + MainActivity.NO_BADGE else CHANNEL
        if (nm.getNotificationChannel(id) != null) return
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        nm.createNotificationChannel(
            NotificationChannel(
                id,
                context.getString(R.string.channel_notifications),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs)
                if (noBadge) setShowBadge(false)
            },
        )
    }
}
