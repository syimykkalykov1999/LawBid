package com.lawbid.lawbid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Owner 2026-10-22 (message pushes like WhatsApp / Telegram): one
 * notification per chat in the shade (tag = the chat id), drawn as
 * NotificationCompat.MessagingStyle — each message under its sender's name
 * and round photo, a group titled with the group. The sender is shown as the
 * person saved them in the phone book when they are a LawBid contact
 * (`setContactNames`, written by the app; the names never leave the
 * phone), else as the server named them (display name / @username).
 *
 * The chat's recent messages are kept here while its notification is in
 * the shade (an edit replaces its line); swiping it away, opening the chat
 * or reading it elsewhere starts the stack afresh. A conversation shortcut
 * puts the chat in Android 11+'s «Conversations» section with the photo.
 */
object ChatNotifications {
    const val ACTION_OPEN_CHAT = "com.lawbid.lawbid.OPEN_CHAT"
    const val EXTRA_CONVERSATION = "conversationId"
    const val EXTRA_GROUP = "groupId"
    const val CHANNEL = "chats"

    /** The notification id under each chat's tag. */
    private const val NOTIFICATION_ID = 7100
    private const val PREFS = "lawbid_chat_push"
    private const val NAMES = "contact_names"
    private const val MAX_LINES = 8
    private const val AVATAR_PX = 192
    private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024

