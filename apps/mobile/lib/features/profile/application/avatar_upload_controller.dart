import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';

enum AvatarUploadStage { idle, preparing, uploading, checking, done, failed }

@immutable
class AvatarUploadState {
  const AvatarUploadState({
    this.stage = AvatarUploadStage.idle,
    this.progress = 0,
    this.preview,
    this.error,
  });

  final AvatarUploadStage stage;

  /// 0..1 of the storage upload.
  final double progress;

  /// The picked image, shown in the avatar while it uploads.
  final Uint8List? preview;
  final Object? error;

  bool get busy =>
      stage == AvatarUploadStage.preparing ||
      stage == AvatarUploadStage.uploading ||
      stage == AvatarUploadStage.checking;
}

/// Local, pre-network rejection (wrong type / too large) — surfaced with
/// the same localized texts as the server codes.
ApiException _local(String code) => ApiException(code: code, message: code);

/// Profile photo upload (docs/03 §4.1, stage 3.2 pipeline, OQ-012): pick →
/// presign → POST to storage with progress → confirm → wait for the scan →
/// attach to the account. [retry] repeats the whole pipeline with the same
/// bytes (a new presign, since links expire after 5 minutes).
class AvatarUploadController extends Notifier<AvatarUploadState> {
  Uint8List? _bytes;

  /// The in-flight pipeline's cancel handle; cancelled when the provider
  /// is disposed (screen left), which aborts the storage POST and stops
  /// the scan poll.
  UploadCancellation? _cancellation;

  /// The running pipeline (null when idle). «Сохранить» on the profile
  /// editors waits for it, so the photo is attached before the screen goes.
  Future<void>? _running;

  /// Completes when no photo is on its way (at once when idle). Never
  /// throws: a failed photo is shown on the field, not by the waiter.
  Future<void> get settled => _running ?? Future<void>.value();

  /// Poll cadence / limit while the antivirus scan is pending (owner
  /// 2026-11-08: twice a second, the same 30 s in all; a ~2 s check on R2
  /// used to show the photo up to a second late).
  static const pollInterval = Duration(milliseconds: 500);
  static const maxPolls = 60;

  @override
  AvatarUploadState build() {
    // Owner 2026-11-08 (instant like Instagram/Telegram): the picked photo is
    // the avatar at once and goes up in the background for the whole app
    // session — leaving the screen or «Сохранить» never stops it. Another
    // account starts clean.
    ref.watch(currentUserControllerProvider.select((s) => s.user?.id));
    ref.onDispose(() => _cancellation?.cancel());
    return const AvatarUploadState();
  }

  Future<void> start(Uint8List bytes) async {
    if (state.busy) return;
    _bytes = bytes;
    await _track(_run());
  }

  Future<void> retry() async {
    if (state.busy || _bytes == null) return;
    await _track(_run());
  }

  Future<void> _track(Future<void> run) async {
    _running = run;
    try {
      await run;
    } finally {
      if (identical(_running, run)) _running = null;
    }
  }

  Future<void> _run() async {
    final bytes = _bytes!;
    final repo = ref.read(avatarUploadRepositoryProvider);
    final cancellation = _cancellation = UploadCancellation();
    state =
        AvatarUploadState(stage: AvatarUploadStage.preparing, preview: bytes);
    try {
      final mime = sniffImageMime(bytes);
      final limits = ref.read(uploadLimitsProvider)[UploadPlace.avatar];
      // Owner 2026-10-19: a photo type the admin has off here is refused at
      // once (not after the upload).
      if (mime == null || !limits.photoMimes.contains(mime)) {
        throw _local(ApiErrorCodes.fileTypeNotAllowed);
      }
      // Owner 2026-10-07 (bug 17): the admin's «Фото профиля» MB.
      if (bytes.length > limits.fileBytes) {
        throw _local(ApiErrorCodes.fileTooLarge);
      }
      final target = await repo.presign(
        mime: mime,
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
      );
      var outcome = ScanOutcome.clean;
      if (!target.alreadyStored) {
        _set(AvatarUploadStage.uploading, 0);
        await repo.upload(
          target,
          bytes,
          mime,
          onProgress: (p) => _set(AvatarUploadStage.uploading, p),
          cancellation: cancellation,
        );
        if (cancellation.isCancelled) return;
        _set(AvatarUploadStage.checking, 1);
        outcome = await repo.confirm(target.fileId);
      }
      for (var i = 0; outcome == ScanOutcome.pending && i < maxPolls; i++) {
        await Future<void>.delayed(pollInterval);
        if (cancellation.isCancelled || !ref.mounted) return;
        outcome = await repo.scanStatus(target.fileId);
      }
      if (cancellation.isCancelled) return;
      if (outcome != ScanOutcome.clean) {
        throw _local(ApiErrorCodes.fileNotAttachable);
      }
      final me = await repo.attach(target.fileId);
      if (!ref.mounted) return;
      ref.read(currentUserControllerProvider.notifier).apply(me);
      // Owner 2026-11-04: an attorney's profile screen reads these two, not
      // the current user; without this the old picture stayed after «Фото
      // обновлено» until the next full read.
      final username = me.attorneyProfile?.username;
      if (username != null) {
        ref
          ..invalidate(ownAttorneyProfileProvider)
          ..invalidate(publicAttorneyProfileProvider(username));
      }
      state = AvatarUploadState(
        stage: AvatarUploadStage.done,
        progress: 1,
        preview: bytes,
      );
    } on UploadCancelledException {
      return;
    } catch (e) {
      if (ref.mounted && !cancellation.isCancelled) {
        state = AvatarUploadState(
          stage: AvatarUploadStage.failed,
          preview: bytes,
          error: e,
        );
      }
    } finally {
      if (identical(_cancellation, cancellation)) _cancellation = null;
    }
  }

  void _set(AvatarUploadStage stage, double progress) {
    if (!ref.mounted) return;
    state = AvatarUploadState(
      stage: stage,
      progress: progress,
      preview: state.preview,
    );
  }
}

/// Not auto-disposed: the upload outlives the screen (see [build]).
final avatarUploadControllerProvider =
    NotifierProvider<AvatarUploadController, AvatarUploadState>(
  AvatarUploadController.new,
);
