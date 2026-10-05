package com.lawbid.lawbid

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
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
 * Owner 2026-10-02: two notification channels with LawBid's own short
 * sounds — "chats" (messages) and "notifications" (everything else). The
 * server names the channel in each push (`android.notification.channel_id`).
 * Android keeps a channel's sound once created, so the user can swap it
 * for any system sound in the channel's own settings, opened from the app
 * through the `lawbid/notification_sounds` method channel.
 */
class MainActivity : FlutterFragmentActivity() {
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
        fun sound(res: String): Uri =
            Uri.parse("android.resource://$packageName/raw/$res")
        val chats = NotificationChannel(
            CHANNEL_CHATS,
            getString(R.string.channel_chats),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { setSound(sound("lawbid_message"), attrs) }
        val general = NotificationChannel(
            CHANNEL_NOTIFICATIONS,
            getString(R.string.channel_notifications),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { setSound(sound("lawbid_notify"), attrs) }
        manager.createNotificationChannels(listOf(chats, general))
    }

    companion object {
        const val CHANNEL_CHATS = "lawbid_chats"
        const val CHANNEL_NOTIFICATIONS = "lawbid_notifications"
    }
}
