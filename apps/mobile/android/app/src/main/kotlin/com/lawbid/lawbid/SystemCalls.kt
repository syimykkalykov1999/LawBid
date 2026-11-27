package com.lawbid.lawbid

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallControlScope
import androidx.core.telecom.CallEndpointCompat
import androidx.core.telecom.CallsManager
import com.hiennv.flutter_callkit_incoming.CallkitConnection
import com.hiennv.flutter_callkit_incoming.CallkitIncomingBroadcastReceiver
import com.hiennv.flutter_callkit_incoming.getDataActiveCalls
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Owner 26.11: LawBid calls on Android are real system calls, like WhatsApp
 * and Telegram — a Bluetooth headset's button, a car kit, a watch answer and
 * hang up, the phone knows a call is on, a cellular call holds ours through
 * Telecom. Behind the `calls_android_telecom` switch (Dart writes it here,
 * [setEnabled]; the native ring path reads it before Dart is up).
 *
 * Two parts, the ring and the talk:
 *
 *  - **Ringing** stays with flutter_callkit_incoming (MIT): its
 *    self-managed `CallkitConnection` already rings through Telecom from the
 *    FCM path (locked / killed phone, full-screen intent). The plugin answers
 *    Telecom's `onAnswer` / `onReject` by changing the connection's state
 *    only, so the app never heard a headset's or a car's answer. [watchRing]
 *    looks at that connection while it rings and turns a system answer into
 *    the plugin's own «Accept» and a system reject into its «Decline» (the
 *    same broadcasts its notification buttons send), see
 *    [SystemCallRules.ringVerdict].
 *
 *  - **The call itself** (answered, and outgoing from the first ring) is
 *    added to Telecom with Jetpack Core-Telecom `CallsManager`
 *    (androidx.core:core-telecom, Apache-2.0), hosted in
 *    [CallForegroundService] (phoneCall foreground service + CallStyle
 *    notification), as developer.android.com «Telecom → Core-Telecom»
 *    shows. Telecom's requests come back to Dart as the ongoing-call
 *    notification's `action` events: `onDisconnect` → «hangup»,
 *    `onSetInactive` / `onSetActive` → «hold» / «unhold» (through the one
 *    [SystemCallRules.HoldGate] the audio-mode watcher uses too), the
 *    system's mute → «mute» / «unmute». The app reports back: active when
 *    connected, the speaker / headset choice ([route]), the end with its
 *    cause ([end]).
 *
 * Every step is wrapped: a phone whose Telecom refuses runs the call exactly
 * as before (the foreground service and [CallHoldWatcher] alone).
 */
object SystemCalls {
    private const val TAG = "LawbidSystemCalls"
    private const val PREFS = "lawbid_system_calls"
    private const val KEY_ON = "on"
    private const val RING_POLL_MS = 250L
    private const val RING_MAX_MS = 120_000L

    private val main = Handler(Looper.getMainLooper())

    /** One voice for hold / unhold (audio-mode watcher + Telecom). */
    val hold = SystemCallRules.HoldGate()

    fun enabled(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            context.applicationContext
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_ON, false)

