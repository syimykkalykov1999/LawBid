import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/widgets.dart' show Size, StringCharacters;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/uploads/application/composer_photo.dart';
import 'package:lawbid/features/uploads/application/upload_queue.dart';

/// Owner 2026-10-08: everything the reel composer hands to the upload
/// queue when «Опубликовать» closes it. Keeps what already went through
/// (the re-encoded file, the uploaded video), so «Повторить» goes on from
/// there.
class ReelDraft {
  ReelDraft({
    required this.file,
    required this.durationMs,
    required this.size,
    required this.coverMs,
    required this.title,
    required this.body,
    this.coverPhoto,
    this.photos = const [],
    this.documents = const [],
    this.place,
    this.commentsEnabled = true,
  });

  final XFile file;
  final int durationMs;

  /// The video's pixel size (decides whether it is re-encoded).
  final Size size;

  /// The cover frame; [coverPhoto] (from the gallery) wins over it.
  final int coverMs;
  final ComposerPhoto? coverPhoto;
  final List<ComposerPhoto> photos;
  final List<PostDocumentRef> documents;
  final String title;
  final String body;
  final String? place;
  final bool commentsEnabled;

  XFile? _encoded;
  String? _assetId;

  /// Seconds as the server checks them against `video.max_duration_sec`.
  int get durationSec => math.max(1, (durationMs / 1000).round());
}

/// Uploads the reel: its photos, the (re-encoded) video to Bunny, then
/// the post. [progress] gets one 0..1 for all of it.
Future<Post> publishReel(
  Ref ref,
  ReelDraft d,
  UploadProgress progress,
) async {
  final actions = ref.read(socialActionsProvider);
  final repo = ref.read(reelsRepositoryProvider);
  final photos = [if (d.coverPhoto != null) d.coverPhoto!, ...d.photos];
  final steps = StepProgress(progress, [
    if (photos.isNotEmpty) 0.1 else 0,
    if (d._encoded == null) 0.25 else 0,
    0.6,
    0.05,
  ]);
  for (var i = 0; i < photos.length; i++) {
    await photos[i].upload(actions);
    steps.step(0, (i + 1) / photos.length);
  }
  final video = d._encoded ??= await _encoded(ref, d, (p) => steps.step(1, p));
  steps.step(1, 1);
  if (d._assetId == null) {
    final upload = await repo.createUpload(
      sizeBytes: await video.length(),
      durationSec: d.durationSec,
      title: d.title.isEmpty ? null : d.title,
      coverTimeMs: d.coverMs,
      coverFileId: d.coverPhoto?.fileId,
    );
    try {
      await repo.upload(video, upload, onProgress: (v) => steps.step(2, v));
    } on Object {
      // A half-sent video is dropped; «Повторить» starts it again.
      repo.cancel(upload.videoAssetId).ignore();
      rethrow;
    }
    d._assetId = upload.videoAssetId;
  }
  steps.step(2, 1);
  final post = await ref.read(socialRepositoryProvider).createPost(
        PostDraft(
          title: d.title.isNotEmpty
              ? d.title
              : d.body.characters.take(60).toString(),
          // The server needs a non-empty text; a reel without a caption
          // reuses its title.
          body: d.body.isNotEmpty ? d.body : d.title,
          videoAssetId: d._assetId,
          mediaFileIds: [for (final p in d.photos) p.fileId!],
          attachments: d.documents,
          locationName: d.place,
          commentsEnabled: d.commentsEnabled,
        ),
      );
  steps.step(3, 1);
  // The author's profile grids and post counters follow at once.
  ref
    ..invalidate(attorneyPostsProvider(post.author.id))
    ..invalidate(publicAttorneyProfileProvider)
    ..invalidate(publicClientProfileProvider);
  return post;
}

/// Owner 2026-10-05: up to Full HD (admin: media.video_max_height) on the
/// phone first — smaller upload, no visible loss; the original is kept
/// when re-encoding fails or would not make it smaller, and in the
/// browser (no encoder there).
Future<XFile> _encoded(
  Ref ref,
  ReelDraft d,
  void Function(double) onProgress,
) async {
  if (kIsWeb) return d.file;
  final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
  final need = needsVideoCompression(
    shortSide: math.min(d.size.width, d.size.height).round(),
    bytes: await d.file.length(),
    durationMs: d.durationMs,
    limits: limits,
  );
  if (!need) return d.file;
  final out = await ref.read(videoCompressorProvider).compress(
        d.file,
        limits: limits,
        onProgress: onProgress,
      );
  return out ?? d.file;
}
