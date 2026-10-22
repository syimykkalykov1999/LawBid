import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart' show Size;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-15: publishing a reel no longer holds the screen — the
/// form closes at once, the video is compressed, uploaded and posted by
/// this job in the background (the card at the top of the feed shows it).
/// Owner 2026-10-19 («шкала — обманка»): after the upload the video is
/// still being processed (Bunny); [processing] says so honestly and the
/// strip turns «Published» only when the reel can really be watched.
enum ReelPublishPhase {
  idle,
  compressing,
  uploading,
  posting,
  processing,
  done,
  failed,
}

/// Owner 2026-10-19: the reel the viewer just published, once it is ready —
/// the Reels tab puts it right after the reel on screen, the feed and the
/// profile show it at once.
final freshOwnReelProvider =
    NotifierProvider<FreshOwnReel, Post?>(FreshOwnReel.new);

class FreshOwnReel extends Notifier<Post?> {
  @override
  Post? build() => null;

  // ignore: use_setters_to_change_properties
  void announce(Post p) => state = p;
}

class ReelPublishState {
  const ReelPublishState({
    this.phase = ReelPublishPhase.idle,
    this.progress = 0,
    this.error,
    this.uploadFrom = 0,
  });

  final ReelPublishPhase phase;

  /// 0…1 within the current phase.
  final double progress;
  final Object? error;

  /// Owner 2026-10-22 (Instagram, one line for the whole publish): where
  /// the upload starts on the line — after the compression's share when the
  /// phone compressed the video, else from the very start.
  final double uploadFrom;

  /// The share of the compression on the line.
  static const compressShare = 0.3;

  /// 0…1 of the whole publish (compression, then the upload); 1 after.
  double get overall => switch (phase) {
        ReelPublishPhase.compressing => progress * compressShare,
        ReelPublishPhase.uploading => uploadFrom + progress * (1 - uploadFrom),
        ReelPublishPhase.idle || ReelPublishPhase.failed => 0,
        _ => 1,
      };

  bool get busy =>
      phase == ReelPublishPhase.compressing ||
      phase == ReelPublishPhase.uploading ||
      phase == ReelPublishPhase.posting ||
      phase == ReelPublishPhase.processing;
}

/// Everything the job needs, captured when «Publish» is pressed.
class ReelPublishRequest {
  const ReelPublishRequest({
    required this.file,
    required this.cut,
    required this.previewSize,
    required this.title,
    required this.text,
    required this.place,
    required this.commentsEnabled,
    required this.photoIds,
    required this.attachments,
    this.coverFileId,
    this.cover,
  });

  final XFile file;
  final ReelCut cut;
  final Size previewSize;
  final String title;
  final String text;
  final String place;
  final bool commentsEnabled;
  final List<String> photoIds;
  final List<PostDocumentRef> attachments;

  /// A cover picked from the gallery (an uploaded post image), if any.
  final String? coverFileId;

  /// Owner 2026-10-22 (Instagram): the cover the form showed — the publish
  /// card's thumbnail from the first moment.
  final Uint8List? cover;
}

class ReelPublishJob extends Notifier<ReelPublishState> {
  CancelToken? _cancel;
  VideoCompressor? _compressor;
  ReelPublishRequest? _last;

  @override
  ReelPublishState build() => const ReelPublishState();

  /// The reel being published (or the failed one «Retry» sends again).
  ReelPublishRequest? get request => _last;

