package com.lawbid.lawbid

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingReceiver

/**
 * Row 136 (13.11): firebase_messaging's own receiver, with one filter.
 * For every data push that arrives while the app is not in front, the
 * plugin starts a background Flutter engine (a whole Dart isolate) just to
 * run `lawbidBackgroundMessage`. A chat message (`style=chat`) or a
 * notification with a person (`style=actor`) is drawn natively by
 * [ChatPushReceiver] / [ChatNotifications], and the Dart handler does
 * nothing with it — so that engine (CPU, RAM, battery on every message)
 * was pure waste. Such a push now skips the plugin while the app is in the
 * background; in front the plugin still gets it (Dart refreshes the
 * badge), and every other push (calls, planner reminders, pushes with a
 * notification part) goes to the plugin exactly as before.
 *
 * Registered in AndroidManifest.xml in place of the plugin's receiver
 * (tools:node="remove"). [isApplicationForeground] is the plugin's own check
 * (FlutterFirebaseMessagingUtils, firebase_messaging 17.0.1, BSD-3-Clause),
 * which is package-private there.
 */
class FlutterPushReceiver : FlutterFirebaseMessagingReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras
        if (extras != null && drawnNatively(extras) && !isApplicationForeground(context)) return
        super.onReceive(context, intent)
    }

    companion object {
        /** Pushes the Dart background handler does something with. */
        private val DART_TYPES = setOf("incoming_call", "call_ended", "task_reminder")

        /** A data-only chat / person push, drawn by ChatPushReceiver. */
        fun drawnNatively(extras: Bundle): Boolean {
            val type = extras.getString("type")
            if (type != null && type in DART_TYPES) return false
            val style = extras.getString("style")
            val chat = type == "new_message" && style == "chat"
            val actor = type != "new_message" && style == "actor"
            if (!chat && !actor) return false
            // A push with a notification part (FCM's `gcm.n.*` /
            // `gcm.notification.*` keys) is kept by the plugin for the tap.
            return extras.keySet().none {
                it.startsWith("gcm.n.") || it.startsWith("gcm.notification.")
            }
        }

        /** FlutterFirebaseMessagingUtils.isApplicationForeground, as is. */
        fun isApplicationForeground(context: Context): Boolean {
            val keyguardManager =
                context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager?
            if (keyguardManager != null && keyguardManager.isKeyguardLocked) {
                return false
            }
            val activityManager =
                context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager?
                    ?: return false
            val appProcesses = activityManager.runningAppProcesses ?: return false
            val packageName = context.packageName
            for (appProcess in appProcesses) {
                if (appProcess.importance ==
                    ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND &&
                    appProcess.processName == packageName
                ) {
                    return true
                }
            }
            return false
        }
    }
}
