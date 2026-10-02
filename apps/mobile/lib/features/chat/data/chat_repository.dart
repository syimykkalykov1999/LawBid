import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart'
    show sha256Hex;
import 'package:lawbid/features/stickers/data/stickers_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/05 §8 chats for the app. Throws [ApiException].
abstract interface class ChatRepository {
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
  });

  /// Owner 2026-10-01: move to a folder (null = automatic), "waiting for
  /// my answer", a pinned note ("" clears), pin to the top.
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
    bool? hidden,
  });

  /// Badges of the Waiting and Requests folders.
  Future<({int waiting, int requests})> folderCounts();

  /// OQ-043: the direct chat with [userId] ("Message" on a profile).
  Future<Conversation> startDirect(String userId);
  Future<int> requestsCount();
  Future<Conversation> answerRequest(String id, {required bool accept});
  Future<Conversation> conversation(String id);
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor});

  /// Catch-up after a reconnect (§8.5), oldest first.
  Future<List<ChatMessage>> messagesAfter(String id, String afterId);
  Future<ChatMessage> send(String id, String clientMessageId, String body);

  /// OQ-040: presign → upload → confirm → clean scan of an m4a note.
  Future<String> uploadVoice(Uint8List bytes);

  /// OQ-040: a voice message with an uploaded [fileId].
  Future<ChatMessage> sendVoice(
    String id,
    String clientMessageId, {
    required String fileId,
    required int durationMs,
    required List<int> waveform,
  });

  /// OQ-047: presign → upload → confirm → clean scan of a photo or a
  /// document; [mime] comes from `sniffChatMime`.
  Future<String> uploadAttachment(
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
  });

  /// OQ-047: a photo or a document with an uploaded [fileId].
  Future<ChatMessage> sendAttachment(
    String id,
    String clientMessageId, {
    required String fileId,
    required String fileName,
    String? caption,
  });

  /// Owner 2026-10-01: a sticker message.
  Future<ChatMessage> sendSticker(
    String id,
    String clientMessageId, {
    required String stickerId,
  });

  /// OQ-047: only the chat's photos and documents (its "Files" screen).
  Future<CursorPage<ChatMessage>> attachments(String id, {String? cursor});

  /// OQ-040: the recipient played a voice message.
  Future<ChatMessage> listened(String id, String messageId);
  Future<void> read(String id, String lastReadMessageId);
  Future<Conversation> mute(String id, DateTime? until);
}

class ApiChatRepository implements ChatRepository {
  ApiChatRepository(Dio dio, {Dio? storageDio})
      : _chat = api.ChatClient(dio),
        _files = api.FilesClient(dio),
        _storage = storageDio ?? dio;

  final api.ChatClient _chat;
  final api.FilesClient _files;
  final Dio _storage;

  static const _scanPoll = Duration(milliseconds: 700);
  static const _scanMaxPolls = 40;

