package com.lawbid.lawbid

import android.telecom.DisconnectCause

/**
 * Owner 26.11 (Android calls as real system calls, like WhatsApp /
 * Telegram): the decisions of [SystemCalls], kept free of Android state so
 * they run as plain JVM unit tests (`app/src/test`).
 */
object SystemCallRules {
    /** The `DisconnectCause` code Telecom gets for the call's outcome
     * (the Dart `CallStatus` name the app ended the call with). */
    fun disconnectCode(cause: String?): Int = when (cause) {
        "declined" -> DisconnectCause.REJECTED
        "missed" -> DisconnectCause.MISSED
        "busy" -> DisconnectCause.BUSY
        "canceled" -> DisconnectCause.CANCELED
        "failed" -> DisconnectCause.ERROR
        "remote" -> DisconnectCause.REMOTE
        else -> DisconnectCause.LOCAL
    }

    /** What a look at the plugin's ringing Telecom call tells. */
    enum class RingVerdict { WAIT, SYSTEM_ANSWERED, SYSTEM_DECLINED, OVER }

    /**
     * The plugin's ringing `CallkitConnection` (flutter_callkit_incoming,
     * MIT) is answered / rejected by Telecom for a Bluetooth headset, a car
     * kit or a watch, but the plugin only flips the connection's state and
     * tells nobody. Seen from outside:
     *  - [live] the connection is still in the plugin's table; [state] its
     *    `Connection.getState()`.
     *  - [cause] the `DisconnectCause` code it ended with (it is gone).
     *  - [recordPresent] / [recordAccepted]: the plugin's own call record
     *    (`ACTIVE_CALLS`). Every app path (the notification's buttons, the
     *    app's own end / decline, a timeout) changes the record in the same
     *    main-thread step that changes the connection; only Telecom's own
     *    `onAnswer` / `onReject` / `onDisconnect` leave the record behind.
     *  - [appEnded]: the app ended this ring itself ([SystemCalls.forgetRing]).
     */
    fun ringVerdict(
        live: Boolean,
        state: Int,
        seen: Boolean,
        cause: Int?,
        recordPresent: Boolean,
        recordAccepted: Boolean,
        appEnded: Boolean,
    ): RingVerdict {
        if (appEnded) return RingVerdict.OVER
        if (live) {
            if (state == STATE_ACTIVE) {
                return if (recordPresent && !recordAccepted) {
                    RingVerdict.SYSTEM_ANSWERED
                } else {
                    RingVerdict.OVER
                }
            }
            if (state == STATE_HOLDING) return RingVerdict.OVER
            return RingVerdict.WAIT
        }
        if (!seen) return RingVerdict.WAIT
        val declined = cause == DisconnectCause.REJECTED || cause == DisconnectCause.LOCAL
        return if (declined && recordPresent && !recordAccepted) {
            RingVerdict.SYSTEM_DECLINED
        } else {
            RingVerdict.OVER
        }
    }

    // android.telecom.Connection.STATE_* (stable public constants).
    const val STATE_RINGING = 2
    const val STATE_ACTIVE = 4
    const val STATE_HOLDING = 5
    const val STATE_DISCONNECTED = 6

    /**
     * Row 216 hold, one voice for two watchers: the audio-mode watcher
     * ([CallHoldWatcher], a cellular call took the audio) and Telecom
     * (`onSetInactive` / `onSetActive`). Dart hears «hold» when the first
     * holder comes and «unhold» when the last one goes — never twice.
     */
    class HoldGate {
        private val by = mutableSetOf<String>()

        val held: Boolean get() = by.isNotEmpty()

        fun holds(source: String): Boolean = source in by

        /** Returns "hold" / "unhold" when Dart must hear it, else null. */
        fun set(source: String, on: Boolean): String? {
            val was = held
            if (on) by.add(source) else by.remove(source)
            return when {
                !was && held -> "hold"
                was && !held -> "unhold"
                else -> null
            }
        }

        fun reset() = by.clear()
    }

    const val HOLD_AUDIO = "audio"
    const val HOLD_TELECOM = "telecom"

    /** Our own mute and the system's (car / watch / headset) agree: only a
     * change made by the system is passed on, and only once. */
    fun muteAction(last: Boolean?, now: Boolean): String? = when {
        last == null -> null // the first value is the call's start state
        last == now -> null
        now -> "mute"
        else -> "unmute"
    }
}
