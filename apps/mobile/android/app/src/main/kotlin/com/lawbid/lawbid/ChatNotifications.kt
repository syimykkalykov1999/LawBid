package com.lawbid.lawbid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
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
 *
 * Owner 2026-10-26 («полный фарш»): a person without a photo (or whose
 * photo did not download) gets the app's own letters avatar — navy circle,
 * gold letters — instead of a blank grey head; «Ответить» (direct reply,
 * also from a watch / Android Auto) and «Прочитано» work without opening
 * the app (PushActionReceiver); a reply sent from the shade joins the stack
 * as «Вы: …».
 */
object ChatNotifications {
    const val ACTION_OPEN_CHAT = "com.lawbid.lawbid.OPEN_CHAT"
    /** Owner 2026-10-26: a notification with a person (ActorNotifications). */
    const val ACTION_OPEN_NOTIFICATION = "com.lawbid.lawbid.OPEN_NOTIFICATION"
    const val EXTRA_CONVERSATION = "conversationId"
    const val EXTRA_GROUP = "groupId"
    const val EXTRA_DATA = "pushData"
    const val CHANNEL = "chats"
    /** MainActivity.NO_BADGE: the twin channel without a launcher badge. */
    const val NO_BADGE = MainActivity.NO_BADGE

    /** The notification id under each chat's tag. */
    private const val NOTIFICATION_ID = 7100
    private const val PREFS = "lawbid_chat_push"
    private const val NAMES = "contact_names"
    private const val API = "push_api"
    private const val DEVICE = "push_device"
    private const val MAX_LINES = 8
    private const val AVATAR_PX = 192
    private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024
    /** The app's letters avatar: navy circle, gold-light letters
     * (AppColors.navy / goldLight). */
    private val NAVY = Color.rgb(0x0A, 0x1A, 0x3F)
    private val GOLD_LIGHT = Color.rgb(0xE6, 0xD3, 0xA3)
    /** A reply written from the shade. */
    const val ME = "me"

    fun show(context: Context, data: Map<String, String>) {
        val conversation = data["conversationId"]?.takeIf { it.isNotEmpty() } ?: return
        val group = data["isGroup"] == "1"
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        // Owner 2026-10-22 (inbox 29): «Счётчик на иконке в меню» off —
        // the twin channel that puts no badge / dot on the launcher icon.
        val noBadge = data["iconBadge"] == "0"
        ensureChannel(context, noBadge)

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

        val meta = JSONObject()
            .put("group", group)
            .put("chatTitle", data["chatTitle"].orEmpty())
            .put("chatKey", chatKey ?: "")
            .put("noBadge", noBadge)
            .put("token", data["actionToken"].orEmpty())
            .put("messageId", messageId)
        prefs(context).edit().putString("m:$conversation", meta.toString()).apply()
        render(context, conversation, alert = true)
    }

    /** A reply sent from the notification: it joins the stack as «Вы: …»
     * (quietly — no second sound); [failed] says it did not go. */
    fun addOwnReply(context: Context, conversation: String, text: String, failed: Boolean) {
        val lines = history(context, conversation, shown = true)
        val shown = if (failed) "$text\n${context.getString(R.string.chat_reply_failed)}" else text
        lines.put(
            JSONObject()
                .put("id", "me:${System.currentTimeMillis()}")
                .put("senderId", ME)
                .put("name", context.getString(R.string.chat_me))
                .put("avatar", "")
                .put("text", shown)
                .put("at", System.currentTimeMillis()),
        )
        while (lines.length() > MAX_LINES) lines.remove(0)
        saveHistory(context, conversation, lines)
        render(context, conversation, alert = false)
    }

