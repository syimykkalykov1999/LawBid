package com.lawbid.lawbid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.concurrent.Executors

/**
 * Owner 2026-10-28 (a locked Samsung kept ringing after the caller hung
 * up): the call pushes are handled natively, at once, in the app process —
 * not only by the Flutter background isolate, which on a cold start comes
 * up seconds later (and never closed the locked phone's call screen).
 * Same FCM broadcast as firebase_messaging's own receiver, which still
 * hands every push to Dart (that path stays: it rings, and ends a call
 * this phone answered).
 *
 *  - `call_ended` (not `ended=1`): stop ringing ([CallRinging.stop]).
 *  - `incoming_call`: watch the call until it stops ringing — the server's
 *    status with the push's ticket, and the ring-timeout alarm.
 *  - the timeout alarm itself ([CallRinging.onTimeout]).
 */
class CallPushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (CallRinging.onTimeout(context, intent)) return
        val extras = intent.extras ?: return
        val data = HashMap<String, String?>()
        for (key in listOf("type", "callId", "ended", "pollToken")) {
            data[key] = extras.getString(key)
        }
        val callId = data["callId"] ?: return
        val action = CallRinging.actionOf(data)
        if (action == CallRinging.PushAction.NONE) return
        val pending = goAsync()
        val app = context.applicationContext
        executor.execute {
            try {
                when (action) {
                    CallRinging.PushAction.STOP -> CallRinging.stop(app, callId)
                    CallRinging.PushAction.WATCH ->
                        CallRinging.watch(app, callId, data["pollToken"])
                    CallRinging.PushAction.NONE -> Unit
                }
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
