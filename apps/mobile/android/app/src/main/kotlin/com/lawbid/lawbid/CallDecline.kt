package com.lawbid.lawbid

import android.content.Context
import android.os.Bundle
import com.hiennv.flutter_callkit_incoming.CallkitConstants
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Owner 2026-11-08 (iPhone «Decline» on the locked call screen: the caller
 * rang on and the call stayed open). The same on Android: «Decline» on the
 * call plugin's full-screen screen or notification of a CLOSED app reached
 * only the push isolate, which has no listener for it — nothing told the
 * server, the caller rang on for the whole minute.
 *
 * flutter_callkit_incoming's documented Android flow (README «MainApplication»,
 * MIT): a [com.hiennv.flutter_callkit_incoming.CallkitEventCallback]
 * registered in the Application sends the decline natively, with the
 * Flutter engine running or not ([LawbidApplication]). No session here:
 * the ring push's ticket (`POST /calls/:id/status/decline {t}`, server
 * CallStatusController.decline, idempotent), kept per call when the push
 * arrives ([rememberTicket], CallPushReceiver).
 *
 * Not a decline: an end the app made itself (Dart marks
 * `call.appEnded.<id>` a moment before, call_decline_marks.dart), a call
 * the native stop already ended (`call.ended.<id>`), a ring past its length.
 */
object CallDecline {
    private const val FLUTTER_PREFS = "FlutterSharedPreferences"
    private const val TICKETS = "lawbid_call_tickets"
    const val APP_ENDED_PREFIX = "flutter.call.appEnded."
    const val DECLINED_PREFIX = "flutter.call.declined."
    private const val APP_ENDED_WITHIN_MS = 10_000L
    private const val KEEP_MS = 10 * 60_000L

    private val executor = Executors.newSingleThreadExecutor()

    /** The ring push's ticket of [callId] and when it rang. */
    fun rememberTicket(context: Context, callId: String, ticket: String?, ringMs: Long) {
        if (ticket.isNullOrEmpty() || callId.isEmpty()) return
        try {
            val p = context.getSharedPreferences(TICKETS, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            val edit = p.edit()
            for ((k, v) in p.all) {
                val at = (v as? String)?.let { ticketOf(it)?.at } ?: 0L
                if (now - at > KEEP_MS) edit.remove(k)
            }
            edit.putString(callId.lowercase(), JSONObject()
                .put("t", ticket).put("at", now).put("ring", ringMs).toString())
            edit.apply()
        } catch (e: Exception) {
        }
    }

    data class Ticket(val token: String, val at: Long, val ringMs: Long)

    fun ticketOf(raw: String): Ticket? = try {
        val j = JSONObject(raw)
        val t = j.optString("t")
        if (t.isEmpty()) null else Ticket(
            t,
            j.optLong("at"),
            j.optLong("ring", CallRinging.RING_DEFAULT_MS),
        )
    } catch (e: Exception) {
        null
    }

    /** The call a plugin event names (its `extra.callId`, else its id). */
    fun callIdOf(data: Bundle): String? {
        @Suppress("UNCHECKED_CAST", "DEPRECATION")
        val extra = try {
            data.getSerializable(CallkitConstants.EXTRA_CALLKIT_EXTRA) as? HashMap<String, Any?>
        } catch (e: Exception) {
            null
        }
        val id = (extra?.get("callId") as? String)
            ?: data.getString(CallkitConstants.EXTRA_CALLKIT_ID)
        return id?.lowercase()?.ifEmpty { null }
    }

    /**
     * Whether a plugin «decline» of [callId] is the person's own choice:
     * the app did not end it itself just now ([appEndedAt]), the native
     * stop did not end it ([stoppedAt]) and it was still within its ring.
     */
    fun isPersonsDecline(
        now: Long,
        appEndedAt: Long?,
        stoppedAt: Long?,
        ticket: Ticket?,
    ): Boolean {
        if (appEndedAt != null && now - appEndedAt < APP_ENDED_WITHIN_MS) return false
        if (stoppedAt != null && now - stoppedAt < KEEP_MS) return false
        if (ticket != null && now - ticket.at >= ticket.ringMs) return false
        return true
    }

    /** CallkitEventCallback DECLINE (main thread): the request runs aside. */
    fun onDecline(context: Context, data: Bundle) {
        val app = context.applicationContext
        val callId = callIdOf(data) ?: return
        executor.execute {
            try {
                send(app, callId)
            } catch (e: Exception) {
                // Never crash the app over a decline; the server's ring
                // timeout is the safety net.
            }
        }
    }

    private fun send(app: Context, callId: String) {
        val flutter = app.getSharedPreferences(FLUTTER_PREFS, Context.MODE_PRIVATE)
        val ticket = app.getSharedPreferences(TICKETS, Context.MODE_PRIVATE)
            .getString(callId, null)?.let { ticketOf(it) }
        val now = System.currentTimeMillis()
        if (!isPersonsDecline(
                now,
                longOf(flutter, APP_ENDED_PREFIX + callId),
                longOf(flutter, CallRinging.ENDED_PREFIX + callId),
                ticket,
            )
        ) return
        // The app never rings it again (call_decline_marks.dart), even if
        // the request below never gets through.
        flutter.edit().putLong(DECLINED_PREFIX + callId, now).apply()
        val api = ChatNotifications.pushActions(app)?.first ?: return
        val token = ticket?.token ?: return
        for (attempt in 1..2) {
            val code = post("$api/calls/$callId/status/decline", token)
            if (code != null && code < 500) return
            Thread.sleep(1_000)
        }
    }

    private fun longOf(p: android.content.SharedPreferences, key: String): Long? = try {
        if (p.contains(key)) p.getLong(key, 0L) else null
    } catch (e: Exception) {
        null
    }

    /** The HTTP status, or null when the network failed. */
    private fun post(url: String, ticket: String): Int? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
            conn.outputStream.use {
                it.write(JSONObject().put("t", ticket).toString().toByteArray())
            }
            conn.responseCode
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
