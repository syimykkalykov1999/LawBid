import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_media_seed.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/stickers/application/stickers_providers.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

// Owner row 106: group chats keep their sent media the same way.
export 'package:lawbid/features/chat/data/chat_media_seed.dart'
    show adoptSentChatMedia;
// Group voice notes keep the recorded file as their cache (groups goes
// through this layer, test/architecture/feature_boundaries_test.dart).
export 'package:lawbid/features/chat/data/voice_files.dart'
    show adoptVoiceFileAsCache;

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

  /// Owner row 106: the server's attachment of a sent photo / video (its
  /// file becomes the phone's cached copy, see [adoptSentChatMedia]).
  final _sentMedia = <String, ChatAttachment>{};

  ChatRepository get _repo => _ref.read(chatRepositoryProvider);

  /// Item 25, PR 4: the job's sealed payload once its file went up
  /// encrypted (the key stays in the job on this device until it is sent).
  static const e2eeKey = 'e2ee';

  @override
  Future<void> prepare(UploadJob job, UploadJobScope scope) async {
    if (kind == ChatMediaKind.sticker || job.fileId != null) return;
    final repo = _repo;
    final e2ee = repo is ApiChatRepository ? repo.e2ee : null;
    if (e2ee != null && await _encrypted(e2ee, job, scope)) return;
    final String fileId;
    if (kind == ChatMediaKind.voice) {
      fileId = await uploadChatVoiceJob(job, scope);
    } else {
      fileId = await uploadChatAttachmentJob(job, scope);
    }
    await scope.saveFileId(fileId);
  }

  /// WhatsApp: in an end-to-end encrypted chat the phone encrypts the file
  /// and uploads only ciphertext. False when the chat is not encrypted (the
  /// file goes the normal, scanned way).
  Future<bool> _encrypted(
    E2eeService e2ee,
    UploadJob job,
    UploadJobScope scope,
  ) async {
    final bytes = await scope.bytes();
    if (bytes == null) {
      throw const ApiException(
        code: UploadQueue.localFileMissing,
        message: 'e2ee',
      );
    }
    final p = job.payload;
    final voice = kind == ChatMediaKind.voice;
    final webm = voice && isWebmVoice(bytes);
    final caption = p['caption'] as String?;
    final r = await e2ee.encryptFile(
      job.target,
      bytes,
      name: voice
          ? (webm ? 'voice.webm' : 'voice.m4a')
          : p['name'] as String? ?? 'file',
      mime: voice
          ? (webm ? 'audio/webm' : 'audio/mp4')
          : job.mime ?? 'application/octet-stream',
      width: (p['width'] as num?)?.toInt(),
      height: (p['height'] as num?)?.toInt(),
      durationMs: voice ? (p['durationMs'] as num?)?.toInt() ?? 0 : null,
      waveform: voice
          ? [
              for (final v in (p['waveform'] as List?) ?? const [])
                (v as num).toInt(),
            ]
          : null,
      caption: caption == null || caption.isEmpty ? null : caption,
      replyToId: p['replyToId'] as String?,
    );
    if (r == null) return false;
    scope.reportProgress(1);
    await scope.saveProgress({e2eeKey: r.payload.toJson()});
    await scope.saveFileId(r.fileId);
    return true;
  }

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final p = job.payload;
    final sealed = job.progress[e2eeKey];
    final repo = _repo;
    try {
      final ChatMessage sent;
      if (sealed is Map && repo is ApiChatRepository) {
        sent = await repo.sendSealedFile(
          job.target,
          job.id,
          E2eePayload.fromJson(Map<String, dynamic>.from(sealed)),
          fileId: job.fileId!,
        );
        if (kind == ChatMediaKind.voice) {
          _sentIds[job.id] = sent.id;
        } else {
          unawaited(_ref.read(appSoundsProvider).messageOut());
        }
        _ref.read(outboxSenderProvider).announceSent(sent);
        return;
      }
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
            replyToId: p['replyToId'] as String?,
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
            replyToId: p['replyToId'] as String?,
          );
          final media = sent.attachment;
          if (media != null) _sentMedia[job.id] = media;
          unawaited(_ref.read(appSoundsProvider).messageOut());
        default:
          sent = await _repo.sendSticker(
            job.target,
            job.id,
            stickerId: p['stickerId']! as String,
            replyToId: p['replyToId'] as String?,
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
    final media = _sentMedia.remove(job.id);
    if (sent && media != null) {
      final n = job.fileName;
      await adoptSentChatMedia(
        media,
        n == null ? null : await _ref.read(uploadFilesProvider).pathOf(n),
      );
      return;
    }
    if (!sent || messageId == null || kind != ChatMediaKind.voice) return;
    // Your own note plays from the recording, not from a download.
    final n = job.fileName;
    final path =
        n == null ? null : await _ref.read(uploadFilesProvider).pathOf(n);
    await adoptVoiceFileAsCache(path, messageId);
  }
}

