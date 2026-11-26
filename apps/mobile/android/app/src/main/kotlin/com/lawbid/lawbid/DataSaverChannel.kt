package com.lawbid.lawbid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * G9 (25.11): the phone's Data Saver, so the app stops background media
 * work by itself (lib/core/platform/system_data_saver.dart).
 *
 * The check is the one from developer.android.com «Optimize network data
 * usage» (Apache-2.0 sample): Data Saver applies only on a metered network,
 * and `restrictBackgroundStatus == RESTRICT_BACKGROUND_STATUS_ENABLED`
 * means it is on and this app is not on the person's allow list
 * (WHITELISTED = allowed, DISABLED = off). Changes arrive by
 * `ACTION_RESTRICT_BACKGROUND_CHANGED` (only to a receiver registered in
 * code) and by the default network callback (Wi-Fi <-> mobile).
 *
 * Channels: `lawbid/data_saver` method `isOn` -> Boolean;
 * `lawbid/data_saver/changes` events: Boolean on every change.
 */
object DataSaverChannel {
    private val main = Handler(Looper.getMainLooper())

    fun isOn(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false
        if (!cm.isActiveNetworkMetered) return false
        return cm.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
    }

    fun register(context: Context, messenger: BinaryMessenger) {
        val app = context.applicationContext
        MethodChannel(messenger, "lawbid/data_saver").setMethodCallHandler { call, result ->
            if (call.method == "isOn") result.success(isOn(app)) else result.notImplemented()
        }
        EventChannel(messenger, "lawbid/data_saver/changes").setStreamHandler(
            object : EventChannel.StreamHandler {
                private var receiver: BroadcastReceiver? = null
                private var callback: ConnectivityManager.NetworkCallback? = null
                private var last: Boolean? = null

                // Network callbacks come on a system thread: read, compare and
                // send on the main thread only (the sink needs it too).
                private fun emit(sink: EventChannel.EventSink) {
                    main.post {
                        if (receiver == null) return@post
                        val now = isOn(app)
                        if (now != last) {
                            last = now
                            sink.success(now)
                        }
                    }
                }

                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    val r = object : BroadcastReceiver() {
                        override fun onReceive(c: Context?, intent: Intent?) = emit(events)
                    }
                    val filter = IntentFilter(ConnectivityManager.ACTION_RESTRICT_BACKGROUND_CHANGED)
                    if (Build.VERSION.SDK_INT >= 33) {
                        app.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
                    } else {
                        app.registerReceiver(r, filter)
                    }
                    receiver = r
                    val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                    if (cm != null) {
                        val cb = object : ConnectivityManager.NetworkCallback() {
                            override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) =
                                emit(events)

                            override fun onLost(n: Network) = emit(events)
                        }
                        try {
                            cm.registerDefaultNetworkCallback(cb)
                            callback = cb
                        } catch (_: RuntimeException) {
                            // Too many callbacks in this process: the broadcast still works.
                        }
                    }
                    emit(events)
                }

                override fun onCancel(arguments: Any?) {
                    receiver?.let { runCatching { app.unregisterReceiver(it) } }
                    receiver = null
                    val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                    callback?.let { cb -> runCatching { cm?.unregisterNetworkCallback(cb) } }
                    callback = null
                    last = null
                }
            },
        )
    }
}
