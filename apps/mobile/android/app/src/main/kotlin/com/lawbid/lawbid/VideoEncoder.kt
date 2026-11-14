package com.lawbid.lawbid

import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.concurrent.Executors

/**
 * Owner row 42 (13.11, «видео обрабатывается медленно, качество ниже»): the
 * phone's video re-encode on Android goes through AndroidX Media3
 * Transformer (Google, Apache-2.0) — the hardware MediaCodec encoder,
 * H.264 High profile where the phone has it, HDR (HLG / HDR10 from Pixel and
 * Samsung cameras) tone-mapped to normal colours instead of the washed-out
 * picture of the old Transcoder path, and the audio copied as it is when it
 * is already AAC. Output limits stay the admin's (`media.video_max_height`,
 * `media.video_frame_rate`, the bitrate ladder `media.video_bitrate_*_kbps`),
 * H.264 + AAC in MP4 as before, so the server and every browser play it.
 *
 * The calls follow the Media3 guides «Getting started» and
 * «Transformations» (developer.android.com/media/media3/transformer, read
 * 13.11.2026) and the 1.9.2 sources: Transformer.Builder + Listener,
 * DefaultEncoderFactory + VideoEncoderSettings.setBitrate,
 * Presentation.createForShortSide, FrameDropEffect, Composition HDR mode,
 * getProgress polling, cancel. Dart side: lib/core/media/video_compression.dart.
 *
 * Channel `lawbid/video_encoder`:
 * - `compress` {id, path, maxShortSide, frameRate, bitrateKbps} → the output
 *   path, or null when cancelled; videos asked for while one encodes wait in
 *   a queue (one hardware encoder at a time) instead of failing;
 * - `progress` (to Dart) {id, progress 0..1} while a video encodes;
 * - `cancel` {id?} — that video, or all when no id.
 * Transformer lives on the main thread (its application thread); the source
 * file's metadata is read on a background thread. A foreground service
 * ([VideoEncodeService]) keeps the app alive while anything is queued.
 */
@OptIn(UnstableApi::class)
class VideoEncoder(private val context: Context, messenger: BinaryMessenger) {
    private class Job(
        val id: String,
        val path: String,
        val maxShortSide: Int,
        val frameRate: Int,
        val bitrateKbps: Int,
        val result: MethodChannel.Result,
    ) {
        var transformer: Transformer? = null
        var output: File? = null
        var cancelled = false
    }

    private val channel = MethodChannel(messenger, "lawbid/video_encoder")
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val queue = ArrayDeque<Job>()
    private var current: Job? = null

    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "compress" -> {
                    val path = call.argument<String>("path")
                    if (path == null) {
                        result.error("failed", "no path", null)
                    } else {
                        queue.addLast(
                            Job(
                                id = call.argument<String>("id") ?: path,
                                path = path,
                                maxShortSide = call.argument<Int>("maxShortSide") ?: 1080,
                                frameRate = call.argument<Int>("frameRate") ?: 30,
                                bitrateKbps = call.argument<Int>("bitrateKbps") ?: 0,
                                result = result,
                            ),
                        )
                        VideoEncodeService.start(context, -1)
                        next()
                    }
                }
                "cancel" -> {
                    cancel(call.argument<String>("id"))
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    /** Starts the next queued video when nothing encodes (main thread). */
    private fun next() {
        if (current != null) return
        val job = queue.removeFirstOrNull()
        if (job == null) {
            VideoEncodeService.stop(context)
            return
        }
        current = job
        // MediaMetadataRetriever reads the file: off the main thread.
        io.execute {
            val meta = metadataOf(job.path)
            main.post {
                // Owner rows 101/102 (13.11): an already light H.264 SDR file
                // (not taller, not faster, not heavier than the target) goes
                // up as it is — a second encode only loses quality. Same rule
                // as iOS (VideoEncoder.swift `keep`) and the web.
                if (job.cancelled || keepOriginal(job, meta)) {
                    done(job)
                    job.result.success(null)
                } else {
                    try {
                        start(job, meta)
                    } catch (e: Exception) {
                        job.output?.delete()
                        done(job)
                        job.result.error("failed", e.message, null)
                    }
                }
            }
        }
    }

    private fun done(job: Job) {
        if (current === job) current = null
        job.transformer = null
        next()
    }

    private fun start(job: Job, meta: Meta) {
        val effects = mutableListOf<Effect>()
        // Never upscale: shrink only a video taller than the admin's limit.
        if (meta.shortSide <= 0 || meta.shortSide > job.maxShortSide) {
            effects.add(Presentation.createForShortSide(job.maxShortSide))
        }
        // Drops frames only above the target (60 fps → 30); never adds any.
        effects.add(FrameDropEffect.createDefaultFrameDropEffect(job.frameRate.toFloat()))

        val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(File(job.path))))
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

