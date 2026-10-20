package com.lawbid.lawbid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import io.flutter.plugin.common.MethodChannel

/** The Flutter side of the call, reachable without opening the app. */
object CallBridge {
    var channel: MethodChannel? = null
}

/**
 * "Hang up" in the ongoing-call notification: the call ends silently, the
 * app does not come to the front. If the Dart side is gone (the process was
 * recreated) the app is opened with the action, as a fallback.
 */
class CallHangupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val channel = CallBridge.channel
        if (channel != null) {
            channel.invokeMethod("action", "hangup")
            return
        }
        context.startActivity(
            Intent(context, MainActivity::class.java)
                .setAction(CallForegroundService.ACTION_HANGUP)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
    }
}
