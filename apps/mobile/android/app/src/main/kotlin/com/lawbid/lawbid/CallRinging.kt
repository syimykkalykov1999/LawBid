package com.lawbid.lawbid

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import com.hiennv.flutter_callkit_incoming.CallkitConnection
import com.hiennv.flutter_callkit_incoming.CallkitNotificationService
import com.hiennv.flutter_callkit_incoming.Data
import com.hiennv.flutter_callkit_incoming.FlutterCallkitIncomingPlugin
import com.hiennv.flutter_callkit_incoming.getDataActiveCalls
import com.hiennv.flutter_callkit_incoming.removeCall
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Owner 2026-10-28 (a LOCKED Samsung kept ringing after the caller hung up
 * before it was answered; unlocked it stopped). The ringing screen of a
 * locked phone is the call plugin's full-screen activity, and the plugin
 * closes it with a broadcast addressed to that ACTIVITY class
 * (CallkitIncomingActivity.getIntentEnded: setClassName on a broadcast) —
 * Android delivers an explicit broadcast only to that component, never to
 * the receiver the activity registered at runtime, so the call screen
 * stayed up. Unlocked, the ring is a notification, which the plugin does
 * cancel: that is why only the locked phone kept ringing.
 *
 * Everything here runs in the app process without the Flutter engine and
 * without a session:
 *  - [stop] ends one ringing call: ringtone + vibration, the notification,
 *    the self-managed Telecom call, the plugin's record, and the
 *    full-screen screen (a broadcast WITHOUT a component, which its
 *    runtime receiver does get). A call this phone answered is left alone.
 *  - [watch] (the ring push) asks the server every few seconds whether the
 *    call still rings (`GET /calls/:id/status?t=<ticket of the push>`) and
 *    sets a safety alarm at the server's ring timeout — the ring ends even
 *    when the «stop ringing» push is late or never comes.
 *  - [endAll] (every end of a call) leaves nothing of a call behind: the
 *    Telecom call (Samsung's «call in progress» pill), the plugin's
 *    ongoing-call service and its screen.
 */
object CallRinging {
    /** M2 (2026-10-28): one ring length everywhere — the server's
     * `ringSeconds` (common/calls/ring.ts); 60 s from an older server. */
    const val RING_DEFAULT_MS = 60_000L

    /** The ring length a push names (10…120 s), else [RING_DEFAULT_MS]. */
    fun ringMsOf(data: Map<String, String?>): Long {
        val s = data["ringSeconds"]?.toLongOrNull() ?: return RING_DEFAULT_MS
        return if (s in 10L..120L) s * 1000 else RING_DEFAULT_MS
    }
    private const val FIRST_POLL_MS = 2_000L
    /** D1-19 (13.11): the waits between asks — 5, 8, then every 13 s
     * (was every 3 s, ~20 asks a minute per rung phone). The «call ended»
     * push and the timeout alarm already end the ring; the ask is only the
     * fallback, so a slower ask changes nothing the person sees. */
    private val POLL_BACKOFF_MS = longArrayOf(5_000L, 8_000L, 13_000L)

    /** The wait before ask number [n] (0-based) after the first one. */
    fun pollDelayMs(n: Int): Long = POLL_BACKOFF_MS[minOf(n, POLL_BACKOFF_MS.size - 1)]
    private const val ACTION_TIMEOUT = "com.lawbid.lawbid.CALL_RING_TIMEOUT"
    private const val EXTRA_CALL = "callId"
    /** CallkitIncomingActivity's own action (its runtime receiver). */
    private const val ACTIVITY_ENDED =
        "com.hiennv.flutter_callkit_incoming.ACTION_ENDED_CALL_INCOMING"
    /** Shared with Dart (shared_preferences keys carry «flutter.»). */
    private const val FLUTTER_PREFS = "FlutterSharedPreferences"
    const val ENDED_PREFIX = "flutter.call.ended."

    private val pollers = ConcurrentHashMap<String, Boolean>()
    private val executor = Executors.newCachedThreadPool()

    /** What the push says to do. Pure, so it is easy to read and test. */
    enum class PushAction { STOP, WATCH, NONE }

    fun actionOf(data: Map<String, String?>): PushAction {
        val callId = data["callId"]
        if (callId.isNullOrEmpty()) return PushAction.NONE
        return when (data["type"]) {
            // «ended=1» is the end of an ANSWERED call: the app's own
            // controller closes that one (it may be this phone's call).
            "call_ended" -> if (data["ended"] == "1") PushAction.NONE else PushAction.STOP
            "incoming_call" -> PushAction.WATCH
            else -> PushAction.NONE
        }
    }

    /** The plugin's record of [callId] on this phone, or null. */
    private fun record(context: Context, callId: String): Data? = try {
        getDataActiveCalls(context).firstOrNull { it.id == callId }
    } catch (e: Exception) {
        null
    }

    /** The call stopped ringing (cancelled, missed, answered elsewhere). */
    fun stop(context: Context, callId: String) {
        val app = context.applicationContext
        val rec = record(app, callId)
        // Answered on this phone: the app's call controller owns it now.
        if (rec?.isAccepted == true) return
        markEnded(app, callId)
        pollers.remove(callId)
        cancelTimeout(app, callId)
        val plugin = try {
            FlutterCallkitIncomingPlugin.getInstance()
        } catch (e: Exception) {
            null
        }
        try {
            plugin?.getCallkitSoundPlayerManager()?.stop()
        } catch (e: Exception) {
        }
        if (rec != null) {
            try {
                plugin?.getCallkitNotificationManager()
                    ?.clearIncomingNotification(rec.toBundle(), false)
            } catch (e: Exception) {
            }
        }
        // The plugin's notification id (works with no plugin instance too).
        try {
            app.getSystemService(NotificationManager::class.java)?.cancel(callId.hashCode())
        } catch (e: Exception) {
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                CallkitConnection.find(callId)?.markMissed()
            } catch (e: Exception) {
            }
        }
        if (rec != null) {
            try {
                removeCall(app, rec)
            } catch (e: Exception) {
            }
        }
        closeRingingScreen(app)
    }

    /**
     * R-373 (owner 2026-11-04: Samsung showed «Аудиозвонок LawBid» with no
     * call, and every reel stood on its first frame): Dart says no call of
     * ours runs, yet a self-managed Telecom call of ours may still be up —
     * one whose plugin record is already gone, so no end ever reaches it.
     * While it lives the phone is «in a call»: the media apps get no audio
     * focus. Ends every such connection that is past ringing and has no
     * plugin record (a ringing call, or one answered on the system screen
     * that Dart has not picked up yet, always has its record), and stops the
     * plugin's ongoing-call service. Returns how many it ended.
     *
     * The plugin (MIT, flutter_callkit_incoming 3.1.6) keeps its connections
     * in a private map with no list call; it is read by reflection and any
     * failure ends nothing.
     */
    fun endOrphans(context: Context): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return 0
        val app = context.applicationContext
        val known = try {
            getDataActiveCalls(app).map { it.id }.toSet()
        } catch (e: Exception) {
            return 0
        }
        val all = try {
            val f = CallkitConnection::class.java.getDeclaredField("activeConnections")
            f.isAccessible = true
            (f.get(null) as? Map<*, *>)?.values?.filterIsInstance<CallkitConnection>()
        } catch (e: Exception) {
            null
        } ?: return 0
        var ended = 0
        for (conn in all) {
            val live = conn.state == android.telecom.Connection.STATE_ACTIVE ||
                conn.state == android.telecom.Connection.STATE_HOLDING ||
                conn.state == android.telecom.Connection.STATE_DIALING
            if (!live || conn.callId in known) continue
            try {
                conn.markEnded()
                ended++
            } catch (e: Exception) {
            }
        }
        if (ended > 0) {
            try {
                CallkitNotificationService.stopService(app)
            } catch (e: Exception) {
            }
        }
        return ended
    }

    /** Every end of a call (Dart `lawbid/call_service` endCall / clear). */
    fun endAll(context: Context, ids: Collection<String>) {
        val app = context.applicationContext
        for (id in ids) {
            pollers.remove(id)
            cancelTimeout(app, id)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    CallkitConnection.find(id)?.markEnded()
                } catch (e: Exception) {
                }
            }
        }
        try {
            FlutterCallkitIncomingPlugin.getInstance()?.getCallkitSoundPlayerManager()?.stop()
        } catch (e: Exception) {
        }
        // The plugin's ongoing-call foreground service (started when a call
        // is accepted on its screen) — while it runs, its notification
        // cannot be cleared and the phone shows a call in progress.
        try {
            CallkitNotificationService.stopService(app)
        } catch (e: Exception) {
        }
        closeRingingScreen(app)
    }

    /** Closes the plugin's full-screen ringing activity, if it is up. */
    fun closeRingingScreen(context: Context) {
        try {
            context.sendBroadcast(
                Intent("${context.packageName}.$ACTIVITY_ENDED")
                    .setPackage(context.packageName)
                    .putExtra("ACCEPTED", false),
            )
        } catch (e: Exception) {
        }
    }

    /** A ring push arrived: watch the call until it stops ringing. */
    fun watch(
        context: Context,
        callId: String,
        pollToken: String?,
        ringMs: Long = RING_DEFAULT_MS,
    ) {
        val app = context.applicationContext
        armTimeout(app, callId, ringMs)
        if (pollToken.isNullOrEmpty()) return
        val api = ChatNotifications.pushActions(app)?.first ?: return
        if (pollers.putIfAbsent(callId, true) != null) return
        val started = SystemClock.elapsedRealtime()
        executor.execute {
            try {
                Thread.sleep(FIRST_POLL_MS)
                var asked = 0
                while (pollers.containsKey(callId) &&
                    SystemClock.elapsedRealtime() - started < ringMs
                ) {
                    // Answered here: the app takes over.
                    if (record(app, callId)?.isAccepted == true) break
                    when (val state = askState(api, callId, pollToken)) {
                        // No answer (network): ask again.
                        null, "ringing" -> Unit
                        // An expired / refused ticket, or the server's
                        // limit (429): the alarm and the push remain.
                        REFUSED -> break
                        else -> {
                            stop(app, callId)
                            break
                        }
                    }
                    Thread.sleep(pollDelayMs(asked++))
                }
            } catch (e: Exception) {
                // Never crash the app over a ring.
            } finally {
                pollers.remove(callId)
            }
        }
    }

    private const val REFUSED = "refused"

    /** "ringing" / "active" / "ended", [REFUSED], or null (no answer). */
    private fun askState(api: String, callId: String, token: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            val url = "$api/calls/$callId/status?t=" +
                java.net.URLEncoder.encode(token, "UTF-8")
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4000
                readTimeout = 4000
            }
            val code = conn.responseCode
            // A call the server no longer knows does not ring.
            if (code == 404) return "ended"
            if (code == 400 || code == 401 || code == 403) return REFUSED
            // D1-19: over the server's limit — stop asking (was: ask again
            // every 3 s, hammering the address's bucket).
            if (code == 429) return REFUSED
            if (code !in 200..299) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            stateOf(body)
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    /** The API answers `{ "data": { "state": … } }`. */
    fun stateOf(body: String): String? = try {
        val json = JSONObject(body)
        val data = json.optJSONObject("data") ?: json
        data.optString("state").ifEmpty { null }
    } catch (e: Exception) {
        null
    }

    /** Dart's showLawbidIncoming checks it: a late ring is not shown. */
    private fun markEnded(context: Context, callId: String) {
        try {
            context.getSharedPreferences(FLUTTER_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(ENDED_PREFIX + callId, System.currentTimeMillis())
                .apply()
        } catch (e: Exception) {
        }
    }

    private fun timeoutIntent(context: Context, callId: String, create: Boolean): PendingIntent? {
        val intent = Intent(context, CallPushReceiver::class.java)
            .setAction(ACTION_TIMEOUT)
            .putExtra(EXTRA_CALL, callId)
        val flags = PendingIntent.FLAG_IMMUTABLE or
            (if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE)
        return PendingIntent.getBroadcast(context, callId.hashCode(), intent, flags)
    }

    /** The safety net: at the server's ring timeout the ring ends anyway. */
    private fun armTimeout(context: Context, callId: String, ringMs: Long) {
        try {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            val pi = timeoutIntent(context, callId, true) ?: return
            // Inexact is enough: the phone is awake while it rings.
            am.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + ringMs,
                pi,
            )
        } catch (e: Exception) {
        }
    }

    private fun cancelTimeout(context: Context, callId: String) {
        try {
            val pi = timeoutIntent(context, callId, false) ?: return
            context.getSystemService(AlarmManager::class.java)?.cancel(pi)
            pi.cancel()
        } catch (e: Exception) {
        }
    }

    /** CallPushReceiver: the timeout alarm went off. */
    fun onTimeout(context: Context, intent: Intent): Boolean {
        if (intent.action != ACTION_TIMEOUT) return false
        val callId = intent.getStringExtra(EXTRA_CALL) ?: return true
        stop(context, callId)
        return true
    }
}