    /** Draws the chat's notification from its stored lines. */
    private fun render(context: Context, conversation: String, alert: Boolean) {
        val meta = try {
            JSONObject(prefs(context).getString("m:$conversation", null) ?: return)
        } catch (e: Exception) {
            return
        }
        val group = meta.optBoolean("group")
        val noBadge = meta.optBoolean("noBadge")
        val chatTitle = meta.optString("chatTitle")
        val chatKey = meta.optString("chatKey").takeIf { it.isNotEmpty() }
        val lines = history(context, conversation, shown = true)
        if (lines.length() == 0) return

        val me = Person.Builder()
            .setName(context.getString(R.string.chat_me))
            .setKey(ME)
            .build()
        val style = NotificationCompat.MessagingStyle(me)
        val people = LinkedHashMap<String, Person>()
        var lastName = ""
        var lastKey: String? = null
        var lastText = ""
        for (i in 0 until lines.length()) {
            val l = lines.getJSONObject(i)
            val id = l.optString("senderId")
            if (id == ME) {
                style.addMessage(l.optString("text"), l.optLong("at"), null as Person?)
                continue
            }
            // A name saved in the phone book later wins for older lines too.
            val shownName = contactName(context, id) ?: l.optString("name")
            val key = l.optString("avatar").takeIf { it.isNotEmpty() }
            val person = people.getOrPut("$id|$shownName") {
                Person.Builder()
                    .setName(shownName.ifEmpty { " " })
                    .setKey(id.ifEmpty { shownName })
                    .setIcon(avatarIcon(context, key) ?: initialsIcon(shownName))
                    .build()
            }
            style.addMessage(l.optString("text"), l.optLong("at"), person)
            lastName = shownName
            lastKey = key
            lastText = l.optString("text")
        }
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
        val shortcutIcon = if (group) {
            avatarIcon(context, chatKey) ?: initialsIcon(chatTitle)
        } else {
            avatarIcon(context, lastKey) ?: initialsIcon(lastName)
        }
        val shortcutId = publishShortcut(
            context,
            conversation,
            label = if (group) chatTitle.ifEmpty { lastName } else lastName,
            icon = shortcutIcon,
            person = if (group) null else sender,
            group = group,
        )
        val last = lines.getJSONObject(lines.length() - 1)
        val builder = NotificationCompat.Builder(context, if (noBadge) CHANNEL + NO_BADGE else CHANNEL)
            .setSmallIcon(context.applicationInfo.icon)
            .setStyle(style)
            .setContentTitle(if (group) chatTitle else lastName)
            .setContentText(if (group) "$lastName: $lastText" else lastText)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(!alert)
            .setContentIntent(open)
            .setWhen(last.optLong("at"))
            .setShowWhen(true)
        if (noBadge) builder.setBadgeIconType(NotificationCompat.BADGE_ICON_NONE).setNumber(0)
        shortcutId?.let { builder.setShortcutId(it) }
        if (!group) {
            (avatarBitmap(context, lastKey) ?: initialsBitmap(lastName))?.let { builder.setLargeIcon(it) }
        }
        addActions(context, builder, conversation, meta)
        try {
            NotificationManagerCompat.from(context).notify(conversation, NOTIFICATION_ID, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS refused meanwhile.
        }
    }

    /** «Ответить» (inline text, also on a watch) and «Прочитано» — only
     * when the push carried its ticket and the app told us its server. */
    private fun addActions(
        context: Context,
        builder: NotificationCompat.Builder,
        conversation: String,
        meta: JSONObject,
    ) {
        val token = meta.optString("token")
        if (token.isEmpty() || pushActions(context) == null) return
        val group = meta.optBoolean("group")
        val messageId = meta.optString("messageId")
        fun intent(action: String) = Intent(context, PushActionReceiver::class.java)
            .setAction(action)
            .putExtra(PushActionReceiver.EXTRA_CONVERSATION, conversation)
            .putExtra(PushActionReceiver.EXTRA_TOKEN, token)
            .putExtra(PushActionReceiver.EXTRA_MESSAGE, messageId)
            .putExtra(PushActionReceiver.EXTRA_GROUP, group)
        val remote = RemoteInput.Builder(PushActionReceiver.KEY_TEXT)
            .setLabel(context.getString(R.string.chat_reply_hint))
            .build()
        // A RemoteInput needs a mutable PendingIntent (Android 12+).
        val replyIntent = PendingIntent.getBroadcast(
            context,
            ("reply:$conversation").hashCode(),
            intent(PushActionReceiver.ACTION_REPLY),
            PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0),
        )
        val readIntent = PendingIntent.getBroadcast(
            context,
            ("read:$conversation").hashCode(),
            intent(PushActionReceiver.ACTION_READ),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        builder.addAction(
            NotificationCompat.Action.Builder(
                null as IconCompat?,
                context.getString(R.string.chat_action_reply),
                replyIntent,
            )
                .addRemoteInput(remote)
                .setAllowGeneratedReplies(true)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                .setShowsUserInterface(false)
                .build(),
        )
        builder.addAction(
            NotificationCompat.Action.Builder(
                null as IconCompat?,
                context.getString(R.string.chat_action_read),
                readIntent,
            )
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                .setShowsUserInterface(false)
                .build(),
        )
    }

    /** The chat was opened in the app: its notification and stack go. */
    fun clear(context: Context, conversation: String) {
        NotificationManagerCompat.from(context).cancel(conversation, NOTIFICATION_ID)
        prefs(context).edit().remove("h:$conversation").remove("m:$conversation").apply()
    }

    /** Sign-out: no chat of the previous account stays in the shade (and
     * the notification buttons stop: the device token is forgotten). */
    fun clearAll(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        try {
            nm?.activeNotifications?.forEach {
                if (it.id == NOTIFICATION_ID || it.id == ActorNotifications.NOTIFICATION_ID) {
                    nm.cancel(it.tag, it.id)
                }
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

    /** Owner 2026-10-26: the server (`…/api/v1`) and this device's push
     * token the notification buttons answer with. */
    fun setPushActions(context: Context, url: String?, token: String?) {
        val e = prefs(context).edit()
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            e.remove(API).remove(DEVICE)
        } else {
            e.putString(API, url.trimEnd('/')).putString(DEVICE, token)
        }
        e.apply()
    }

    /** (server, device token), or null before the app told us. */
    fun pushActions(context: Context): Pair<String, String>? {
        val p = prefs(context)
        val api = p.getString(API, null) ?: return null
        val device = p.getString(DEVICE, null) ?: return null
        return api to device
    }

    fun openIntent(context: Context, conversation: String, groupId: String?): Intent =
        Intent(context, MainActivity::class.java)
            .setAction(ACTION_OPEN_CHAT)
            .putExtra(EXTRA_CONVERSATION, conversation)
            .apply { if (groupId != null) putExtra(EXTRA_GROUP, groupId) }
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)

    /** What a tapped notification opens (null for any other intent): a
     * chat, or — owner 2026-10-26 — the screen of a notification with a
     * person (its push data: type, ids). */
    fun openTarget(intent: Intent?): Map<String, String>? {
        if (intent?.action == ACTION_OPEN_NOTIFICATION) {
            val raw = intent.getStringExtra(EXTRA_DATA) ?: return null
            return try {
                val json = JSONObject(raw)
                val out = HashMap<String, String>()
                for (k in json.keys()) out[k] = json.optString(k)
                out
            } catch (e: Exception) {
                null
            }
        }
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
    fun ensureChannel(context: Context, noBadge: Boolean = false) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val id = if (noBadge) CHANNEL + NO_BADGE else CHANNEL
        if (nm.getNotificationChannel(id) != null) return
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        nm.createNotificationChannel(
            NotificationChannel(
                id,
                context.getString(R.string.channel_chats),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                setSound(Settings.System.DEFAULT_NOTIFICATION_URI, attrs)
                if (noBadge) setShowBadge(false)
            },
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
    fun avatarKey(fileId: String?, url: String?): String? {
        if (url.isNullOrEmpty()) return null
        val base = fileId?.takeIf { it.isNotEmpty() } ?: sha1(url)
        return base.replace(Regex("[^A-Za-z0-9_-]"), "_")
    }

    private fun avatarFile(context: Context, key: String): File =
        File(File(context.cacheDir, "chat_avatars").apply { mkdirs() }, "$key.png")

    /** Downloads and keeps the round photo; a missing 256 px preview
     * (`…_w256` 404) falls back to the full picture of a public link. */
    fun cacheAvatar(context: Context, key: String?, url: String?) {
        if (key == null || url.isNullOrEmpty()) return
        val file = avatarFile(context, key)
        if (file.exists()) return
        if (!url.startsWith("https://") && !url.startsWith("http://")) return
        val bytes = download(url) ?: fullPictureOf(url)?.let { download(it) } ?: return
        try {
            val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return
            val round = circle(source)
            val tmp = File(file.parentFile, "${file.name}.tmp")
            FileOutputStream(tmp).use { round.compress(Bitmap.CompressFormat.PNG, 100, it) }
            tmp.renameTo(file)
        } catch (e: Exception) {
            // No photo this time: the letters avatar.
        }
    }

    private fun download(url: String): ByteArray? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 5000
                readTimeout = 5000
                instanceFollowRedirects = true
            }
            if (conn.responseCode !in 200..299) return null
            conn.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_AVATAR_BYTES) return null
                }
                out.toByteArray()
            }
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    /** `…/<file>_w256` → `…/<file>` for an unsigned link (a signature
     * covers the exact path). */
    private fun fullPictureOf(url: String): String? {
        val q = url.indexOf('?')
        if (q >= 0) return null
        val m = Regex("_w\\d+(\\.avif)?$").find(url) ?: return null
        return url.substring(0, m.range.first)
    }

