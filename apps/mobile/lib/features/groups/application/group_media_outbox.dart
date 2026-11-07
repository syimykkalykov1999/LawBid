import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/chat/application/chat_media_outbox.dart'
    show uploadChatAttachmentJob;
import 'package:lawbid/features/groups/application/group_providers.dart'
    show groupRepositoryProvider;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The queue kinds of group media (core/uploads/upload_queue.dart).
abstract final class GroupMediaKind {
  static const prefix = 'group.';
  static const attachment = 'group.attachment';
}

/// R-255 (flag `group_files_from_disk`): a file of a group chat is a job of
/// the persistent upload queue, like one of a one-to-one chat: it survives
/// closing the app and a video or document is sent from disk, not memory.
/// The job's target is the group; a retry never sends twice because the job
/// id is the message's clientMessageId.
class GroupMediaHandler extends UploadJobHandler {
  GroupMediaHandler(this._ref, this._sent);

  final Ref _ref;
  final StreamController<api.GroupMessageDto> _sent;

  @override
  String get kind => GroupMediaKind.attachment;

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    if (job.fileId != null) return;
    await scope.saveFileId(await uploadChatAttachmentJob(job, scope));
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final p = job.payload;
    final caption = p['caption'] as String?;
    final sent = await _ref.read(groupRepositoryProvider).send(
          job.target,
          api.SendGroupMessageDto(
            clientMessageId: job.id,
            type: api.SendGroupMessageDtoType.attachment,
            body: caption == null || caption.isEmpty ? null : caption,
            topicId: p['topicId'] as String?,
            replyToId: p['replyToId'] as String?,
            fileId: job.fileId,
            fileName: p['name'] as String? ?? 'file',
          ),
        );
    // Into the open thread before the job (and its bubble) goes.
    if (!_sent.isClosed) _sent.add(sent);
  }
}

/// Group messages the queue has just sent, for the open thread.
final groupMediaSentProvider =
    Provider<StreamController<api.GroupMessageDto>>((ref) {
  final c = StreamController<api.GroupMessageDto>.broadcast(sync: true);
  ref.onDispose(c.close);
  return c;
});

/// Registers the group media handler on the app's queue (read at sign-in
/// and by every open group).
final groupMediaOutboxProvider = Provider<UploadQueue>((ref) {
  final queue = ref.watch(uploadQueueProvider)
    ..register(GroupMediaHandler(ref, ref.watch(groupMediaSentProvider)));
  return queue;
});