  @override
  Future<String> uploadVoice(Uint8List bytes) async {
    if (bytes.length > kVoiceMaxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: api.FilePurpose.chatVoice,
          mime: 'audio/mp4',
          sizeBytes: bytes.length,
          sha256: sha256Hex(bytes),
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    try {
      await _storage.post<void>(
        target.upload.url,
        data: FormData.fromMap({
          ...target.upload.fields,
          // S3 POST policy: the file must be the LAST field.
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'voice.m4a',
            contentType: DioMediaType('audio', 'mp4'),
          ),
        }),
      );
    } on DioException catch (e) {
      throw ApiException(
        code: e.response == null
            ? ApiException.networkErrorCode
            : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
    var status = (await guardApiCall(() => _files.confirm(id: target.fileId)))
        .data
        .scanStatus;
    for (var i = 0;
        status == api.ScanStatus.pending && i < _scanMaxPolls;
        i++) {
      await Future<void>.delayed(_scanPoll);
      status = (await guardApiCall(() => _files.getFilesId(id: target.fileId)))
          .data
          .scanStatus;
    }
    if (status != api.ScanStatus.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
    return target.fileId;
  }

  @override
  Future<ChatMessage> sendVoice(
    String id,
    String clientMessageId, {
    required String fileId,
    required int durationMs,
    required List<int> waveform,
  }) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.voice,
              fileId: fileId,
              durationMs: durationMs,
              waveform: waveform,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<String> uploadAttachment(
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
  }) async {
    if (bytes.length > kChatAttachmentMaxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: api.FilePurpose.chatAttachment,
          mime: mime,
          sizeBytes: bytes.length,
          sha256: sha256Hex(bytes),
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    final parts = mime.split('/');
    try {
      await _storage.post<void>(
        target.upload.url,
        data: FormData.fromMap({
          ...target.upload.fields,
          // S3 POST policy: the file must be the LAST field.
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'file',
            contentType: DioMediaType(parts.first, parts.last),
          ),
        }),
        onSendProgress: (sent, total) {
          if (total > 0) onProgress?.call(sent / total);
        },
      );
    } on DioException catch (e) {
      throw ApiException(
        code: e.response == null
            ? ApiException.networkErrorCode
            : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
    var status = (await guardApiCall(() => _files.confirm(id: target.fileId)))
        .data
        .scanStatus;
    for (var i = 0;
        status == api.ScanStatus.pending && i < _scanMaxPolls;
        i++) {
      await Future<void>.delayed(_scanPoll);
      status = (await guardApiCall(() => _files.getFilesId(id: target.fileId)))
          .data
          .scanStatus;
    }
    if (status != api.ScanStatus.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
    return target.fileId;
  }

  @override
  Future<ChatMessage> sendAttachment(
    String id,
    String clientMessageId, {
    required String fileId,
    required String fileName,
    String? caption,
  }) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.attachment,
              fileId: fileId,
              fileName: fileName,
              body: caption,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<ChatMessage> sendSticker(
    String id,
    String clientMessageId, {
    required String stickerId,
  }) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.sticker,
              stickerId: stickerId,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<CursorPage<ChatMessage>> attachments(
    String id, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _chat.listMessages(
        id: id,
        cursor: cursor,
        only: api.MessagesFilter.attachment,
      ),
    );
    return CursorPage(
      items: env.data.map(ChatMappers.message).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<ChatMessage> listened(String id, String messageId) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.voiceListened(id: id, messageId: messageId),
        ))
            .data,
      );

  @override
  Future<Conversation> startDirect(String userId) async =>
      ChatMappers.conversation(
        (await guardApiCall(
          () => _chat.startDirectChat(
            body: api.StartDirectChatDto(userId: userId),
          ),
        ))
            .data,
      );

  @override
  Future<int> requestsCount() async =>
      (await guardApiCall(_chat.requestsCount)).data.count;

  @override
  Future<Conversation> answerRequest(String id, {required bool accept}) async =>
      ChatMappers.conversation(
        (await guardApiCall(
          () => accept
              ? _chat.acceptMessageRequest(id: id)
              : _chat.declineMessageRequest(id: id),
        ))
            .data,
      );

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
  }) async {
    final f = requests ? ChatListFolder.requests : folder;
    final env = await guardApiCall(
      () => _chat.listConversations(
        cursor: cursor,
        updatedSince: updatedSince?.toUtc().toIso8601String(),
        folder: f == ChatListFolder.all
            ? null
            : api.ConversationFolder.fromJson(f.name),
      ),
    );
    return CursorPage(
      items: env.data.map(ChatMappers.conversation).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
    bool? hidden,
  }) async =>
      ChatMappers.conversation(
        (await guardApiCall(
          () => _chat.organizeConversation(
            id: id,
            body: api.OrganizeConversationDto(
              folder: resetFolder
                  ? api.OrganizeConversationDtoFolder.auto
                  : folder == null
                      ? null
                      : api.OrganizeConversationDtoFolder.fromJson(
                          folder.name,
                        ),
              waiting: waiting,
              note: note,
              pinned: pinned,
              hidden: hidden,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<({int waiting, int requests})> folderCounts() async {
    final d = (await guardApiCall(_chat.folderCounts)).data;
    return (waiting: d.waiting.toInt(), requests: d.requests.toInt());
  }

  @override
  Future<Conversation> conversation(String id) async =>
      ChatMappers.conversation(
        (await guardApiCall(() => _chat.getConversation(id: id))).data,
      );

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async {
    final env =
        await guardApiCall(() => _chat.listMessages(id: id, cursor: cursor));
    return CursorPage(
      items: env.data.map(ChatMappers.message).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<List<ChatMessage>> messagesAfter(String id, String afterId) async =>
      (await guardApiCall(() => _chat.listMessages(id: id, afterId: afterId)))
          .data
          .map(ChatMappers.message)
          .toList();

  @override
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body,
  ) async =>
      ChatMappers.message(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              body: body,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<void> read(String id, String lastReadMessageId) => guardApiCall(
        () => _chat.readConversation(
          id: id,
          body: api.ReadConversationDto(lastReadMessageId: lastReadMessageId),
        ),
      );

  @override
  Future<Conversation> mute(String id, DateTime? until) async =>
      ChatMappers.conversation(
        (await guardApiCall(
          () => _chat.muteConversation(
            id: id,
            body: api.MuteConversationDto(
              until: until?.toUtc().toIso8601String(),
            ),
          ),
        ))
            .data,
      );
}

/// OQ-047: the server's files.chat_max_size_mb.
const kChatAttachmentMaxBytes = 25 * 1024 * 1024;

/// OQ-047: what the server accepts in a chat, by extension (the server
/// re-checks the bytes). Null for anything else.
String? chatMimeForName(String name) {
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'heic' || 'heif' => 'image/heic',
    'webp' => 'image/webp',
    'gif' => 'image/gif',
    'pdf' => 'application/pdf',
    'doc' => 'application/msword',
    'docx' =>
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' =>
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' =>
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt' => 'application/vnd.oasis.opendocument.text',
    'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
    'odp' => 'application/vnd.oasis.opendocument.presentation',
    'rtf' => 'application/rtf',
    'txt' => 'text/plain',
    'csv' => 'text/csv',
    _ => null,
  };
}

/// Extensions for the file picker (same list as [chatMimeForName]).
const kChatFileExtensions = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'txt',
  'csv',
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'webp',
  'gif',
];

/// OQ-040: the server's files.max_size_mb (10 MB) — about 20 minutes of
/// 64 kbit/s AAC, more than the 15-minute cap.
const kVoiceMaxBytes = 10 * 1024 * 1024;

abstract final class ChatMappers {
  static ChatMessage message(api.MessageDto d) => ChatMessage(
        id: d.id,
        conversationId: d.conversationId,
        senderId: d.senderId,
        sentByAssistant: d.sentByAssistant,
        kind: switch (d.type) {
          api.MessageDtoType.system => MessageKind.system,
          api.MessageDtoType.voice => MessageKind.voice,
          api.MessageDtoType.call => MessageKind.call,
          api.MessageDtoType.attachment => MessageKind.attachment,
          api.MessageDtoType.sticker => MessageKind.sticker,
          _ => MessageKind.text,
        },
        sticker:
            d.sticker == null ? null : StickersRepository.sticker(d.sticker!),
        body: d.body,
        contactMasked: d.contactMasked,
        clientMessageId: d.clientMessageId,
        createdAt: d.createdAt,
        callLog: d.call == null
            ? null
            : CallLog(
                outcome: d.call!.outcome.json ?? 'ended',
                durationSec: d.call!.durationSec,
              ),
        attachment: d.attachment == null
            ? null
            : ChatAttachment(
                fileId: d.attachment!.fileId,
                name: d.attachment!.name,
                isImage: d.attachment!.isImage,
                mime: d.attachment!.mime,
                sizeBytes: d.attachment!.sizeBytes,
                url: d.attachment!.url,
                previewUrl: d.attachment!.previewUrl,
                width: d.attachment!.width,
                height: d.attachment!.height,
              ),
        voice: d.voice == null
            ? null
            : VoiceNote(
                url: d.voice!.url,
                durationMs: d.voice!.durationMs,
                waveform: [for (final v in d.voice!.waveform) v],
                listened: d.voice!.listened,
              ),
      );

  static Conversation conversation(api.ConversationDto d) => Conversation(
        id: d.id,
        caseId: d.caseId,
        caseTitle: d.caseTitle,
        status: switch (d.status) {
          api.ConversationDtoStatus.active => ConversationStatus.active,
          api.ConversationDtoStatus.closed => ConversationStatus.closed,
          _ => ConversationStatus.preAcceptance,
        },
        contactsUnlocked: d.contactsUnlocked,
        counterpart: Counterpart(
          isAttorney:
              d.counterpart.kind == api.ConversationCounterpartDtoKind.attorney,
          id: d.counterpart.id,
          displayName: d.counterpart.displayName,
          username: d.counterpart.username,
          avatarUrl: d.counterpart.avatarUrl,
          verified: d.counterpart.verifiedBadge,
          online: d.counterpart.online,
          lastSeenAt: d.counterpart.lastSeenAt,
        ),
        lastMessage: d.lastMessage == null ? null : message(d.lastMessage!),
        lastMessageAt: d.lastMessageAt,
        unreadCount: d.unreadCount.toInt(),
        mutedUntil: d.mutedUntil,
        counterpartLastReadId: d.counterpartLastReadMessageId,
        updatedAt: d.updatedAt,
        isDirect: d.kind == api.ConversationKind.direct,
        request: switch (d.requestStatus) {
          api.MessageRequestStatus.pending => MessageRequest.pending,
          api.MessageRequestStatus.accepted => MessageRequest.accepted,
          api.MessageRequestStatus.declined => MessageRequest.declined,
          _ => MessageRequest.none,
        },
        requestedByMe: d.requestedByMe,
        folder: d.folder == api.ChatFolder.primary
            ? ChatFolder.primary
            : ChatFolder.general,
        folderAuto: d.folderAuto,
        waitingSince: d.waitingSince,
        note: d.note,
        pinnedAt: d.pinnedAt,
      );

  /// A realtime `message:new` payload (same shape as MessageDto).
  static ChatMessage? fromEvent(Object? data) {
    if (data is! Map) return null;
    final m = data['message'];
    if (m is! Map) return null;
    try {
      return message(api.MessageDto.fromJson(Map<String, dynamic>.from(m)));
    } on Object {
      return null;
    }
  }
}
