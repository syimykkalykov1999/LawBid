package com.lawbid.lawbid

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Owner row 42 (13.11, «видео обрабатывается медленно, качество ниже»): the
 * phone's video re-encode on Android goes through AndroidX Media3
 * Transformer (Google, Apache-2.0) — the hardware MediaCodec encoder,
 * H.264 High profile where the phone has it, HDR (HLG / HDR10 from Pixel and
 * Samsung cameras) tone-mapped to normal colours instead of the washed-out
 * picture of the old Transcoder path, and the audio copied as it is when it
 * is already AAC. Output limits stay the admin's (`media.video_max_height`,
 * `media.video_frame_rate`), H.264 + AAC in MP4 as before, so the server and
 * every browser play it.
 *
 * The calls follow the Media3 guides «Getting started» and
 * «Transformations» (developer.android.com/media/media3/transformer, read
 * 13.11.2026) and the 1.9.2 sources: Transformer.Builder + Listener,
 * Presentation.createForShortSide, FrameDropEffect, Composition HDR mode,
 * getProgress polling, cancel. Dart side: lib/core/media/video_compression.dart.
 *
 * Channel `lawbid/video_encoder`:
 * - `compress` {path, maxShortSide, frameRate} → the output path;
 * - `progress` (to Dart) 0..1 while it runs;
 * - `cancel`.
 * Transformer lives on the main thread (its application thread).
 */
@OptIn(UnstableApi::class)
class VideoEncoder(private val context: Context, messenger: BinaryMessenger) {
    private val channel = MethodChannel(messenger, "lawbid/video_encoder")
    private val main = Handler(Looper.getMainLooper())
    private var transformer: Transformer? = null
    private var pending: MethodChannel.Result? = null
    private var output: File? = null

    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "compress" -> {
                    val path = call.argument<String>("path")
                    val maxShortSide = call.argument<Int>("maxShortSide") ?: 1080
                    val frameRate = call.argument<Int>("frameRate") ?: 30
                    if (path == null || transformer != null) {
                        result.error("busy", "no path or another video is encoding", null)
                    } else {
                        try {
                            start(path, maxShortSide, frameRate, result)
                        } catch (e: Exception) {
                            finish()
                            result.error("failed", e.message, null)
                        }
                    }
                }
                "cancel" -> {
                    cancel()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun start(path: String, maxShortSide: Int, frameRate: Int, result: MethodChannel.Result) {
        val effects = mutableListOf<androidx.media3.common.Effect>()
        // Never upscale: shrink only a video taller than the admin's limit.
        val shortSide = shortSideOf(path)
        if (shortSide <= 0 || shortSide > maxShortSide) {
            effects.add(Presentation.createForShortSide(maxShortSide))
        }
        // Drops frames only above the target (60 fps → 30); never adds any.
        effects.add(FrameDropEffect.createDefaultFrameDropEffect(frameRate.toFloat()))

        val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(File(path))))
            .setEffects(Effects(listOf(), effects))
            .build()
        val builder = Composition.Builder(
            EditedMediaItemSequence.withAudioAndVideoFrom(listOf(item)),
        )
        // The OpenGL tone-mapper exists from Android 10 (API 29); below it the
        // default mode is kept (an HDR clip there fails and Dart falls back).
        if (Build.VERSION.SDK_INT >= 29) {
            builder.setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
        }
        val composition = builder.build()

        val out = File(context.cacheDir, "lawbid_video_${System.currentTimeMillis()}.mp4")
        val t = Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    val r = pending
                    finish()
                    r?.success(out.absolutePath)
                }

                override fun onError(
                    composition: Composition,
                    exportResult: ExportResult,
                    exportException: ExportException,
                ) {
                    val r = pending
                    finish()
                    out.delete()
                    r?.error("failed", exportException.message, exportException.errorCodeName)
                }
            })
            .build()
        transformer = t
        pending = result
        output = out
        t.start(composition, out.absolutePath)
        pollProgress(t)
    }

    private fun pollProgress(t: Transformer) {
        val holder = ProgressHolder()
        main.post(object : Runnable {
            override fun run() {
                if (transformer !== t) return
                val state = t.getProgress(holder)
                if (state == Transformer.PROGRESS_STATE_AVAILABLE) {
                    channel.invokeMethod("progress", holder.progress / 100.0)
                }
                if (state != Transformer.PROGRESS_STATE_NOT_STARTED) {
                    main.postDelayed(this, 250)
                }
            }
        })
    }

    private fun cancel() {
        val t = transformer ?: return
        val r = pending
        val out = output
        t.cancel()
        finish()
        out?.delete()
        // A cancelled export calls no listener: answer «nothing» here.
        r?.success(null)
    }

    private fun finish() {
        transformer = null
        pending = null
        output = null
    }

    /** The smaller of width / height (rotation does not change it); 0 = unknown. */
    private fun shortSideOf(path: String): Int {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(path)
            val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            if (w <= 0 || h <= 0) 0 else minOf(w, h)
        } catch (e: Exception) {
            0
        } finally {
            try {
                r.release()
            } catch (e: Exception) {
                // already released
            }
        }
    }
}
