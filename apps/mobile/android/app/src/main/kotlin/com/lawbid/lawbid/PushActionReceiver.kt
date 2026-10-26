package com.lawbid.lawbid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Owner 2026-10-26 (WhatsApp): «Ответить» / «Прочитано» pressed on a chat
 * notification. Works with the app closed: posts the push's signed ticket,
 * this device's push token and the text to `POST /push-actions` (the server
 * accepts it only while this device is signed in to that account). A sent
 * reply joins the notification as «Вы: …»; «Прочитано» takes the
 * notification away at once (the server marks the chat read).
 */
class PushActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val conversation = intent.getStringExtra(EXTRA_CONVERSATION) ?: return
        val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
        val messageId = intent.getStringExtra(EXTRA_MESSAGE).orEmpty()
        val app = context.applicationContext
        val (api, device) = ChatNotifications.pushActions(app) ?: return
        val body = JSONObject()
            .put("token", token)
            .put("fcmToken", device)
        val reply: String?
        when (intent.action) {
            ACTION_READ -> {
                reply = null
                body.put("action", "read")
                if (messageId.isNotEmpty()) body.put("messageId", messageId)
                // WhatsApp: the notification goes at once.
                ChatNotifications.clear(app, conversation)
            }
            ACTION_REPLY -> {
                reply = RemoteInput.getResultsFromIntent(intent)
                    ?.getCharSequence(KEY_TEXT)?.toString()?.trim()
                if (reply.isNullOrEmpty()) return
                body.put("action", "reply")
                    .put("text", reply)
                    .put("clientMessageId", UUID.randomUUID().toString())
                if (messageId.isNotEmpty()) body.put("messageId", messageId)
            }
            else -> return
        }
        val pending = goAsync()
        executor.execute {
            try {
                val ok = post("$api/push-actions", body.toString())
                if (reply != null) {
                    ChatNotifications.addOwnReply(app, conversation, reply, failed = !ok)
                }
            } catch (e: Exception) {
                // A broken button must never crash the app.
            } finally {
                pending.finish()
            }
        }
    }

    private fun post(url: String, json: String): Boolean {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8000
                readTimeout = 8000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            conn.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            conn.responseCode in 200..299
        } catch (e: Exception) {
            false
        } finally {
            conn?.disconnect()
        }
    }

    companion object {
        const val ACTION_REPLY = "com.lawbid.lawbid.PUSH_REPLY"
        const val ACTION_READ = "com.lawbid.lawbid.PUSH_READ"
        const val KEY_TEXT = "reply_text"
        const val EXTRA_CONVERSATION = "conversationId"
        const val EXTRA_TOKEN = "actionToken"
        const val EXTRA_MESSAGE = "messageId"
        const val EXTRA_GROUP = "isGroup"
        private val executor = Executors.newSingleThreadExecutor()
    }
}
