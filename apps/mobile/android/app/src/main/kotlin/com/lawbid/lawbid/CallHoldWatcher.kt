package com.lawbid.lawbid

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Row 216 (owner 17.11, «like WhatsApp»): a cellular call during a LawBid
 * call holds ours instead of breaking it, and gives it back when it ends.
 *
 * Android's Telecom puts the phone's audio in [AudioManager.MODE_IN_CALL]
 * for a cellular call (MODE_RINGTONE while it only rings, MODE_NORMAL when
 * it is over); our call runs in MODE_IN_COMMUNICATION. The audio mode is
 * read without any permission (no READ_PHONE_STATE) and without taking
 * the audio focus from WebRTC: `OnModeChangedListener` on Android 12+, a
 * one-second look on Android 8–11. While the cellular call is up Dart
 * hears «hold» (mic off, the link stays, the other phone reads «On hold»);
 * when it is over, «unhold», and the call's own mode comes back — Telecom
 * left the phone in MODE_NORMAL, where the earpiece and echo cancellation
 * of our call would be off. A cellular call that only rang and was
 * declined also leaves MODE_NORMAL: the mode is put back, nothing is held.
 *
 * Runs only while [CallForegroundService] runs (one call at a time).
 *
 * Owner 26.11: with the call in Telecom ([SystemCalls], Core-Telecom)
 * Telecom holds it too (`onSetInactive`). Both speak through one gate
 * ([SystemCalls.setHold]): Dart hears «hold» once and «unhold» once. When
 * the cellular call is over, Telecom does not give a self-managed call back
 * by itself: [SystemCalls.resume] sets it active again, and Telecom (not
 * this watcher) puts the audio mode back.
 */
class CallHoldWatcher(private val context: Context) {
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    private val main = Handler(Looper.getMainLooper())
    private var held = false
    private var cellular = false
    private var running = false
    private var listener: Any? = null

    private val poll = object : Runnable {
        override fun run() {
            if (!running) return
            onMode(audio?.mode ?: return)
            main.postDelayed(this, POLL_MS)
        }
    }

    fun start() {
        if (running || audio == null) return
        running = true
        if (Build.VERSION.SDK_INT >= 31) {
            val l = AudioManager.OnModeChangedListener { mode -> main.post { onMode(mode) } }
            try {
                audio.addOnModeChangedListener(context.mainExecutor, l)
                listener = l
            } catch (e: Exception) {
                main.post(poll)
            }
        } else {
            main.post(poll)
        }
    }

    fun stop() {
        running = false
        main.removeCallbacks(poll)
        if (Build.VERSION.SDK_INT >= 31) {
            val l = listener as? AudioManager.OnModeChangedListener
            if (l != null) {
                try {
                    audio?.removeOnModeChangedListener(l)
                } catch (e: Exception) {
                    // Not registered.
                }
            }
        }
        listener = null
        // The call is over: the gate forgets this watcher's hold silently
        // (as before, no «unhold» after the end).
        SystemCalls.hold.set(SystemCallRules.HOLD_AUDIO, false)
        held = false
        cellular = false
    }

    private fun onMode(mode: Int) {
        if (!running) return
        when (mode) {
            AudioManager.MODE_IN_CALL -> {
                cellular = true
                if (!held) {
                    held = true
                    SystemCalls.setHold(SystemCallRules.HOLD_AUDIO, true)
                }
            }
            AudioManager.MODE_RINGTONE -> cellular = true
            else -> {
                if (!cellular) return
                cellular = false
                if (SystemCalls.inCall()) {
                    SystemCalls.resume()
                } else if (mode != AudioManager.MODE_IN_COMMUNICATION) {
                    try {
                        audio?.mode = AudioManager.MODE_IN_COMMUNICATION
                    } catch (e: Exception) {
                        // The system keeps its mode.
                    }
                }
                if (held) {
                    held = false
                    SystemCalls.setHold(SystemCallRules.HOLD_AUDIO, false)
                }
            }
        }
    }

    companion object {
        private const val POLL_MS = 1000L
    }
}
