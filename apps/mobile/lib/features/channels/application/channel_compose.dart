import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/data/channels_repository.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/reels/application/video_limits.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Uploads one post photo and returns its file id. Overridden in tests.
typedef ChannelPhotoUploader = Future<String> Function(
  Uint8List bytes, {
  void Function(double)? onProgress,
});

final channelPhotoUploaderProvider = Provider<ChannelPhotoUploader>(
  (ref) => (bytes, {onProgress}) => ref
      .read(socialActionsProvider)
      .uploadPhoto(bytes, onProgress: onProgress),
);

/// The most photos a post takes (`channels.max_post_media`, the admin's).
int channelMaxPhotos(WidgetRef ref) => ref
    .read(featureFlagsControllerProvider)
    .configInt('channels.max_post_media', kChannelDefaultMaxPostMedia)
    .clamp(1, 10);

/// The longest channel video, in seconds (the reel limit).
int channelMaxVideoSeconds(WidgetRef ref) => reelMaxSeconds(ref);

/// One photo of the post being written.
class ChannelPhotoDraft {
  ChannelPhotoDraft(this.bytes);

  final Uint8List bytes;
  double progress = 0;
  String? fileId;
  Object? error;

  bool get uploading => fileId == null && error == null;
}

/// The picked video of the post being written.
class ChannelVideoDraft {
  const ChannelVideoDraft({
    required this.file,
    required this.durationSec,
    required this.size,
    this.shortSide = 0,
    this.frame,
  });

  final XFile file;
  final int durationSec;
  final int size;

  /// The smaller side of the picture, in pixels (0 = unknown).
  final int shortSide;

  /// A still of the first moment, for the preview.
  final Uint8List? frame;
}

enum ChannelComposePhase {
  idle,
  compressing,
  uploading,
  processing,
  posting,
}

class ChannelComposeState {
  const ChannelComposeState({
    this.photos = const [],
    this.video,
    this.phase = ChannelComposePhase.idle,
    this.progress = 0,
    this.error,
  });

  final List<ChannelPhotoDraft> photos;
  final ChannelVideoDraft? video;
  final ChannelComposePhase phase;

  /// 0..1 of the current phase (compressing, uploading).
  final double progress;

  /// The last publish failure, shown with Retry.
  final Object? error;

  bool get busy => phase != ChannelComposePhase.idle;
  bool get hasMedia => photos.isNotEmpty || video != null;
  bool get photosReady => photos.every((p) => p.fileId != null);

