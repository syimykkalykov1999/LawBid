import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/stickers/application/stickers_providers.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The queue kinds of chat media (core/uploads/upload_queue.dart).
abstract final class ChatMediaKind {
  static const prefix = 'chat.';
  static const voice = 'chat.voice';
  static const attachment = 'chat.attachment';
  static const sticker = 'chat.sticker';
  static const all = [voice, attachment, sticker];
}

/// Owner 2026-10-22 (product audit #4 §3, WhatsApp): a voice note, a photo
/// or file and a sticker of a chat are jobs of the persistent upload queue,
/// not in-memory state — closing or killing the app no longer loses them.
/// [prepare] puts the file into storage (the OS background transfer on the
/// phone; the file id is saved, so a restart does not upload it again);
/// [commit] sends the message with the job id as its clientMessageId (the
/// server's unique key: a retry never sends twice).
class ChatMediaHandler extends UploadJobHandler {
  ChatMediaHandler(this.kind, this._ref);

  @override
  final String kind;
  final Ref _ref;

  /// Server message ids of sent voice notes (their file becomes the cache).
  final _sentIds = <String, String>{};

  ChatRepository get _repo => _ref.read(chatRepositoryProvider);

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    if (kind == ChatMediaKind.sticker || job.fileId != null) return;
    final String fileId;
    if (kind == ChatMediaKind.voice) {
      // A note is small: read it whole to tell m4a from a browser's webm.
      final bytes = await scope.bytes();
      if (bytes == null) {
        throw const ApiException(
          code: UploadQueue.localFileMissing,
          message: 'voice',
        );
      }
      if (bytes.length > kVoiceMaxBytes) {
        throw const ApiException(
          code: ApiErrorCodes.fileTooLarge,
          message: 'size',
        );
      }
      final webm = isWebmVoice(bytes);
      fileId = await scope.uploader.upload(
        purpose: api.FilePurpose.chatVoice,
        body: await scope.body(),
        mime: webm ? 'audio/webm' : 'audio/mp4',
        filename: webm ? 'voice.webm' : 'voice.m4a',
        onProgress: scope.reportProgress,
        taskId: job.id,
      );
    } else {
      final body = await scope.body();
      if (await body.length() > kChatAttachmentCeilingBytes) {
        throw const ApiException(
          code: ApiErrorCodes.fileTooLarge,
          message: 'size',
        );
      }
      fileId = await scope.uploader.upload(
        purpose: api.FilePurpose.chatAttachment,
        body: body,
        mime: job.mime ?? 'application/octet-stream',
        onProgress: scope.reportProgress,
        taskId: job.id,
      );
    }
    await scope.saveFileId(fileId);
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final p = job.payload;
    try {
      final ChatMessage sent;
      switch (kind) {
        case ChatMediaKind.voice:
          sent = await _repo.sendVoice(
            job.target,
            job.id,
            fileId: job.fileId!,
            durationMs: (p['durationMs'] as num?)?.toInt() ?? 0,
            waveform: [
              for (final v in (p['waveform'] as List?) ?? const [])
                (v as num).toInt(),
            ],
          );
          _sentIds[job.id] = sent.id;
        case ChatMediaKind.attachment:
          final caption = p['caption'] as String?;
          sent = await _repo.sendAttachment(
            job.target,
            job.id,
            fileId: job.fileId!,
            fileName: p['name'] as String? ?? 'file',
            caption: caption == null || caption.isEmpty ? null : caption,
          );
          unawaited(_ref.read(appSoundsProvider).messageOut());
        default:
          sent = await _repo.sendSticker(
            job.target,
            job.id,
            stickerId: p['stickerId']! as String,
          );
          unawaited(_ref.read(appSoundsProvider).messageOut());
          _ref.invalidate(stickerLibraryProvider);
      }
      // Into the open thread before the job (and its bubble) goes.
      _ref.read(outboxSenderProvider).announceSent(sent);
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.subscriptionRequired) {
        _ref.read(outboxSenderProvider).subscriptionRequired.value = true;
      }
      rethrow;
    }
  }

  @override
  Future<void> removed(UploadJob job, {required bool sent}) async {
    final messageId = _sentIds.remove(job.id);
    if (!sent || messageId == null || kind != ChatMediaKind.voice) return;
    // Your own note plays from the recording, not from a download.
    final n = job.fileName;
    final path =
        n == null ? null : await _ref.read(uploadFilesProvider).pathOf(n);
    await adoptVoiceFileAsCache(path, messageId);
  }
}

/// Registers the chat media handlers on the app's queue (read at sign-in
/// and by every open chat).
final chatMediaOutboxProvider = Provider<UploadQueue>((ref) {
  final queue = ref.watch(uploadQueueProvider);
  for (final kind in ChatMediaKind.all) {
    queue.register(ChatMediaHandler(kind, ref));
  }
  return queue;
});

/// The local bubble of a queued chat job.
ChatMessage chatMessageOfJob(
  UploadJob job, {
  required String? senderId,
  String? localPath,
  Uint8List? previewBytes,
  double progress = 0,
}) {
  final p = job.payload;
  List<int> waveform() => [
        for (final v in (p['waveform'] as List?) ?? const [])
          (v as num).toInt(),
      ];
  return ChatMessage(
    id: 'local:${job.id}',
    conversationId: job.target,
    senderId: senderId,
    kind: switch (job.kind) {
      ChatMediaKind.voice => MessageKind.voice,
      ChatMediaKind.sticker => MessageKind.sticker,
      _ => MessageKind.attachment,
    },
    body: job.kind == ChatMediaKind.attachment
        ? (p['caption'] as String? ?? '')
        : '',
    clientMessageId: job.id,
    createdAt: job.createdAt,
    delivery: job.failed ? DeliveryState.failed : DeliveryState.sending,
    failedCode: job.failedCode,
    voice: job.kind == ChatMediaKind.voice
        ? VoiceNote(
            localPath: localPath,
            durationMs: (p['durationMs'] as num?)?.toInt() ?? 0,
            waveform: waveform(),
            listened: false,
          )
        : null,
    sticker: job.kind == ChatMediaKind.sticker
        ? ChatSticker(
            id: p['stickerId'] as String? ?? '',
            packId: p['packId'] as String? ?? '',
            emoji: p['emoji'] as String? ?? '',
            url: p['url'] as String?,
          )
        : null,
    attachment: job.kind == ChatMediaKind.attachment
        ? ChatAttachment(
            fileId: '',
            name: p['name'] as String? ?? 'file',
            isImage: (job.mime ?? '').startsWith('image/'),
            mime: job.mime,
            sizeBytes: (p['size'] as num?)?.toInt(),
            localBytes: previewBytes,
            width: (p['width'] as num?)?.toInt(),
            height: (p['height'] as num?)?.toInt(),
            progress: progress,
          )
        : null,
  );
}
