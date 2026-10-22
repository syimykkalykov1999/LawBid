package com.lawbid.lawbid

import android.app.NotificationChannel
import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.pm.PackageManager
import androidx.core.app.NotificationManagerCompat
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * FlutterFragmentActivity, not FlutterActivity (Phase 4 of the auth
 * networking work, docs/CHANGELOG.md): local_auth's Android implementation
 * (biometric reauth, core/session/biometric_auth_service.dart) needs the
 * host Activity to be a FragmentActivity to show BiometricPrompt — a plain
 * FlutterActivity throws at runtime the first time authenticate() is
 * called. FlutterFragmentActivity is Flutter's drop-in FragmentActivity
 * subclass for exactly this case; no other behavior changes.
 *
 * Two notification channels — "chats" (messages) and "general"
 * (everything else). The server names the channel in each push
 * (`android.notification.channel_id`). Owner 2026-10-07: both use the
 * phone's default notification sound and an incoming call in the open app
 * plays the phone's own ringtone (`lawbid/ringtone`) — LawBid ships no
 * sounds of its own. The user can pick any system sound in a channel's own
 * settings, opened through the `lawbid/notification_sounds` method channel.
 */
class MainActivity : FlutterFragmentActivity() {
    private var ringtone: Ringtone? = null
    private var pendingPermission: MethodChannel.Result? = null
    private var callChannel: MethodChannel? = null
    private var pendingCallAction: String? = null
    private var pipActive = false
    private var chatChannel: MethodChannel? = null
    private var pendingChatOpen: Map<String, String>? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createChannels()
        // Owner 2026-10-20: a video call goes to a floating window when the
        // person leaves the app (Home / another app), like WhatsApp.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/call_pip",
        ).setMethodCallHandler { call, result ->
            if (call.method == "setActive") {
                pipActive = call.argument<Boolean>("active") == true
                result.success(null)
            } else {
                result.notImplemented()
            }
        }
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/notification_sounds",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "openChannel" -> {
                    val id = call.argument<String>("id") ?: CHANNEL_NOTIFICATIONS
                    val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        .putExtra(Settings.EXTRA_CHANNEL_ID, id)
                    startActivity(intent)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
        // Owner 2026-10-15: the phone's own notification switch — asked
        // (Android 13+), read, opened and tried with a local notification,
        // whether or not Firebase is set up in this build.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/system_notifications",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "enabled" -> result.success(notificationsAllowed())
                "request" -> {
                    if (notificationsAllowed()) {
                        result.success(true)
                    } else if (Build.VERSION.SDK_INT >= 33) {
                        pendingPermission?.success(false)
                        pendingPermission = result
                        requestPermissions(
                            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                            REQUEST_NOTIFICATIONS,
                        )
                    } else {
                        result.success(false)
                    }
                }
                "openSettings" -> {
                    startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
                    )
                    result.success(null)
                }
                // The app's own page in the phone's settings (permissions).
                "openAppSettings" -> {
                    startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                            .setData(android.net.Uri.fromParts("package", packageName, null)),
                    )
                    result.success(null)
                }
                "showTest" -> {
                    if (!notificationsAllowed()) {
                        result.success(false)
                    } else {
                        val builder = if (Build.VERSION.SDK_INT >= 26) {
                            Notification.Builder(this, CHANNEL_NOTIFICATIONS)
                        } else {
                            @Suppress("DEPRECATION")
                            Notification.Builder(this)
                        }
                        val n = builder
                            .setSmallIcon(applicationInfo.icon)
                            .setContentTitle(call.argument<String>("title") ?: "")
                            .setContentText(call.argument<String>("body") ?: "")
                            .setAutoCancel(true)
                            .build()
                        getSystemService(NotificationManager::class.java)?.notify(7002, n)
                        result.success(true)
                    }
                }
                else -> result.notImplemented()
            }
        }
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/ringtone",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    ringtone?.stop()
                    stopVibration()
                    // Like a phone call: silent = nothing, vibrate = buzz only.
                    val mode = (getSystemService(AUDIO_SERVICE) as? AudioManager)?.ringerMode
                    if (mode == AudioManager.RINGER_MODE_SILENT) {
                        ringtone = null
                        result.success(null)
                        return@setMethodCallHandler
                    }
                    startVibration()
                    if (mode == AudioManager.RINGER_MODE_VIBRATE) {
                        ringtone = null
                        result.success(null)
                        return@setMethodCallHandler
                    }
                    ringtone = RingtoneManager.getRingtone(
                        this,
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                    )?.apply {
                        audioAttributes = AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
                        play()
                    }
                    result.success(null)
                }
                "stop" -> {
                    ringtone?.stop()
                    ringtone = null
                    stopVibration()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
        // Owner 2026-10-20: the ongoing-call notification / foreground
        // service (CallForegroundService); its "Hang up" and tap come back
        // here as `action` events.
        callChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/call_service",
        ).also { ch ->
            CallBridge.channel = ch
            ch.setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        val intent = Intent(this, CallForegroundService::class.java)
                            .putExtra(
                                CallForegroundService.EXTRA_NAME,
                                call.argument<String>("name") ?: "",
                            )
                            .putExtra(
                                CallForegroundService.EXTRA_SINCE,
                                (call.argument<Number>("since") ?: 0L).toLong(),
                            )
                            .putExtra(
                                CallForegroundService.EXTRA_STATUS,
                                call.argument<String>("status") ?: "",
                            )
                            .putExtra(
                                CallForegroundService.EXTRA_HANGUP,
                                call.argument<String>("hangup") ?: "",
                            )
                        try {
                            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent)
                            else startService(intent)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    "stop" -> {
                        stopService(Intent(this, CallForegroundService::class.java))
                        // The service may be gone already (or never got to
                        // run): its notification must be too.
                        try {
                            getSystemService(NotificationManager::class.java)
                                ?.cancel(CallForegroundService.NOTIFICATION_ID)
                        } catch (e: Exception) {
                        }
                        clearCallNotifications()
                        result.success(null)
                    }
                    "clear" -> {
                        clearCallNotifications()
                        result.success(null)
                    }
                    "pendingAction" -> {
                        result.success(pendingCallAction)
                        pendingCallAction = null
                    }
                    else -> result.notImplemented()
                }
            }
        }
        // Owner 2026-10-22 (WhatsApp): chat notifications drawn natively
        // (ChatNotifications) — the phone-book names of LawBid contacts, an
        // opened chat clears its notification, a sign-out clears them all;
        // a tapped one opens its chat (`open`, or `pendingOpen` on a cold
        // start).
        chatChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/chat_notifications",
        ).also { ch ->
            ch.setMethodCallHandler { call, result ->
                when (call.method) {
                    "setContactNames" -> {
                        val raw = call.argument<Map<String, String>>("names") ?: emptyMap()
                        ChatNotifications.setContactNames(applicationContext, raw)
                        result.success(null)
                    }
                    "clear" -> {
                        call.argument<String>("conversationId")?.let {
                            ChatNotifications.clear(applicationContext, it)
                        }
                        result.success(null)
                    }
                    "clearAll" -> {
                        ChatNotifications.clearAll(applicationContext)
                        result.success(null)
                    }
                    "pendingOpen" -> {
                        result.success(pendingChatOpen)
                        pendingChatOpen = null
                    }
                    else -> result.notImplemented()
                }
            }
        }
        ChatNotifications.openTarget(intent)?.let { pendingChatOpen = it }
        // A cold start from the notification: Dart asks for it (pendingAction).
        callActionOf(intent)?.let { pendingCallAction = it }
        // Owner 2026-10-05 (docs/CLIENT_FRAUD.md): ANDROID_ID for the
        // X-Device-Key header (lib/core/network/device_key.dart). Stable for
        // this app on this phone until a factory reset; the server keeps
        // only a hash, to recognise a blocked fraudster's new account.
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/device_key",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "androidId" -> result.success(
                    Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID),
                )
                else -> result.notImplemented()
            }
        }
    }

    private var vibrator: Vibrator? = null

    private fun startVibration() {
        try {
            val v = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            vibrator = v
            val pattern = longArrayOf(0L, 1000L, 1000L)
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            // no vibrator
        }
    }

    private fun stopVibration() {
        try {
            vibrator?.cancel()
        } catch (e: Exception) {
            // already gone
        }
        vibrator = null
    }

    /** After a call: no ringing / ongoing notification of any call (ours or
     * the call plugin's) may stay in the shade. */
    private fun clearCallNotifications() {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val channels = setOf(
            "callkit_incoming_channel_id_v2",
            "callkit_incoming_channel_id",
            "callkit_ongoing_channel_id",
            CallForegroundService.CHANNEL,
        )
        try {
            for (n in nm.activeNotifications) {
                if (Build.VERSION.SDK_INT >= 26 && n.notification.channelId in channels) {
                    nm.cancel(n.tag, n.id)
                }
            }
        } catch (e: Exception) {
            // listing not allowed: nothing to clear
        }
    }

    override fun onDestroy() {
        stopVibration()
        super.onDestroy()
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        CallBridge.channel = null
        chatChannel = null
        super.cleanUpFlutterEngine(flutterEngine)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (pipActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                enterPictureInPictureMode(
                    android.app.PictureInPictureParams.Builder()
                        .setAspectRatio(android.util.Rational(9, 16))
                        .build(),
                )
            } catch (e: Exception) {
                // PiP not allowed on this device: the call goes on in the
                // background with its notification.
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleCallIntent(intent)
        ChatNotifications.openTarget(intent)?.let { target ->
            intent.action = null
            val ch = chatChannel
            if (ch != null) ch.invokeMethod("open", target) else pendingChatOpen = target
        }
    }

    private fun callActionOf(intent: Intent?): String? = when (intent?.action) {
        CallForegroundService.ACTION_HANGUP -> "hangup"
        CallForegroundService.ACTION_OPEN -> "open"
        else -> null
    }

    private fun handleCallIntent(intent: Intent?) {
        val action = callActionOf(intent) ?: return
        intent?.action = null
        callChannel?.invokeMethod("action", action)
    }

    private fun notificationsAllowed(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(this).areNotificationsEnabled()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_NOTIFICATIONS) {
            pendingPermission?.success(
                grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED,
            )
            pendingPermission = null
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val sound = Settings.System.DEFAULT_NOTIFICATION_URI
        // The first test builds made channels with LawBid's own sounds;
        // Android never changes a channel's sound, so those go.
        manager.deleteNotificationChannel("lawbid_chats")
        manager.deleteNotificationChannel("lawbid_notifications")
        val chats = NotificationChannel(
            CHANNEL_CHATS,
            getString(R.string.channel_chats),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { setSound(sound, attrs) }
        val general = NotificationChannel(
            CHANNEL_NOTIFICATIONS,
            getString(R.string.channel_notifications),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { setSound(sound, attrs) }
        manager.createNotificationChannels(listOf(chats, general))
    }

    companion object {
        const val CHANNEL_CHATS = "chats"
        const val CHANNEL_NOTIFICATIONS = "general"
        const val REQUEST_NOTIFICATIONS = 7001
    }
}
