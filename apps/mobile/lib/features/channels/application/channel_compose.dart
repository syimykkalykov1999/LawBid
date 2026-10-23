import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
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

  @override
  ChannelComposeState build() {
    ref.onDispose(() => _cancel?.cancel());
    return const ChannelComposeState();
  }

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
    state = state.copyWith(video: v, clearError: true);
  }

  void removeVideo() {
    if (state.busy) return;
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
    try {
      if (video != null) {
        final file = await _compressed(video);
        if (_cancel?.isCancelled ?? true) return null;
        _set(ChannelComposePhase.uploading);
        final upload = await repo.createVideoUpload(
          sizeBytes: await file.length(),
          durationSec: video.durationSec,
        );
        assetId = upload.videoAssetId;
        await repo.uploadVideo(
          file,
          upload,
          cancel: _cancel,
          onProgress: (v) => _set(ChannelComposePhase.uploading, v),
        );
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

  Future<XFile> _compressed(ChannelVideoDraft v) async {
    if (kIsWeb) return v.file;
    final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final need = needsVideoCompression(
      shortSide: v.shortSide,
      bytes: v.size,
      durationMs: v.durationSec * 1000,
      limits: limits,
    );
    if (!need) return v.file;
    _set(ChannelComposePhase.compressing);
    final compressor = ref.read(videoCompressorProvider);
    _compressor = compressor;
    final out = await compressor.compress(
      v.file,
      limits: limits,
      onProgress: (p) => _set(ChannelComposePhase.compressing, p),
    );
    return out ?? v.file;
  }

  /// Stops a running publish; what was done so far is dropped.
  void cancel() {
    _cancel?.cancel();
    _compressor?.cancel().ignore();
    if (ref.mounted) {
      state = state.copyWith(phase: ChannelComposePhase.idle, progress: 0);
    }
  }
}
