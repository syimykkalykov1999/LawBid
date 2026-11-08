package com.lawbid.lawbid

import android.app.Application
import android.os.Bundle
import com.hiennv.flutter_callkit_incoming.CallkitEventCallback
import com.hiennv.flutter_callkit_incoming.FlutterCallkitIncomingPlugin

/**
 * Owner 2026-11-08: «Decline» on the system call screen tells the server
 * even when the app is closed ([CallDecline]). The call plugin's own
 * documented way (flutter_callkit_incoming README, «MainApplication.kt»,
 * MIT): register a [CallkitEventCallback] when the process starts, before
 * any of the plugin's receivers runs. The plugin keeps callbacks as weak
 * references, so this one is held by the Application for the process's
 * whole life.
 */
class LawbidApplication : Application() {
    private val callkitEvents = object : CallkitEventCallback {
        override fun onCallEvent(event: CallkitEventCallback.CallEvent, callData: Bundle) {
            if (event == CallkitEventCallback.CallEvent.DECLINE) {
                CallDecline.onDecline(this@LawbidApplication, callData)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        FlutterCallkitIncomingPlugin.registerEventCallback(callkitEvents)
    }
}