/// Owner 24.11 (Telegram / Signal outgoing queue: sending → sent): the
/// saved progress key of a file whose bytes are already in storage and
/// confirmed; only its antivirus scan is still awaited.
const kStoredFileKey = 'storedFileId';

/// The file id kept by [_keepStored] (null: the bytes still have to go).
String? storedFileOf(UploadJob job) => job.progress[kStoredFileKey] as String?;

/// Hands the uploader the step that keeps a stored file in the job: a slow
/// scan is then waited for again, the bytes are never sent twice.
Future<void> Function(String) _keepStored(UploadJobScope scope) => (id) async {
      scope.reportProgress(1);
      await scope.saveProgress({kStoredFileKey: id});
    };

/// A job whose file is already stored: nothing is uploaded again. M3 (owner
/// 25.11, Slack / Telegram): the message does not wait for the scan either
/// (the server shows the file to the others once it is clean); only a file
/// the scan already refused stops. Null when the server no longer has that
/// file (then it is uploaded again).
Future<String?> _waitStored(UploadJob job, UploadJobScope scope) async {
  final stored = storedFileOf(job);
  if (stored == null) return null;
  scope.reportProgress(1);
  try {
    return await scope.uploader.waitStored(stored, waitScan: false);
  } on ApiException catch (e) {
    if (e.statusCode != 404 && e.code != ApiErrorCodes.notFound) rethrow;
    await scope.saveProgress({kStoredFileKey: null});
    return null;
  }
}

/// Sends the note of a chat or group voice job to storage (`chat_voice`,
/// m4a, or webm from a browser) and returns its file id.
Future<String> uploadChatVoiceJob(UploadJob job, UploadJobScope scope) async {
  final stored = await _waitStored(job, scope);
  if (stored != null) return stored;
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
  return scope.uploader.upload(
    purpose: api.FilePurpose.chatVoice,
    body: await scope.body(),
    mime: webm ? 'audio/webm' : 'audio/mp4',
    filename: webm ? 'voice.webm' : 'voice.m4a',
    onProgress: scope.reportProgress,
    cancel: scope.cancelToken,
    taskId: job.id,
    savedTarget: StorageTarget.fromJson(job.progress['target']),
    onTarget: (t) => scope.saveProgress({'target': t.toJson()}),
    onStored: _keepStored(scope),
    waitScan: false,
  );
}

/// Sends the file of a chat or group attachment job to storage (streamed
/// from disk on the phone) and returns its file id.
Future<String> uploadChatAttachmentJob(
  UploadJob job,
  UploadJobScope scope,
) async {
  final stored = await _waitStored(job, scope);
  if (stored != null) return stored;
  final body = await scope.body();
  if (await body.length() > kChatAttachmentCeilingBytes) {
    throw const ApiException(
      code: ApiErrorCodes.fileTooLarge,
      message: 'size',
    );
  }
  return scope.uploader.upload(
    purpose: api.FilePurpose.chatAttachment,
    body: body,
    mime: job.mime ?? 'application/octet-stream',
    onProgress: scope.reportProgress,
    cancel: scope.cancelToken,
    taskId: job.id,
    savedTarget: StorageTarget.fromJson(job.progress['target']),
    onTarget: (t) => scope.saveProgress({'target': t.toJson()}),
    // R-251: parts already in storage are not sent again after a restart.
    resumeFileId: job.progress['partsFileId'] as String?,
    onPartsFileId: (id) => unawaited(scope.saveProgress({'partsFileId': id})),
    onStored: _keepStored(scope),
    waitScan: false,
  );
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

  /// Row 188: the quote the bubble shows while it is sent.
  ReplyPreview? replyTo,
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
    replyTo: replyTo,
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
            // Owner 24.11: bytes in storage (also after a restart) = 1, so
            // the bubble stops its ring while only the server's scan runs.
            progress:
                job.fileId != null || storedFileOf(job) != null ? 1 : progress,
          )
        : null,
  );
}
