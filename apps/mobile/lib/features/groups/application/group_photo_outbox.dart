import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/uploads/queue_refused_notice.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_avatar.dart'
    show uploadGroupPhotoWith;
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The queue kind of a group photo change (core/uploads/upload_queue.dart).
const kGroupPhotoJobKind = 'group.photo';

/// The picked photo of a group, shown at once while it goes up (owner 26.11,
/// WhatsApp / Telegram: the new picture is there the moment it is picked).
/// [url] is the server's photo link once the photo is set on the group: the
/// local picture (the same image) stays while the group still shows that
/// link, so nothing flickers; a later change by anyone shows the new link.
@immutable
class GroupPhotoPreview {
  const GroupPhotoPreview(this.bytes, {this.url});

  final Uint8List bytes;
  final String? url;
}

class GroupPhotoPreviews extends Notifier<Map<String, GroupPhotoPreview>> {
  @override
  Map<String, GroupPhotoPreview> build() => const {};

  void show(String groupId, Uint8List bytes) =>
      state = {...state, groupId: GroupPhotoPreview(bytes)};

  void settle(String groupId, String? url) {
    final p = state[groupId];
    if (p == null) return;
    state = {...state, groupId: GroupPhotoPreview(p.bytes, url: url)};
  }

  /// Back to the group's own photo (a refused or deleted change).
  void drop(String groupId) {
    if (!state.containsKey(groupId)) return;
    state = {...state}..remove(groupId);
  }
}

/// Not auto-disposed: the change outlives the screen it was made on.
final groupPhotoPreviewsProvider =
    NotifierProvider<GroupPhotoPreviews, Map<String, GroupPhotoPreview>>(
  GroupPhotoPreviews.new,
);

/// The picture to show for group [groupId] whose server photo is
/// [serverUrl]: the picked one while it goes up and while the group still
/// shows the photo it became; null = the server's own.
Uint8List? groupPhotoPreview(
  WidgetRef ref,
  String groupId,
  String? serverUrl,
) {
  final p = ref.watch(groupPhotoPreviewsProvider.select((m) => m[groupId]));
  if (p == null) return null;
  return p.url == null || p.url == serverUrl ? p.bytes : null;
}

/// Owner 26.11 (instant like WhatsApp): a group photo change is queued on
/// the app's own upload queue — the picture shows at once, the upload and
/// the server's check run in the background (also after the app was
/// closed) and the photo is set on the group once it is clean.
class GroupPhotoOutbox {
  GroupPhotoOutbox(this._ref, this._queue);

  final Ref _ref;
  final UploadQueue _queue;

  Future<void> submit(String groupId, Uint8List bytes) async {
    _ref.read(groupPhotoPreviewsProvider.notifier).show(groupId, bytes);
    final id = generateIdempotencyKey();
    final name = '$id.photo';
    await _ref.read(uploadFilesProvider).keep(name, bytes: bytes);
    await _queue.enqueue(
      id: id,
      kind: kGroupPhotoJobKind,
      target: 'group:$groupId',
      payload: {'groupId': groupId},
      fileName: name,
      mime: sniffImageMime(bytes),
    );
  }
}

class GroupPhotoHandler extends UploadJobHandler {
  GroupPhotoHandler(this._ref);

  final Ref _ref;

  @override
  String get kind => kGroupPhotoJobKind;

  String _group(UploadJob job) => job.payload['groupId']! as String;

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    if (job.fileId != null) return;
    final bytes = await scope.bytes();
    if (bytes == null) {
      throw const ApiException(
        code: UploadQueue.localFileMissing,
        message: 'The photo is no longer on this device.',
      );
    }
    final fileId = await uploadGroupPhotoWith(
      _ref.read(avatarUploadRepositoryProvider),
      _ref.read(uploadLimitsProvider)[UploadPlace.avatar],
      bytes,
    );
    await scope.saveFileId(fileId);
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final groupId = _group(job);
    final detail = await _ref
        .read(groupRepositoryProvider)
        .update(groupId, api.UpdateGroupDto(avatarFileId: job.fileId));
    _ref.read(groupPhotoPreviewsProvider.notifier).settle(
          groupId,
          detail.avatarUrl,
        );
    _ref.invalidate(groupDetailProvider(groupId));
    _ref.read(groupsProvider.notifier).catchUp();
  }

  @override
  void refused(UploadJob job, String code) {
    // Back to the old photo; the snackbar offers «Повторить».
    _ref.read(groupPhotoPreviewsProvider.notifier).drop(_group(job));
    showQueueRefused(_ref, _ref.read(uploadQueueProvider), job.id, code);
  }

  @override
  Future<void> removed(UploadJob job, {required bool sent}) async {
    if (!sent) _ref.read(groupPhotoPreviewsProvider.notifier).drop(_group(job));
    final n = job.fileName;
    if (n != null) await _ref.read(uploadFilesProvider).remove(n);
  }
}

/// The group-photo outbox on the app's queue.
final groupPhotoOutboxProvider = Provider<GroupPhotoOutbox>((ref) {
  final queue = ref.watch(uploadQueueProvider)
    ..register(GroupPhotoHandler(ref));
  unawaited(showRefusedAtStart(ref, queue, kGroupPhotoJobKind));
  unawaited(restoreGroupPhotoPreviews(ref, queue));
  return GroupPhotoOutbox(ref, queue);
});

/// Owner 26.11: after a restart a group photo still in the queue shows its
/// kept file again (read at start by the shell) until it is set.
Future<void> restoreGroupPhotoPreviews(Ref ref, UploadQueue queue) async {
  final owner = queue.ownerId;
  if (owner == null) return;
  try {
    final rows = await queue.db.ofKind(owner, kGroupPhotoJobKind);
    for (final r in rows) {
      final job = UploadJob.fromRow(r);
      final groupId = job.payload['groupId'] as String?;
      final name = job.fileName;
      // A refused one already went back to the old photo.
      if (groupId == null || name == null || job.failed) continue;
      final bytes = await ref.read(uploadFilesProvider).read(name);
      if (bytes == null || !ref.mounted) continue;
      final shown = ref.read(groupPhotoPreviewsProvider)[groupId];
      if (shown == null) {
        ref.read(groupPhotoPreviewsProvider.notifier).show(groupId, bytes);
      }
    }
  } on Object {
    // The queue's database is not open (signed out): nothing to show.
  }
}
