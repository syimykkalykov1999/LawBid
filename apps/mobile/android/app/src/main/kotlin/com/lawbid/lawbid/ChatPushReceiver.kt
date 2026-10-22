package com.lawbid.lawbid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.concurrent.Executors

/**
 * Owner 2026-10-22 (message pushes like WhatsApp): a chat message arrives
 * data-only (the server sends it so to apps that register `chatStyle`), and
 * this draws it — ChatNotifications builds the MessagingStyle notification
 * with the sender's photo. It listens to the same FCM broadcast as the
 * firebase_messaging plugin's own receiver (which still hands the message to
 * Dart for the badge); everything that is not a chat push is left alone.
 */
class ChatPushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        if (extras.getString("type") != "new_message" ||
            extras.getString("style") != "chat"
        ) {
            return
        }
        val data = HashMap<String, String>()
        for (key in extras.keySet()) {
            if (key.startsWith("google.") || key.startsWith("gcm.")) continue
            val value = extras.getString(key)
            if (value != null) data[key] = value
        }
        // The photo is downloaded off the main thread; the broadcast stays
        // alive until the notification is posted.
        val pending = goAsync()
        val app = context.applicationContext
        executor.execute {
            try {
                ChatNotifications.show(app, data)
            } catch (e: Exception) {
                // A broken push must never crash the app.
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        private val executor = Executors.newSingleThreadExecutor()
    }
}
