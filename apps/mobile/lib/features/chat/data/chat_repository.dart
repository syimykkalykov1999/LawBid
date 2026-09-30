import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart'
    show sha256Hex;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// docs/05 §8 chats for the app. Throws [ApiException].
abstract interface class ChatRepository {
  Future<CursorPage<Conversation>> conversations(
      {String? cursor, DateTime? updatedSince});
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
          code: ApiErrorCodes.fileTooLarge, message: 'size');
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
          code: ApiErrorCodes.fileNotAttachable, message: 'scan');
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
      ChatMappers.message((await guardApiCall(() => _chat.sendMessage(
                id: id,
                body: api.SendMessageDto(
                  clientMessageId: clientMessageId,
                  type: api.SendMessageType.voice,
                  fileId: fileId,
                  durationMs: durationMs,
                  waveform: waveform,
                ),
              )))
          .data);

  @override
  Future<ChatMessage> listened(String id, String messageId) async =>
      ChatMappers.message((await guardApiCall(
        () => _chat.voiceListened(id: id, messageId: messageId),
      ))
          .data);

  @override
  Future<CursorPage<Conversation>> conversations(
      {String? cursor, DateTime? updatedSince}) async {
    final env = await guardApiCall(() => _chat.listConversations(
          cursor: cursor,
          updatedSince: updatedSince?.toUtc().toIso8601String(),
        ));
    return CursorPage(
      items: env.data.map(ChatMappers.conversation).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Conversation> conversation(String id) async =>
      ChatMappers.conversation(
          (await guardApiCall(() => _chat.getConversation(id: id))).data);

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
          String id, String clientMessageId, String body) async =>
      ChatMappers.message((await guardApiCall(() => _chat.sendMessage(
                id: id,
                body: api.SendMessageDto(
                    clientMessageId: clientMessageId, body: body),
              )))
          .data);

  @override
  Future<void> read(String id, String lastReadMessageId) => guardApiCall(
        () => _chat.readConversation(
          id: id,
          body: api.ReadConversationDto(lastReadMessageId: lastReadMessageId),
        ),
      );

  @override
  Future<Conversation> mute(String id, DateTime? until) async =>
      ChatMappers.conversation((await guardApiCall(() => _chat.muteConversation(
                id: id,
                body: api.MuteConversationDto(
                    until: until?.toUtc().toIso8601String()),
              )))
          .data);
}

/// OQ-040: the server's files.max_size_mb (10 MB) — about 20 minutes of
/// 64 kbit/s AAC, more than the 15-minute cap.
const kVoiceMaxBytes = 10 * 1024 * 1024;

abstract final class ChatMappers {
  static ChatMessage message(api.MessageDto d) => ChatMessage(
        id: d.id,
        conversationId: d.conversationId,
        senderId: d.senderId,
        kind: switch (d.type) {
          api.MessageDtoType.system => MessageKind.system,
          api.MessageDtoType.voice => MessageKind.voice,
          _ => MessageKind.text,
        },
        body: d.body,
        contactMasked: d.contactMasked,
        clientMessageId: d.clientMessageId,
        createdAt: d.createdAt,
        voice: d.voice == null
            ? null
            : VoiceNote(
                url: d.voice!.url,
                durationMs: d.voice!.durationMs.toInt(),
                waveform: [for (final v in d.voice!.waveform) v.toInt()],
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
        ),
        lastMessage: d.lastMessage == null ? null : message(d.lastMessage!),
        lastMessageAt: d.lastMessageAt,
        unreadCount: d.unreadCount.toInt(),
        mutedUntil: d.mutedUntil,
        counterpartLastReadId: d.counterpartLastReadMessageId,
        updatedAt: d.updatedAt,
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
