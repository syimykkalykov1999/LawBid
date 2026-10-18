import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart'
    show showAppSnackBar;
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/support/application/support_providers.dart';
import 'package:lawbid/features/support/domain/support_models.dart';
import 'package:lawbid/shared/presentation/attachment_kit.dart'
    show pickChatFiles;

/// One file on its way to a ticket message.
enum SupportDraftState { uploading, ready, failed }

@immutable
class SupportDraftFile {
  const SupportDraftFile({
    required this.key,
    required this.name,
    required this.mime,
    required this.bytes,
    this.state = SupportDraftState.uploading,
    this.progress = 0,
    this.fileId,
    this.error,
  });

  final int key;
  final String name;
  final String mime;

  /// Kept for the thumbnail (photos).
  final Uint8List bytes;
  final SupportDraftState state;
  final double progress;
  final String? fileId;
  final String? error;

  bool get isImage => mime.startsWith('image/');
  bool get isVideo => mime.startsWith('video/');

  SupportDraftFile copyWith({
    SupportDraftState? state,
    double? progress,
    String? fileId,
    String? error,
  }) =>
      SupportDraftFile(
        key: key,
        name: name,
        mime: mime,
        bytes: bytes,
        state: state ?? this.state,
        progress: progress ?? this.progress,
        fileId: fileId ?? this.fileId,
        error: error ?? this.error,
      );
}

/// Owner 2026-10-18 (OQ-055): the files a user is attaching to a ticket or
/// a reply. Picking (photos and videos from one gallery, camera, files —
/// the chat's picker, videos compressed like in chat) uploads each file at
/// once, so by the time "Send" is pressed they are clean and ready; a
/// thumbnail strip shows progress and lets the user remove one.
class SupportAttachController extends ChangeNotifier {
  SupportAttachController(this._ref);

  final WidgetRef _ref;
  final _files = <SupportDraftFile>[];
  int _next = 0;
  bool _disposed = false;

  List<SupportDraftFile> get files => List.unmodifiable(_files);
  bool get uploading =>
      _files.any((f) => f.state == SupportDraftState.uploading);
  bool get hasFailed => _files.any((f) => f.state == SupportDraftState.failed);

  /// Ready to send: nothing uploading and nothing failed.
  bool get settled => !uploading && !hasFailed;

  int get maxFiles =>
      _ref.read(uploadLimitsProvider)[UploadPlace.support].maxFiles;
  bool get full => _files.length >= maxFiles;

  /// What goes into the message.
  List<SupportAttachment> get attachments => [
        for (final f in _files)
          if (f.state == SupportDraftState.ready && f.fileId != null)
            SupportAttachment(
              fileId: f.fileId!,
              name: f.name,
              mime: f.mime,
              sizeBytes: f.bytes.length,
              isImage: f.isImage,
              isVideo: f.isVideo,
            ),
      ];

  void clear() {
    _files.clear();
    _notify();
  }

  void remove(int key) {
    _files.removeWhere((f) => f.key == key);
    _notify();
  }

  /// The paperclip: pick, then upload what fits under the file limit.
  Future<void> pick(BuildContext context) async {
    final t = _ref.read(translatorProvider);
    final limits = _ref.read(uploadLimitsProvider)[UploadPlace.support];
    final picked = await pickChatFiles(
      context,
      t,
      limits: limits,
      prepareVideo: (v) => _prepareVideo(context, v),
    );
    if (picked.isEmpty || _disposed) return;
    final room = math.max(0, limits.maxFiles - _files.length);
    final take = picked.take(room).toList();
    if (take.length < picked.length && context.mounted) {
      showAppSnackBar(
        context,
        t.t('support.attach.limit', {'count': '${limits.maxFiles}'}),
      );
    }
    for (final p in take) {
      final draft = SupportDraftFile(
        key: _next++,
        name: p.name,
        mime: p.mime,
        bytes: p.bytes,
      );
      _files.add(draft);
      unawaited(_upload(draft));
    }
    _notify();
  }

  Future<void> retry(int key) async {
    final i = _files.indexWhere((f) => f.key == key);
    if (i < 0) return;
    final draft = _files[i].copyWith(
      state: SupportDraftState.uploading,
      progress: 0,
    );
    _files[i] = draft;
    _notify();
    await _upload(draft);
  }

  Future<void> _upload(SupportDraftFile draft) async {
    final t = _ref.read(translatorProvider);
    try {
      final id = await _ref.read(supportRepositoryProvider).uploadFile(
            draft.bytes,
            draft.mime,
            onProgress: (p) => _update(draft.key, progress: p),
          );
      _update(draft.key, state: SupportDraftState.ready, fileId: id);
    } on Object catch (e) {
      _update(
        draft.key,
        state: SupportDraftState.failed,
        error: errorText(t, e),
      );
    }
  }

  void _update(
    int key, {
    SupportDraftState? state,
    double? progress,
    String? fileId,
    String? error,
  }) {
    final i = _files.indexWhere((f) => f.key == key);
    if (i < 0) return; // Removed while uploading.
    _files[i] = _files[i].copyWith(
      state: state,
      progress: progress,
      fileId: fileId,
      error: error,
    );
    _notify();
  }

  /// Like a chat video: re-encoded on the phone to at most 720p before
  /// upload; the original goes when compressing fails or doesn't help.
  Future<XFile> _prepareVideo(BuildContext context, XFile video) async {
    final t = _ref.read(translatorProvider);
    if (context.mounted) {
      showAppSnackBar(context, t.t('chat.attach.videoPreparing'));
    }
    final reel = videoLimitsOf(_ref.read(featureFlagsControllerProvider));
    final limits = (
      maxHeight: reel.maxHeight <= 0 ? 720 : math.min(720, reel.maxHeight),
      frameRate: reel.frameRate,
    );
    final out = await _ref
        .read(videoCompressorProvider)
        .compress(video, limits: limits);
    return out == null
        ? video
        : XFile(out.path, name: 'video.mp4', mimeType: 'video/mp4');
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