        // The admin's ladder; never above the source's own bitrate.
        var bitrate = job.bitrateKbps * 1000
        if (meta.bitrate in 1 until bitrate) bitrate = meta.bitrate
        val encoders = DefaultEncoderFactory.Builder(context)
            .setEnableFallback(true)
        if (bitrate > 0) {
            encoders.setRequestedVideoEncoderSettings(
                VideoEncoderSettings.Builder().setBitrate(bitrate).build(),
            )
        }

        val out = File(context.cacheDir, "lawbid_video_${System.nanoTime()}.mp4")
        job.output = out
        val t = Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .setEncoderFactory(encoders.build())
            .addListener(object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    done(job)
                    job.result.success(out.absolutePath)
                }

                override fun onError(
                    composition: Composition,
                    exportResult: ExportResult,
                    exportException: ExportException,
                ) {
                    out.delete()
                    done(job)
                    job.result.error("failed", exportException.message, exportException.errorCodeName)
                }
            })
            .build()
        job.transformer = t
        t.start(composition, out.absolutePath)
        pollProgress(job, t)
    }

    private fun pollProgress(job: Job, t: Transformer) {
        val holder = ProgressHolder()
        main.post(object : Runnable {
            override fun run() {
                if (job.transformer !== t) return
                val state = t.getProgress(holder)
                if (state == Transformer.PROGRESS_STATE_AVAILABLE) {
                    channel.invokeMethod(
                        "progress",
                        mapOf("id" to job.id, "progress" to holder.progress / 100.0),
                    )
                    VideoEncodeService.progress(context, holder.progress)
                }
                if (state != Transformer.PROGRESS_STATE_NOT_STARTED) {
                    main.postDelayed(this, 250)
                }
            }
        })
    }

    /** Cancels [id] (queued or running), or every video when null. */
    private fun cancel(id: String?) {
        val waiting = queue.filter { id == null || it.id == id }
        queue.removeAll(waiting)
        // A cancelled export calls no listener: answer «nothing» here.
        waiting.forEach { it.result.success(null) }
        val job = current ?: run {
            if (queue.isEmpty()) VideoEncodeService.stop(context)
            return
        }
        if (id != null && job.id != id) return
        job.cancelled = true
        val t = job.transformer ?: return // metadata still loading: next() answers
        t.cancel()
        job.output?.delete()
        done(job)
        job.result.success(null)
    }

    private class Meta(
        val shortSide: Int,
        val bitrate: Int,
        val avc: Boolean = false,
        val hdr: Boolean = true,
        val fps: Float = 0f,
    )

    private fun keepOriginal(job: Job, m: Meta): Boolean =
        m.avc && !m.hdr && m.shortSide in 1..job.maxShortSide &&
            m.fps > 0f && m.fps <= job.frameRate + 0.5f &&
            m.bitrate > 0 && m.bitrate <= job.bitrateKbps * 1000

    /** The smaller of width / height (rotation does not change it) and the
     * bitrate in bit/s; 0 = unknown. Background thread. */
    private fun metadataOf(path: String): Meta {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(path)
            val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val b = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull() ?: 0
            val track = videoTrackOf(path)
            Meta(
                if (w <= 0 || h <= 0) 0 else minOf(w, h),
                b,
                avc = track?.getString(MediaFormat.KEY_MIME) == MediaFormat.MIMETYPE_VIDEO_AVC,
                hdr = track == null || isHdr(track),
                fps = track?.let { fpsOf(it) } ?: 0f,
            )
        } catch (e: Exception) {
            Meta(0, 0)
        } finally {
            try {
                r.release()
            } catch (e: Exception) {
                // already released
            }
        }
    }

    /** The first video track's format, or null. Background thread. */
    private fun videoTrackOf(path: String): MediaFormat? {
        val x = MediaExtractor()
        return try {
            x.setDataSource(path)
            (0 until x.trackCount).map { x.getTrackFormat(it) }
                .firstOrNull { it.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true }
        } catch (e: Exception) {
            null
        } finally {
            x.release()
        }
    }

    /** PQ / HLG transfer = HDR (unknown = SDR, as MediaCodec reports). */
    private fun isHdr(f: MediaFormat): Boolean {
        if (!f.containsKey(MediaFormat.KEY_COLOR_TRANSFER)) return false
        val t = f.getInteger(MediaFormat.KEY_COLOR_TRANSFER)
        return t == MediaFormat.COLOR_TRANSFER_ST2084 || t == MediaFormat.COLOR_TRANSFER_HLG
    }

    private fun fpsOf(f: MediaFormat): Float = try {
        if (f.containsKey(MediaFormat.KEY_FRAME_RATE)) {
            try {
                f.getInteger(MediaFormat.KEY_FRAME_RATE).toFloat()
            } catch (e: ClassCastException) {
                f.getFloat(MediaFormat.KEY_FRAME_RATE)
            }
        } else {
            0f
        }
    } catch (e: Exception) {
        0f
    }
}
