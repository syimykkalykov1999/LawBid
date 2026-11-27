import 'dart:async';
import 'dart:io' show File, FileSystemException;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_media_seed.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/chat_video_frames.dart';
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
    // Owner 27.11 (WhatsApp / Telegram): a picked video was sent at once;
    // the phone's hardware encoder shrinks it here, before its bytes go.
    final ready = kind == ChatMediaKind.attachment
        ? await encodeQueuedVideo(
            job,
            scope,
            _ref.read(videoCompressorProvider),
          )
        : job;
    final repo = _repo;
    final e2ee = repo is ApiChatRepository ? repo.e2ee : null;
    if (e2ee != null && await _encrypted(e2ee, ready, scope)) return;
    final String fileId;
    if (kind == ChatMediaKind.voice) {
      fileId = await uploadChatVoiceJob(job, scope);
    } else {
      fileId = await uploadChatAttachmentJob(ready, scope);
    }
    await scope.saveFileId(fileId);
  }

  /// WhatsApp: in an end-to-end encrypted chat the phone encrypts the file
  /// and uploads only ciphertext. False when the chat is not encrypted —
  /// decided from the chat's state BEFORE any byte is read, so a plain
  /// chat's file still streams from disk the normal, scanned way. The
  /// encrypted one goes 64 KiB at a time from disk to disk; its key never
  /// goes into the plain upload queue (it waits in the E2EE store).
  Future<bool> _encrypted(
    E2eeService e2ee,
    UploadJob job,
    UploadJobScope scope,
  ) async {
    if (!await e2ee.encryptsFiles(job.target)) return false;
    final p = job.payload;
    final voice = kind == ChatMediaKind.voice;
    final body = await scope.body();
    final size = await body.length();
    if (size > (voice ? kVoiceMaxBytes : kChatAttachmentCeilingBytes)) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final mime = queuedMimeOf(job);
    // A voice note is small (m4a or a browser's webm); a photo's bytes make
    // its blurhash preview. Anything else is never read whole.
    final small =
        voice || (mime.startsWith('image/') && size <= _previewMaxBytes)
            ? await scope.bytes()
            : null;
    final webm = voice && small != null && isWebmVoice(small);
    final caption = p['caption'] as String?;
    final r = await e2ee.encryptFile(
      job.target,
      body,
      name: voice
          ? (webm ? 'voice.webm' : 'voice.m4a')
          : queuedNameOf(job),
      mime: voice ? (webm ? 'audio/webm' : 'audio/mp4') : mime,
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
      preview: small,
      localPath: await scope.filePath(),
    );
    if (r == null) return false;
    scope.reportProgress(1);
    final sealed = r.payload.toJson();
    final fk = sealed.remove('fk')! as String;
    await e2ee.keepOutgoingKey(job.id, job.target, fk);
    await scope.saveProgress({e2eeKey: sealed});
    await scope.saveFileId(r.fileId);
    return true;
  }

  /// A photo up to this size is read once for its blurhash preview.
  static const _previewMaxBytes = 20 * 1024 * 1024;

  @override
  Future<void> commit(UploadJob job, UploadJobScope scope) async {
    final p = job.payload;
    final sealed = job.progress[e2eeKey];
    final repo = _repo;
    try {
      final ChatMessage sent;
      final e2ee = repo is ApiChatRepository ? repo.e2ee : null;
      if (sealed is Map && repo is ApiChatRepository && e2ee != null) {
        final fk = await e2ee.outgoingKey(job.id);
        if (fk == null) {
          throw const ApiException(
            code: UploadQueue.localFileMissing,
            message: 'e2ee',
          );
        }
        sent = await repo.sendSealedFile(
          job.target,
          job.id,
          E2eePayload.fromJson({
            ...Map<String, dynamic>.from(sealed),
            'fk': fk,
          }),
          fileId: job.fileId!,
        );
        await e2ee.dropOutgoingKey(job.id);
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
          // Owner 27.11: the server's answer (and its realtime echo, which
          // may come first) has no width / height while it still checks
          // the file; the picked shape stands in for it.
          SentMediaShapes.note(
            job.fileId!,
            (p['width'] as num?)?.toInt(),
            (p['height'] as num?)?.toInt(),
          );
          final got = await _repo.sendAttachment(
            job.target,
            job.id,
            fileId: job.fileId!,
            fileName: queuedNameOf(job),
            caption: caption == null || caption.isEmpty ? null : caption,
            replyToId: p['replyToId'] as String?,
          );
          final media = got.attachment;
          if (media != null) _sentMedia[job.id] = media;
          sent = media == null
              ? got
              : got.copyWith(attachment: media.withSentShape());
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
    mime: queuedMimeOf(job),
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

/// Owner 27.11 (WhatsApp / Telegram: a picked video goes at once): the
/// payload key of a queued video that is still as recorded — the height
/// and frame rate the phone's hardware encoder shrinks it to before upload
/// ([encodeQueuedVideo]); the bubble shows meanwhile.
const kEncodeVideoKey = 'encodeVideo';

/// The saved progress keys of that step: done (encoded or kept as it was),
/// and the encoded file's type and name (an MP4).
const kVideoEncodedKey = 'videoEncoded';
const kVideoMimeKey = 'videoMime';
const kVideoNameKey = 'videoName';

/// The [kEncodeVideoKey] payload for a chat or group video: the admin's
/// `media.chat_video_max_height` and frame rate ([chatVideoLimitsOf]); null
/// when chat videos go as recorded (0) or in the browser (it encodes before
/// the send, its queue file is not on a disk).
Map<String, Object?>? encodeVideoPayload(FeatureFlagsState flags) {
  if (kIsWeb) return null;
  final l = chatVideoLimitsOf(flags);
  if (l.maxHeight <= 0) return null;
  return {'maxHeight': l.maxHeight, 'frameRate': l.frameRate};
}

/// The queue file of attachment [cmid]: a video keeps its own extension
/// (the phone's video readers go by it), anything else `.bin`.
String queuedAttachmentFile(String cmid, String name, String mime) {
  if (!mime.startsWith('video/')) return '$cmid.bin';
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  const known = {'mp4', 'mov', 'm4v', '3gp', 'webm'};
  return '$cmid.${known.contains(ext) ? ext : 'mp4'}';
}

/// Gallery videos handed over as recorded (the pickers' `deferVideo`), by
/// path: the ones the upload queue encodes. A document picked in «Files»
/// goes as it is (WhatsApp's «Document»).
final _recordedVideos = <String>{};

/// Notes [path] as a gallery video still as recorded.
void markRecordedVideo(String path) {
  if (path.isEmpty) return;
  if (_recordedVideos.length > 200) {
    _recordedVideos.remove(_recordedVideos.first);
  }
  _recordedVideos.add(path);
}

/// Whether [path] is such a video (sending it takes it off the list).
bool isRecordedVideo(String? path) =>
    path != null && _recordedVideos.remove(path);

/// The first frame of a queued or picked video on this phone (the sending
/// bubble's picture); null in the browser or when it cannot be made.
Future<Uint8List?> queuedVideoFrame(String? path) async =>
    path == null ? null : (await ChatVideoFrames.instance.ofFile(path))?.jpeg;

/// The type the job's file goes up as (an encoded video is an MP4).
String queuedMimeOf(UploadJob job) =>
    job.progress[kVideoMimeKey] as String? ??
    job.mime ??
    'application/octet-stream';

/// The file name the message carries (an encoded video's is `.mp4`).
String queuedNameOf(UploadJob job) =>
    job.progress[kVideoNameKey] as String? ??
    job.payload['name'] as String? ??
    'file';

/// Owner 27.11 (WhatsApp / Telegram): a chat or group video picked as
/// recorded is shrunk here, in the upload queue, by the phone's hardware
/// encoder ([VideoCompressor], the same settings as before) — the bubble
/// with its first frame and ring is already on screen. The encoded MP4
/// replaces the queue's file (so a restart never encodes again and the sent
/// file is the phone's cached copy); the original goes when encoding fails
/// or doesn't help. A job whose upload has begun is never touched. Returns
/// the job as the next step sees it.
Future<UploadJob> encodeQueuedVideo(
  UploadJob job,
  UploadJobScope scope,
  VideoCompressor compressor,
) async {
  final c = job.payload[kEncodeVideoKey];
  final pr = job.progress;
  if (c is! Map ||
      pr[kVideoEncodedKey] == true ||
      job.fileId != null ||
      storedFileOf(job) != null ||
      pr['target'] != null ||
      pr['partsFileId'] != null) {
    return job;
  }
  final path = await scope.filePath();
  if (path == null) return job;
  final limits = (
    maxHeight: (c['maxHeight'] as num?)?.toInt() ?? 720,
    frameRate: (c['frameRate'] as num?)?.toInt() ?? 30,
  );
  XFile? out;
  try {
    out = await compressor.compress(XFile(path), limits: limits);
  } on Object catch (e) {
    debugPrint('chat video encode: $e');
    out = null;
  }
  final update = <String, Object?>{kVideoEncodedKey: true};
  if (out != null) {
    if (scope.cancelToken.isCancelled) {
      await _deleteQuietly(out.path);
      return job;
    }
    try {
      try {
        await File(out.path).rename(path);
      } on FileSystemException {
        // Another volume: copy over, then remove.
        await File(out.path).copy(path);
        await _deleteQuietly(out.path);
      }
      final name = queuedNameOf(job);
      final dot = name.lastIndexOf('.');
      update[kVideoMimeKey] = 'video/mp4';
      update[kVideoNameKey] = '${dot < 0 ? name : name.substring(0, dot)}.mp4';
    } on Object catch (e) {
      // The original stays the queue's file and goes as it is.
      debugPrint('chat video keep: $e');
    }
  }
  await scope.saveProgress(update);
  return UploadJob(
    id: job.id,
    ownerId: job.ownerId,
    kind: job.kind,
    target: job.target,
    payload: job.payload,
    createdAt: job.createdAt,
    fileName: job.fileName,
    mime: job.mime,
    fileId: job.fileId,
    progress: {...pr, ...update},
    attempts: job.attempts,
    failedCode: job.failedCode,
  );
}

Future<void> _deleteQuietly(String path) async {
  try {
    await File(path).delete();
  } on Object {
    // Left for the OS to clean.
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

/// The file of a queued attachment job as the bubble draws it while it is
/// sent: the picker's bytes as its picture, its size and its progress. Used
/// by the 1:1 chat and by groups (owner 26.11: the same bubble).
ChatAttachment chatAttachmentOfJob(
  UploadJob job, {
  Uint8List? previewBytes,
  double progress = 0,
}) {
  final p = job.payload;
  return ChatAttachment(
    fileId: '',
    name: p['name'] as String? ?? 'file',
    isImage: (job.mime ?? '').startsWith('image/'),
    mime: job.mime,
    sizeBytes: (p['size'] as num?)?.toInt(),
    localBytes: previewBytes,
    width: (p['width'] as num?)?.toInt(),
    height: (p['height'] as num?)?.toInt(),
    // Owner 24.11: bytes in storage (also after a restart) = 1, so the
    // bubble stops its ring while only the server's scan runs.
    progress: job.fileId != null || storedFileOf(job) != null ? 1 : progress,
  );
}

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
        ? chatAttachmentOfJob(
            job,
            previewBytes: previewBytes,
            progress: progress,
          )
        : null,
  );
}
