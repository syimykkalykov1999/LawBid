package com.lawbid.lawbid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.media.AudioAttributes
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

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        createChannels()
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
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "lawbid/ringtone",
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    ringtone?.stop()
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
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
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
    }
}