  ChannelComposeState copyWith({
    List<ChannelPhotoDraft>? photos,
    ChannelVideoDraft? video,
    bool clearVideo = false,
    ChannelComposePhase? phase,
    double? progress,
    Object? error,
    bool clearError = false,
  }) =>
      ChannelComposeState(
        photos: photos ?? this.photos,
        video: clearVideo ? null : (video ?? this.video),
        phase: phase ?? this.phase,
        progress: progress ?? this.progress,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Owner 26.11 (Instagram «upload while you edit», as R-396 does for reels):
/// the picked video compresses and goes to Bunny while the text is still
/// being written; «Publish» then only waits for what is left (and for
/// Bunny to make it playable). Replacing or removing the video, or leaving
/// the composer, stops it and deletes what had gone up.
class _EarlyVideo {
  _EarlyVideo(this.draft);

  final ChannelVideoDraft draft;
  final cancel = CancelToken();
  VideoCompressor? compressor;
  late final Future<ChannelVideoUpload> uploaded;
  String? assetId;
  bool done = false;

  ChannelComposePhase phase = ChannelComposePhase.compressing;
  double progress = 0;
  void Function(ChannelComposePhase phase, double progress)? onStep;

  void step(ChannelComposePhase p, double v) {
    phase = p;
    progress = v;
    onStep?.call(p, v);
  }
}

/// Owner 2026-10-20: writing a channel post — photos (up to the admin's
/// limit) OR one video, text up to 4000. Photos upload as soon as they are
/// added; a video is compressed, sent to Bunny over TUS, then waited for
/// until it plays, and only then is the post created.
final channelComposeProvider = NotifierProvider.autoDispose
    .family<ChannelCompose, ChannelComposeState, String>(ChannelCompose.new);

class ChannelCompose extends Notifier<ChannelComposeState> {
  ChannelCompose(this.channelId);

  final String channelId;
  CancelToken? _cancel;
  VideoCompressor? _compressor;

  /// The picked video's early upload ([_EarlyVideo]), and the one a
  /// running [publish] took over.
  _EarlyVideo? _early;
  _EarlyVideo? _claimed;

  /// Whether the picked video was already on Bunny at the last «Publish»
  /// (tests; the debug timing mark says the same).
  bool? lastPublishHadVideo;

  @override
  ChannelComposeState build() {
    // Read now: no `ref` in the dispose callback.
    final repo = ref.read(channelsRepositoryProvider);
    ref.onDispose(() {
      _cancel?.cancel();
      final e = _early;
      _early = null;
      if (e != null) _drop(e, repo);
    });
    return const ChannelComposeState();
  }

  void _startEarly(ChannelVideoDraft v) {
    final repo = ref.read(channelsRepositoryProvider);
    final e = _early = _EarlyVideo(v);
    e.uploaded = () async {
      final file = await _compressed(
        v,
        (p) => e.step(ChannelComposePhase.compressing, p),
        (c) => e.compressor = c,
      );
      if (e.cancel.isCancelled) {
        throw DioException.requestCancelled(
          requestOptions: RequestOptions(),
          reason: 'dropped',
        );
      }
      e.step(ChannelComposePhase.uploading, 0);
      final upload = await repo.createVideoUpload(
        sizeBytes: await file.length(),
        durationSec: v.durationSec,
      );
      e.assetId = upload.videoAssetId;
      if (e.cancel.isCancelled) {
        _cancelAsset(repo, upload.videoAssetId);
        throw DioException.requestCancelled(
          requestOptions: RequestOptions(),
          reason: 'dropped',
        );
      }
      await repo.uploadVideo(
        file,
        upload,
        cancel: e.cancel,
        parallel: ref
            .read(featureFlagsControllerProvider)
            .isEnabled('reels_tus_parallel'),
        onProgress: (p) => e.step(ChannelComposePhase.uploading, p),
      );
      e.done = true;
      return upload;
    }();
    // A failure is handled at «Publish» (it uploads again then).
    e.uploaded.ignore();
  }

  void _dropEarly() {
    final e = _early;
    _early = null;
    if (e != null) _drop(e, ref.read(channelsRepositoryProvider));
  }

  static void _drop(_EarlyVideo e, ChannelsRepository repo) {
    e
      ..onStep = null
      ..cancel.cancel();
    e.compressor?.cancel().ignore();
    final asset = e.assetId;
    if (asset != null) _cancelAsset(repo, asset);
  }

  static void _cancelAsset(ChannelsRepository repo, String id) =>
      unawaited(repo.cancelVideo(id).then((_) {}, onError: (_) {}));

  /// Adds what fits under [max]; returns how many were left out.
  int addPhotos(List<Uint8List> picked, {required int max}) {
    if (state.video != null || state.busy) return picked.length;
    final room = math.max(0, max - state.photos.length);
    final added = [
      for (final b in picked.take(room)) ChannelPhotoDraft(b),
    ];
    state = state.copyWith(
      photos: [...state.photos, ...added],
      clearError: true,
    );
    for (final p in added) {
      unawaited(_upload(p));
    }
    return picked.length - added.length;
  }

  Future<void> _upload(ChannelPhotoDraft p) async {
    p
      ..error = null
      ..progress = 0;
    _touch();
    try {
      final id = await ref.read(channelPhotoUploaderProvider)(
        p.bytes,
        onProgress: (v) {
          p.progress = v;
          _touch();
        },
      );
      p.fileId = id;
    } on Object catch (e) {
      p.error = e;
    }
    _touch();
  }

  void retryPhoto(ChannelPhotoDraft p) => unawaited(_upload(p));

  void removePhoto(ChannelPhotoDraft p) {
    if (state.busy) return;
    state = state.copyWith(
      photos: [
        for (final x in state.photos)
          if (!identical(x, p)) x,
      ],
    );
  }

  void setVideo(ChannelVideoDraft v) {
    if (state.photos.isNotEmpty || state.busy) return;
    _dropEarly();
    state = state.copyWith(video: v, clearError: true);
    _startEarly(v);
  }

  void removeVideo() {
    if (state.busy) return;
    _dropEarly();
    state = state.copyWith(clearVideo: true, clearError: true);
  }

  void _touch() {
    if (!ref.mounted) return;
    state = state.copyWith(photos: List.of(state.photos));
  }

  void _set(ChannelComposePhase phase, [double progress = 0]) {
    if (ref.mounted) {
      state = state.copyWith(phase: phase, progress: progress);
    }
  }

  /// Publishes the post. Returns it (already put first in the channel's
  /// feed), or null when the publish was cancelled; any failure is kept in
  /// [ChannelComposeState.error] and rethrown.
  Future<ChannelPost?> publish(String body) async {
    if (state.busy) return null;
    final repo = ref.read(channelsRepositoryProvider);
    final video = state.video;
    String? assetId;
    var posted = false;
    _cancel = CancelToken();
    state = state.copyWith(clearError: true);
    final early = _early;
    _early = null;
    final mine = early != null && identical(early.draft, video);
    lastPublishHadVideo = mine && early.done;
    PerfMarks.publishTap(
      'channel',
      mediaReady: video == null ? state.photosReady : mine && early.done,
    );
    if (early != null && !mine) _drop(early, repo);
    try {
      if (video != null) {
        ChannelVideoUpload? upload;
        if (mine) {
          // Picked up where the early upload is.
          _cancel = early.cancel;
          _claimed = early;
          if (!early.done) _set(early.phase, early.progress);
          early.onStep = _set;
          try {
            upload = await early.uploaded;
          } on DioException catch (e) {
            if (CancelToken.isCancel(e)) rethrow;
          } on Object {
            // Sent again below.
          } finally {
            early.onStep = null;
            _claimed = null;
          }
          if (upload == null && early.assetId != null) {
            _cancelAsset(repo, early.assetId!);
          }
          if (_cancel!.isCancelled) return null;
        }
        if (upload == null) {
          final file = await _compressed(
            video,
            (p) => _set(ChannelComposePhase.compressing, p),
            (c) => _compressor = c,
          );
          if (_cancel?.isCancelled ?? true) return null;
          _set(ChannelComposePhase.uploading);
          upload = await repo.createVideoUpload(
            sizeBytes: await file.length(),
            durationSec: video.durationSec,
          );
          assetId = upload.videoAssetId;
          await repo.uploadVideo(
            file,
            upload,
            cancel: _cancel,
            parallel: ref
                .read(featureFlagsControllerProvider)
                .isEnabled('reels_tus_parallel'),
            onProgress: (v) => _set(ChannelComposePhase.uploading, v),
          );
        }
        assetId = upload.videoAssetId;
        _set(ChannelComposePhase.processing, 1);
        await _waitReady(upload.videoAssetId);
      }
      if (_cancel?.isCancelled ?? true) return null;
      _set(ChannelComposePhase.posting, 1);
      final post = await repo.createPost(
        channelId,
        body: body,
        mediaFileIds: [
          for (final p in state.photos)
            if (p.fileId != null) p.fileId!,
        ],
        videoAssetId: assetId,
      );
      posted = true;
      if (ref.mounted) {
        ref.read(channelPostsProvider(channelId).notifier).prepend(post);
        ref.invalidate(channelProvider);
      }
      return post;
    } on Object catch (e) {
      if (assetId != null && !posted) {
        unawaited(repo.cancelVideo(assetId).then((_) {}, onError: (_) {}));
      }
      if (e is DioException && CancelToken.isCancel(e)) return null;
      if (ref.mounted) state = state.copyWith(error: e);
      rethrow;
    } finally {
      if (ref.mounted) {
        state = state.copyWith(phase: ChannelComposePhase.idle, progress: 0);
      }
    }
  }

  /// Polls the video until it can be watched (every 3 s, at most 20 min).
  Future<void> _waitReady(String assetId) async {
    final repo = ref.read(channelsRepositoryProvider);
    final until = DateTime.now().add(const Duration(minutes: 20));
    while (true) {
      String status;
      try {
        status = await repo.videoStatus(assetId);
      } on Object {
        status = 'processing'; // a network blip: ask again
      }
      if (status == 'ready') return;
      if (status == 'failed' || status == 'rejected' || status == 'deleted') {
        throw StateError('video $status');
      }
      if (DateTime.now().isAfter(until)) {
        throw StateError('video processing timed out');
      }
      if (_cancel?.isCancelled ?? true) return;
      await Future<void>.delayed(const Duration(seconds: 3));
      if (!ref.mounted) return;
    }
  }

  Future<XFile> _compressed(
    ChannelVideoDraft v,
    void Function(double progress) onProgress,
    void Function(VideoCompressor c) running,
  ) async {
    // Owner 2026-11-08: the browser re-encodes too (WebCodecs).
    final flags = ref.read(featureFlagsControllerProvider);
    final limits = videoLimitsOf(flags);
    final need = needsVideoCompression(
      shortSide: v.shortSide,
      bytes: v.size,
      durationMs: v.durationSec * 1000,
      limits: limits,
      reencodeAboveKbps: videoReencodeAboveKbpsOf(flags),
      oneEncode: bunnyOneEncodeOf(flags),
      maxBytes: videoMaxBytesOf(flags),
    );
    if (!need) return v.file;
    onProgress(0);
    final compressor = ref.read(videoCompressorProvider);
    running(compressor);
    final out = await compressor.compress(
      v.file,
      limits: limits,
      onProgress: onProgress,
    );
    return out ?? v.file;
  }

  /// Stops a running publish; what was done so far is dropped.
  void cancel() {
    _cancel?.cancel();
    _compressor?.cancel().ignore();
    final claimed = _claimed;
    _claimed = null;
    if (claimed != null) _drop(claimed, ref.read(channelsRepositoryProvider));
    if (ref.mounted) {
      state = state.copyWith(phase: ChannelComposePhase.idle, progress: 0);
    }
  }
}