    fun avatarBitmap(context: Context, key: String?): Bitmap? {
        if (key.isNullOrEmpty()) return null
        val file = avatarFile(context, key)
        if (!file.exists()) return null
        return BitmapFactory.decodeFile(file.path)
    }

    private fun avatarIcon(context: Context, key: String?): IconCompat? =
        avatarBitmap(context, key)?.let { IconCompat.createWithBitmap(it) }

    /** The app's letters avatar ("Chris Walker" → "CW"): navy circle,
     * gold-light serif letters — the same as in the chat list. */
    fun initialsBitmap(name: String): Bitmap? {
        val letters = initials(name)
        if (letters.isEmpty()) return null
        val out = Bitmap.createBitmap(AVATAR_PX, AVATAR_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = NAVY }
        canvas.drawOval(RectF(0f, 0f, AVATAR_PX.toFloat(), AVATAR_PX.toFloat()), fill)
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = GOLD_LIGHT
            textSize = AVATAR_PX * 0.38f
            typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }
        val y = AVATAR_PX / 2f - (text.descent() + text.ascent()) / 2f
        canvas.drawText(letters, AVATAR_PX / 2f, y, text)
        return out
    }

    private fun initialsIcon(name: String): IconCompat? =
        initialsBitmap(name)?.let { IconCompat.createWithBitmap(it) }

    /** Same rule as the app's avatarInitials (lib/core/design_system/
     * widgets/display/app_avatar.dart). */
    fun initials(name: String): String {
        val words = name.replace(Regex("[@⁦-⁩]"), " ")
            .split(Regex("[\\s._-]+"))
            .filter { it.isNotEmpty() }
        if (words.isEmpty()) return ""
        val first = words[0].substring(0, words[0].offsetByCodePoints(0, 1))
        val second = if (words.size > 1) words[1].substring(0, words[1].offsetByCodePoints(0, 1)) else ""
        return (first + second).uppercase()
    }

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