  Future<void> start(ReelPublishRequest r) async {
    if (state.busy) return;
    _last = r;
    state = const ReelPublishState(phase: ReelPublishPhase.compressing);
    _cancel = CancelToken();
    final repo = ref.read(reelsRepositoryProvider);
    String? assetId;
    try {
      final video = await _compressed(r);
      if (_cancel?.isCancelled ?? true) return;
      final from =
          identical(video, r.file) ? 0.0 : ReelPublishState.compressShare;
      state = ReelPublishState(
        phase: ReelPublishPhase.uploading,
        uploadFrom: from,
      );
      final upload = await repo.createUpload(
        sizeBytes: await video.length(),
        durationSec: r.cut.sourceSec,
        title: r.title.isEmpty ? null : r.title,
        trimStartMs: r.cut.trimmed ? r.cut.startMs : null,
        trimEndMs: r.cut.trimmed ? r.cut.endMs : null,
        coverTimeMs: r.cut.coverMs,
        coverFileId: r.coverFileId,
      );
      assetId = upload.videoAssetId;
      await repo.upload(
        video,
        upload,
        cancel: _cancel,
        onProgress: (v) => state = ReelPublishState(
          phase: ReelPublishPhase.uploading,
          progress: v,
          uploadFrom: from,
        ),
      );
      state = const ReelPublishState(
        phase: ReelPublishPhase.posting,
        progress: 1,
      );
      final social = ref.read(socialRepositoryProvider);
      final created = await social.createPost(
        PostDraft(
          // Owner 2026-10-18: the title and the description as typed —
          // both optional, a reel's video is enough.
          title: r.title,
          body: r.text,
          videoAssetId: upload.videoAssetId,
          mediaFileIds: r.photoIds,
          attachments: r.attachments,
          locationName: r.place.isEmpty ? null : r.place,
          commentsEnabled: r.commentsEnabled,
        ),
      );
      // Owner 2026-10-19: «Published» only once the video plays — until then
      // «The video is processing…» (the upload alone is not the end).
      state = const ReelPublishState(phase: ReelPublishPhase.processing);
      final ready = await _waitReady(social, created);
      if (ready == null) return; // cancelled / replaced
      _announce(ready);
      state = const ReelPublishState(phase: ReelPublishPhase.done, progress: 1);
    } on Object catch (e) {
      if (assetId != null) repo.cancel(assetId).ignore();
      if (e is DioException && CancelToken.isCancel(e)) {
        state = const ReelPublishState();
      } else {
        state = ReelPublishState(phase: ReelPublishPhase.failed, error: e);
      }
    }
  }

  /// Polls the new post until its video is ready (or failed): every 3 s,
  /// for at most 20 minutes. Null when another publish took over.
  Future<Post?> _waitReady(SocialRepository social, Post created) async {
    var post = created;
    final until = DateTime.now().add(const Duration(minutes: 20));
    while (post.video != null && !post.video!.ready) {
      if (post.video!.status == 'failed') {
        throw StateError('video processing failed');
      }
      if (DateTime.now().isAfter(until)) {
        throw StateError('video processing timed out');
      }
      await Future<void>.delayed(const Duration(seconds: 3));
      if (state.phase != ReelPublishPhase.processing) return null;
      try {
        post = await social.post(created.id);
      } on Object {
        // A network blip: try again on the next tick.
      }
    }
    return post;
  }

  /// The ready reel shows at once: first in the feed, in the own profile's
  /// Reels, and next in the Reels tab.
  void _announce(Post post) {
    try {
      ref.read(feedProvider.notifier).prepend(post);
    } on Object {
      // The feed is not loaded: it reads the reel when it opens.
    }
    final me = ref.read(currentUserIdProvider);
    if (me != null) ref.invalidate(attorneyReelsProvider(me));
    ref.read(freshOwnReelProvider.notifier).announce(post);
  }

  /// Up to the admin's height on the phone first (smaller upload).
  Future<XFile> _compressed(ReelPublishRequest r) async {
    if (kIsWeb) return r.file;
    final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final need = needsVideoCompression(
      shortSide: math.min(r.previewSize.width, r.previewSize.height).round(),
      bytes: await r.file.length(),
      durationMs: r.cut.totalMs,
      limits: limits,
    );
    if (!need) return r.file;
    final compressor = ref.read(videoCompressorProvider);
    _compressor = compressor;
    final out = await compressor.compress(
      r.file,
      limits: limits,
      onProgress: (p) => state = ReelPublishState(
        phase: ReelPublishPhase.compressing,
        progress: p,
      ),
    );
    return out ?? r.file;
  }

  void cancel() {
    _cancel?.cancel();
    _compressor?.cancel().ignore();
    state = const ReelPublishState();
  }

  /// Try again after a failure.
  Future<void> retry() async {
    final r = _last;
    if (r != null) await start(r);
  }

  void dismiss() => state = const ReelPublishState();
}

final reelPublishJobProvider =
    NotifierProvider<ReelPublishJob, ReelPublishState>(ReelPublishJob.new);