    fun setEnabled(context: Context, on: Boolean) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ON, on)
            .apply()
    }

    // --- The call itself (Core-Telecom) ------------------------------------

    private class Session(val id: String, val outgoing: Boolean) {
        var job: Job? = null
        var control: CallControlScope? = null
        var active = false
        var endingByApp = false
        var lastMuted: Boolean? = null
    }

    private var manager: CallsManager? = null
    private var session: Session? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private fun send(action: String) {
        main.post {
            try {
                CallBridge.channel?.invokeMethod("action", action)
            } catch (e: Exception) {
                // No Dart side right now.
            }
        }
    }

    /** Hold from [source] on / off; Dart hears the change once. */
    fun setHold(source: String, on: Boolean) {
        val action = hold.set(source, on) ?: return
        send(action)
    }

    private fun managerOf(context: Context): CallsManager? {
        manager?.let { return it }
        return try {
            CallsManager(context.applicationContext).also {
                it.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
                manager = it
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Telecom registration refused: $e")
            null
        }
    }

    /** True while Telecom holds a LawBid call (Core-Telecom session). */
    fun inCall(): Boolean = session?.control != null

    /**
     * The call screen's call starts (or updates): [connected] once the media
     * is up. Called by [CallForegroundService] on every update.
     */
    fun begin(
        context: Context,
        id: String,
        name: String,
        outgoing: Boolean,
        connected: Boolean,
    ) {
        if (id.isEmpty() || !enabled(context)) return
        val now = session
        if (now != null && now.id == id) {
            if (connected) markActive(now)
            return
        }
        if (now != null) end("canceled")
        // The plugin's ringing Telecom call of this id is over: the app took
        // it (two calls of ours in Telecom would hold each other).
        forgetRing(id)
        try {
            CallkitConnection.find(id)?.markEnded()
        } catch (e: Throwable) {
        }
        val calls = managerOf(context) ?: return
        val s = Session(id, outgoing)
        session = s
        hold.reset()
        val attributes = CallAttributesCompat(
            displayName = name.ifEmpty { "LawBid" },
            address = Uri.fromParts("lawbid", id, null),
            direction = if (outgoing) {
                CallAttributesCompat.DIRECTION_OUTGOING
            } else {
                CallAttributesCompat.DIRECTION_INCOMING
            },
            callType = CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
            callCapabilities = CallAttributesCompat.SUPPORTS_SET_INACTIVE,
        )
        s.job = scope.launch {
            try {
                calls.addCall(
                    attributes,
                    onAnswer = { _ -> /* answered in the app already */ },
                    onDisconnect = { cause ->
                        Log.d(TAG, "Telecom disconnect ${cause.code} byApp=${s.endingByApp}")
                        if (!s.endingByApp) send("hangup")
                    },
                    onSetActive = {
                        s.active = true
                        setHold(SystemCallRules.HOLD_TELECOM, false)
                    },
                    onSetInactive = {
                        s.active = false
                        setHold(SystemCallRules.HOLD_TELECOM, true)
                    },
                ) {
                    s.control = this
                    if (session !== s) {
                        launch { disconnect(DisconnectCause(DisconnectCause.CANCELED)) }
                        return@addCall
                    }
                    if (!outgoing) {
                        // Answered on our ringing screen: the call is on.
                        launch {
                            if (answer(CallAttributesCompat.CALL_TYPE_AUDIO_CALL) is
                                androidx.core.telecom.CallControlResult.Success
                            ) {
                                s.active = true
                            }
                        }
                    } else if (connected) {
                        markActive(s)
                    }
                    launch {
                        isMuted.collect { muted ->
                            val action = SystemCallRules.muteAction(s.lastMuted, muted)
                            s.lastMuted = muted
                            if (action != null) send(action)
                        }
                    }
                }
            } catch (e: Throwable) {
                Log.w(TAG, "Telecom call not added: $e")
            } finally {
                if (session === s) session = null
                hold.set(SystemCallRules.HOLD_TELECOM, false)?.let { send(it) }
            }
        }
    }

    private fun markActive(s: Session) {
        if (s.active) return
        val control = s.control ?: return
        scope.launch {
            if (control.setActive() is androidx.core.telecom.CallControlResult.Success) {
                s.active = true
            }
        }
    }

    /**
     * The cellular call that held ours is over ([CallHoldWatcher]):
     * self-managed calls resume themselves (Telecom never unholds them).
     */
    fun resume() {
        val s = session ?: return
        if (!hold.holds(SystemCallRules.HOLD_TELECOM)) return
        val control = s.control ?: return
        scope.launch {
            if (control.setActive() is androidx.core.telecom.CallControlResult.Success) {
                s.active = true
                setHold(SystemCallRules.HOLD_TELECOM, false)
            }
        }
    }

    /** The app chose where the sound goes (Dart `CallAudioKind` name). */
    fun route(kind: String) {
        val control = session?.control ?: return
        val type = when (kind) {
            "speaker" -> CallEndpointCompat.TYPE_SPEAKER
            "bluetooth" -> CallEndpointCompat.TYPE_BLUETOOTH
            "wired" -> CallEndpointCompat.TYPE_WIRED_HEADSET
            "phone" -> CallEndpointCompat.TYPE_EARPIECE
            else -> return
        }
        scope.launch {
            try {
                val target = control.availableEndpoints.first().firstOrNull { it.type == type }
                    ?: return@launch
                control.requestEndpointChange(target)
            } catch (e: Throwable) {
                Log.w(TAG, "endpoint change refused: $e")
            }
        }
    }

    /** The call is over here; [cause] = the Dart `CallStatus` name. */
    fun end(cause: String?) {
        val s = session ?: return
        session = null
        s.endingByApp = true
        val control = s.control
        if (control == null) {
            s.job?.cancel()
        } else {
            scope.launch {
                try {
                    control.disconnect(DisconnectCause(SystemCallRules.disconnectCode(cause)))
                } catch (e: Throwable) {
                    s.job?.cancel()
                }
            }
        }
        hold.reset()
    }

    // --- The ring (flutter_callkit_incoming's Telecom call) ----------------

    private val rings = HashMap<String, Runnable>()
    private val endedByApp = HashSet<String>()

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    /** The app itself ends this ring: never read it as the system's. */
    fun forgetRing(id: String) {
        onMain {
            endedByApp.add(id)
            rings.remove(id)?.let { main.removeCallbacks(it) }
        }
    }

    fun forgetAllRings() {
        onMain {
            endedByApp.addAll(rings.keys)
            for (r in rings.values) main.removeCallbacks(r)
            rings.clear()
        }
    }

    /** A call rings here (FCM push or the open app): watch its Telecom call. */
    fun watchRing(context: Context, id: String, ringMs: Long) {
        if (id.isEmpty() || !enabled(context)) return
        val app = context.applicationContext
        main.post {
            if (rings.containsKey(id)) return@post
            endedByApp.remove(id)
            val until = System.currentTimeMillis() + minOf(ringMs, RING_MAX_MS) + 5_000L
            var last: CallkitConnection? = null
            val poll = object : Runnable {
                override fun run() {
                    if (rings[id] !== this) return
                    val conn = try {
                        CallkitConnection.find(id)
                    } catch (e: Throwable) {
                        null
                    }
                    if (conn != null) last = conn
                    val record = try {
                        getDataActiveCalls(app).firstOrNull { it.id == id }
                    } catch (e: Throwable) {
                        null
                    }
                    val verdict = SystemCallRules.ringVerdict(
                        live = conn != null,
                        state = conn?.state ?: SystemCallRules.STATE_DISCONNECTED,
                        seen = last != null,
                        cause = last?.disconnectCause?.code,
                        recordPresent = record != null,
                        recordAccepted = record?.isAccepted == true,
                        appEnded = endedByApp.contains(id),
                    )
                    when (verdict) {
                        SystemCallRules.RingVerdict.WAIT -> {
                            if (System.currentTimeMillis() < until) {
                                main.postDelayed(this, RING_POLL_MS)
                            } else {
                                rings.remove(id)
                            }
                        }
                        SystemCallRules.RingVerdict.OVER -> rings.remove(id)
                        SystemCallRules.RingVerdict.SYSTEM_ANSWERED -> {
                            rings.remove(id)
                            systemAnswered(app, id, record!!.toBundle())
                        }
                        SystemCallRules.RingVerdict.SYSTEM_DECLINED -> {
                            rings.remove(id)
                            Log.d(TAG, "ring $id declined by the system")
                            app.sendBroadcast(
                                CallkitIncomingBroadcastReceiver.getIntentDecline(app, record!!.toBundle()),
                            )
                            CallRinging.closeRingingScreen(app)
                        }
                    }
                }
            }
            rings[id] = poll
            main.post(poll)
        }
    }

    /**
     * Telecom answered the ring (headset button, car, watch). The call's
     * media runs in the app's Flutter engine: with the engine up the
     * plugin's own «Accept» runs (the call screen, the server, the ongoing
     * notification). With no engine (app killed) the ring goes on as
     * before — the person answers on the screen.
     */
    private fun systemAnswered(app: Context, id: String, data: android.os.Bundle) {
        if (CallBridge.channel == null) {
            Log.d(TAG, "ring $id answered by the system, no app engine: keeps ringing")
            return
        }
        Log.d(TAG, "ring $id answered by the system")
        app.sendBroadcast(CallkitIncomingBroadcastReceiver.getIntentAccept(app, data))
        CallRinging.closeRingingScreen(app)
    }
}
