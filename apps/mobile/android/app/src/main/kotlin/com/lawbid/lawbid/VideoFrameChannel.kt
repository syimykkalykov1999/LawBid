package com.lawbid.lawbid

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.io.FileInputStream
import java.util.concurrent.Executors

/**
 * Owner row 106 (media audit 13.11, batch F item 13; WhatsApp / Telegram
 * show a picture, not a player): the first frame of a chat video as one
 * JPEG, plus its length, so a chat tile draws a picture instead of opening
 * a video decoder per tile. The player opens only on tap.
 *
 * `createVideoThumbnail` / `buildThumbnailData` copied from video_thumbnail
 * 0.5.6 (MIT, John Zhong, github.com/justsoft/video_thumbnail,
 * android/.../VideoThumbnailPlugin.java), see THIRD_PARTY_NOTICES.md; the
 * length (METADATA_KEY_DURATION) is read from the same retriever.
 *
 * Channel `lawbid/video_frame`, method `frame` {url, maxPx, quality} →
 * {jpeg: ByteArray, durationMs: Long} or null.
 */
object VideoFrameChannel {
    private val executor = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())

    fun register(messenger: BinaryMessenger) {
        MethodChannel(messenger, "lawbid/video_frame").setMethodCallHandler { call, result ->
            if (call.method != "frame") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val url = call.argument<String>("url")
            val maxPx = call.argument<Int>("maxPx") ?: 0
            val quality = call.argument<Int>("quality") ?: 70
            if (url == null) {
                result.success(null)
                return@setMethodCallHandler
            }
            executor.execute {
                val out = try {
                    frame(url, maxPx, quality)
                } catch (e: Exception) {
                    null
                }
                main.post { result.success(out) }
            }
        }
    }

    private fun frame(video: String, maxPx: Int, quality: Int): Map<String, Any>? {
        var bitmap: Bitmap? = null
        var durationMs = 0L
        val retriever = MediaMetadataRetriever()
        try {
            if (video.startsWith("/")) {
                FileInputStream(video).use { retriever.setDataSource(it.fd) }
            } else if (video.startsWith("file://")) {
                FileInputStream(video.substring(7)).use { retriever.setDataSource(it.fd) }
            } else {
                retriever.setDataSource(video, HashMap<String, String>())
            }
            durationMs = retriever
                .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L
            bitmap = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            val b = bitmap
            if (b != null && maxPx > 0 && maxOf(b.width, b.height) > maxPx) {
                val scale = maxPx.toFloat() / maxOf(b.width, b.height)
                bitmap = if (Build.VERSION.SDK_INT >= 27) {
                    retriever.getScaledFrameAtTime(
                        0,
                        MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                        Math.round(b.width * scale),
                        Math.round(b.height * scale),
                    ) ?: b
                } else {
                    Bitmap.createScaledBitmap(
                        b,
                        Math.round(b.width * scale),
                        Math.round(b.height * scale),
                        true,
                    )
                }
            }
        } finally {
            try {
                retriever.release()
            } catch (e: Exception) {
                // nothing to free
            }
        }
        val b = bitmap ?: return null
        val stream = ByteArrayOutputStream()
        b.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        b.recycle()
        return mapOf("jpeg" to stream.toByteArray(), "durationMs" to durationMs)
    }
}