    fun show(context: Context, data: Map<String, String>) {
        val conversation = data["conversationId"]?.takeIf { it.isNotEmpty() } ?: return
        val group = data["isGroup"] == "1"
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        ensureChannel(context)

        val senderId = data["senderId"].orEmpty()
        val name = contactName(context, senderId)
            ?: data["senderName"]?.takeIf { it.isNotEmpty() }
            ?: data["title"].orEmpty()
        val text = data["text"] ?: data["body"].orEmpty()
        val messageId = data["messageId"].orEmpty()
        val lineId = when (data["event"]) {
            "reaction" -> "r:$messageId:$senderId"
            else -> messageId
        }
        val senderKey = avatarKey(data["senderAvatarKey"], data["senderAvatar"])
        // Downloaded once per photo; older lines reuse the cached file.
        cacheAvatar(context, senderKey, data["senderAvatar"])
        val chatKey = avatarKey(data["chatAvatarKey"], data["chatAvatar"])
        if (group) cacheAvatar(context, chatKey, data["chatAvatar"])

        val lines = history(context, conversation, shown = isShown(context, conversation))
        val line = JSONObject()
            .put("id", lineId)
            .put("senderId", senderId)
            .put("name", name)
            .put("avatar", senderKey ?: "")
            .put("text", text)
            .put("at", data["sentAt"]?.toLongOrNull() ?: System.currentTimeMillis())
        val existing = (0 until lines.length()).firstOrNull {
            lines.getJSONObject(it).optString("id") == lineId
        }
        if (existing != null) lines.put(existing, line) else lines.put(line)
        while (lines.length() > MAX_LINES) lines.remove(0)
        saveHistory(context, conversation, lines)

        val me = Person.Builder()
            .setName(context.getString(R.string.chat_me))
            .setKey("me")
            .build()
        val style = NotificationCompat.MessagingStyle(me)
        val people = LinkedHashMap<String, Person>()
        for (i in 0 until lines.length()) {
            val l = lines.getJSONObject(i)
            val id = l.optString("senderId")
            // A name saved in the phone book later wins for older lines too.
            val shownName = contactName(context, id) ?: l.optString("name")
            val person = people.getOrPut("$id|$shownName") {
                Person.Builder()
                    .setName(shownName.ifEmpty { " " })
                    .setKey(id.ifEmpty { shownName })
                    .apply { avatarIcon(context, l.optString("avatar"))?.let { setIcon(it) } }
                    .build()
            }
            style.addMessage(l.optString("text"), l.optLong("at"), person)
        }
        val chatTitle = data["chatTitle"].orEmpty()
        if (group) {
            style.conversationTitle = chatTitle
            style.isGroupConversation = true
        }

        val open = PendingIntent.getActivity(
            context,
            conversation.hashCode(),
            openIntent(context, conversation, if (group) conversation else null),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val sender = people.values.lastOrNull()
        val shortcutIcon = if (group) avatarIcon(context, chatKey) else avatarIcon(context, senderKey)
        val shortcutId = publishShortcut(
            context,
            conversation,
            label = if (group) chatTitle.ifEmpty { name } else name,
            icon = shortcutIcon,
            person = if (group) null else sender,
            group = group,
        )
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(context.applicationInfo.icon)
            .setStyle(style)
            .setContentTitle(if (group) chatTitle else name)
            .setContentText(if (group) "$name: $text" else text)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setWhen(line.optLong("at"))
            .setShowWhen(true)
        shortcutId?.let { builder.setShortcutId(it) }
        if (!group) avatarBitmap(context, senderKey)?.let { builder.setLargeIcon(it) }
        try {
            manager.notify(conversation, NOTIFICATION_ID, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS refused meanwhile.
        }
    }

    /** The chat was opened in the app: its notification and stack go. */
    fun clear(context: Context, conversation: String) {
        NotificationManagerCompat.from(context).cancel(conversation, NOTIFICATION_ID)
        prefs(context).edit().remove("h:$conversation").apply()
    }

    /** Sign-out: no chat of the previous account stays in the shade. */
    fun clearAll(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        try {
            nm?.activeNotifications?.forEach {
                if (it.id == NOTIFICATION_ID) nm.cancel(it.tag, it.id)
            }
        } catch (e: Exception) {
            // listing not allowed: nothing to clear
        }
        prefs(context).edit().clear().apply()
        try {
            ShortcutManagerCompat.removeAllDynamicShortcuts(context)
        } catch (e: Exception) {
        }
    }

    /** userId → the name saved in the phone book (LawBid contacts only). */
    fun setContactNames(context: Context, names: Map<String, String>) {
        val json = JSONObject()
        for ((id, name) in names) if (name.isNotBlank()) json.put(id, name)
        prefs(context).edit().putString(NAMES, json.toString()).apply()
    }

    fun openIntent(context: Context, conversation: String, groupId: String?): Intent =
        Intent(context, MainActivity::class.java)
            .setAction(ACTION_OPEN_CHAT)
            .putExtra(EXTRA_CONVERSATION, conversation)
            .apply { if (groupId != null) putExtra(EXTRA_GROUP, groupId) }
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)

    /** The chat a tapped notification opens (null for any other intent). */
    fun openTarget(intent: Intent?): Map<String, String>? {
        if (intent?.action != ACTION_OPEN_CHAT) return null
        val conversation = intent.getStringExtra(EXTRA_CONVERSATION) ?: return null
        val out = hashMapOf(
            "type" to "new_message",
            "conversationId" to conversation,
        )
        intent.getStringExtra(EXTRA_GROUP)?.let { out["groupId"] = it }
        return out
    }

    /** The «Chats» channel, as MainActivity creates it (a push may come
     * before the app was opened after an update). */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL,
                context.getString(R.string.channel_chats),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs) },
        )
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun contactName(context: Context, userId: String): String? {
        if (userId.isEmpty()) return null
        val raw = prefs(context).getString(NAMES, null) ?: return null
        return try {
            JSONObject(raw).optString(userId).takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            null
        }
    }

    private fun isShown(context: Context, conversation: String): Boolean {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return false
        return try {
            nm.activeNotifications.any { it.id == NOTIFICATION_ID && it.tag == conversation }
        } catch (e: Exception) {
            false
        }
    }

    /** The lines still in the shade; a notification swiped away (or opened)
     * starts a fresh stack. */
    private fun history(context: Context, conversation: String, shown: Boolean): JSONArray {
        if (!shown) return JSONArray()
        val raw = prefs(context).getString("h:$conversation", null) ?: return JSONArray()
        return try {
            JSONArray(raw)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    private fun saveHistory(context: Context, conversation: String, lines: JSONArray) {
        prefs(context).edit().putString("h:$conversation", lines.toString()).apply()
    }

    private fun publishShortcut(
        context: Context,
        conversation: String,
        label: String,
        icon: IconCompat?,
        person: Person?,
        group: Boolean,
    ): String? {
        return try {
            val id = "chat:$conversation"
            val shortcut = ShortcutInfoCompat.Builder(context, id)
                .setShortLabel(label.ifEmpty { "LawBid" })
                .setLongLived(true)
                .setIntent(openIntent(context, conversation, if (group) conversation else null))
                .setCategories(setOf("android.shortcut.conversation"))
                .apply {
                    icon?.let { setIcon(it) }
                    person?.let { setPerson(it) }
                }
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
            id
        } catch (e: Exception) {
            null
        }
    }

    /** The cache file name of a photo: its file id (a signed link changes
     * every push, the file does not), else a hash of the link. */
    private fun avatarKey(fileId: String?, url: String?): String? {
        if (url.isNullOrEmpty()) return null
        val base = fileId?.takeIf { it.isNotEmpty() } ?: sha1(url)
        return base.replace(Regex("[^A-Za-z0-9_-]"), "_")
    }

    private fun avatarFile(context: Context, key: String): File =
        File(File(context.cacheDir, "chat_avatars").apply { mkdirs() }, "$key.png")

    private fun cacheAvatar(context: Context, key: String?, url: String?) {
        if (key == null || url.isNullOrEmpty()) return
        val file = avatarFile(context, key)
        if (file.exists()) return
        if (!url.startsWith("https://") && !url.startsWith("http://")) return
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 5000
                instanceFollowRedirects = true
            }
            if (conn.responseCode !in 200..299) return
            val bytes = conn.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_AVATAR_BYTES) return
                }
                out.toByteArray()
            }
            val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return
            val round = circle(source)
            val tmp = File(file.parentFile, "${file.name}.tmp")
            FileOutputStream(tmp).use { round.compress(Bitmap.CompressFormat.PNG, 100, it) }
            tmp.renameTo(file)
        } catch (e: Exception) {
            // No photo this time: the initials-less default person icon.
        } finally {
            conn?.disconnect()
        }
    }

    private fun avatarBitmap(context: Context, key: String?): Bitmap? {
        if (key.isNullOrEmpty()) return null
        val file = avatarFile(context, key)
        if (!file.exists()) return null
        return BitmapFactory.decodeFile(file.path)
    }

    private fun avatarIcon(context: Context, key: String?): IconCompat? =
        avatarBitmap(context, key)?.let { IconCompat.createWithBitmap(it) }

    /** A round [AVATAR_PX] picture cut from the middle of [source]. */
    private fun circle(source: Bitmap): Bitmap {
        val side = minOf(source.width, source.height)
        val out = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        val dst = RectF(0f, 0f, AVATAR_PX.toFloat(), AVATAR_PX.toFloat())
        canvas.drawOval(dst, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val left = (source.width - side) / 2
        val top = (source.height - side) / 2
        canvas.drawBitmap(source, Rect(left, top, left + side, top + side), dst, paint)
        return out
    }

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
