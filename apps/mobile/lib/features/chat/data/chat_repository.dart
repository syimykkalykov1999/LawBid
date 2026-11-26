import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/data/chat_list_cache.dart';
import 'package:lawbid/features/chat/data/message_store.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/stars/domain/stars_mappers.dart';
import 'package:lawbid/features/stickers/data/stickers_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

export 'package:lawbid/core/files/file_types.dart' show chatMimeForName;

/// Owner 2026-10-05 (storage like Telegram): counts and bytes of a chat's
/// files; `quotaBytes` null = no cap.
typedef ChatStorageSummary = ({
  int photos,
  int documents,
  int voice,
  int usedBytes,
  int? quotaBytes,
});

/// docs/05 §8 chats for the app. Throws [ApiException].
/// Owner 2026-10-20: pinned messages and the server's action rules.
class ChatPins {
  const ChatPins({
    required this.items,
    required this.editWindowMin,
    required this.deleteForAllHours,
    required this.maxPins,
  });

  final List<ChatMessage> items;
  final int editWindowMin;
  final int deleteForAllHours;
  final int maxPins;
}

abstract interface class ChatRepository {
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,

    /// Owner 2026-10-18: search my chats (names, @username, case title,
    /// message text) — the server matches; items then carry
    /// [Conversation.matchedMessage].
    String? q,
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
    bool? archived,
    bool? unread,
  });

  /// Badges of the Waiting and Requests folders, and the Archive's size.
  Future<({int waiting, int requests, int cases, int archived})> folderCounts();

  /// OQ-043: the direct chat with [userId] ("Message" on a profile).
  Future<Conversation> startDirect(String userId);
  Future<int> requestsCount();
  Future<Conversation> answerRequest(String id, {required bool accept});
  Future<Conversation> conversation(String id);
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor});

  /// Catch-up after a reconnect (§8.5), oldest first.
  Future<List<ChatMessage>> messagesAfter(String id, String afterId);
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body, {
    String? replyToId,
    bool forwarded = false,
  });

  /// OQ-040: presign → upload → confirm of an m4a note (M3: the scan is not
  /// waited for; the server shows the note to the others once it is clean).
  Future<String> uploadVoice(Uint8List bytes);

  /// OQ-040: a voice message with an uploaded [fileId].
  Future<ChatMessage> sendVoice(
    String id,
    String clientMessageId, {
    required String fileId,
    required int durationMs,
    required List<int> waveform,
    String? replyToId,
  });

  /// OQ-047: presign → upload → confirm of a photo or a document; [mime]
  /// comes from `sniffChatMime` (M3: the scan is not waited for).
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
    String? replyToId,
  });

  /// Owner 2026-10-20: passes message [sourceId] on to chat [id]; the server
  /// copies a voice note / file as a reference to the same stored object
  /// (nothing is uploaded again).
  Future<ChatMessage> forward(
    String id,
    String clientMessageId,
    String sourceId,
  );

  /// Owner 2026-10-21 (Telegram «Переслать»): [sources] (oldest first) into
  /// every chat of [targets] in one request — direct / case chats, groups,
  /// channels. A retry with the same [requestId] sends nothing twice; a
  /// chat that refuses a message reports it in its result.
  Future<List<ForwardResult>> forwardBatch(
    String requestId,
    List<ForwardSource> sources,
    List<ForwardTarget> targets,
  );

  /// Owner 2026-10-01: a sticker message.
  Future<ChatMessage> sendSticker(
    String id,
    String clientMessageId, {
    required String stickerId,
    String? replyToId,
  });

  /// OQ-047: only the chat's photos and documents (its "Files" screen).
  Future<CursorPage<ChatMessage>> attachments(String id, {String? cursor});

  /// Row 110 (Telegram 🔍 in a chat): the messages holding every word of
  /// [q], newest first, a page at a time.
  Future<CursorPage<ChatMessage>> searchMessages(
    String id,
    String q, {
    String? cursor,
  });

  /// Owner 2026-10-05: what the chat's files take (the "Files" summary).
  Future<ChatStorageSummary> storage(String id);

  /// OQ-040: the recipient played a voice message.
  Future<ChatMessage> listened(String id, String messageId);

  /// Owner 2026-10-04: one message translated into [target] (app language).
  Future<String> translate(String id, String messageId, String target);
  Future<void> read(String id, String lastReadMessageId);

  /// Owner 2026-10-20: this device has the messages up to [messageId]
  /// (the sender's two grey ticks).
  Future<void> delivered(String id, String messageId);

  /// Owner 2026-10-20: edit a text message inside the window.
  Future<ChatMessage> editMessage(String id, String messageId, String body);

  /// Delete for me (`all` false) or for everyone inside the window.
  Future<void> deleteMessage(String id, String messageId, {required bool all});

  /// One emoji per person; null removes it.
  Future<ChatMessage> react(String id, String messageId, String? emoji);
  Future<ChatMessage> setPinned(
    String id,
    String messageId, {
    required bool pinned,
  });
  Future<ChatPins> pins(String id);
  Future<Conversation> mute(String id, DateTime? until);

  /// Owner 2026-10-21: calls of this chat ring silently (or not).
  Future<Conversation> muteCalls(String id, {required bool muted});

  /// Owner 2026-10-21: the disappearing-messages timer for new messages
  /// (86400 / 604800 / 7776000 seconds); null switches it off.
  Future<Conversation> setDisappearing(String id, int? afterS);
}

class ApiChatRepository implements ChatRepository {
  ApiChatRepository(
    Dio dio, {
    Dio? storageDio,
    this.listCache,
    this.messageStore,
    this.e2ee,
    this.sealedLinkCard,
  })  : _chat = api.ChatClient(dio),
        _uploader = StorageUploader.dio(dio, storageDio ?? dio);

  /// Owner 2026-10-20: keeps the first page of the plain chat list.
  final ChatListCache? listCache;

  /// Owner 2026-10-22 (package C): every message the server answers goes
  /// to the phone's copy of the chat (pages, catch-ups, my own writes).
  final MessageStore? messageStore;

  /// Item 25: end-to-end encrypted chats — outgoing text is sealed with
  /// MLS, incoming `mls` messages are opened (once) before anything else
  /// of the app sees them; the phone's copy holds the opened message.
  final E2eeService? e2ee;

  /// Third pass S3: builds, on this phone, the card of the first link in a
  /// text for an end-to-end encrypted chat (null = no card). Never throws.
  final Future<SealedLinkCard?> Function(String body)? sealedLinkCard;

  ChatMessage _m(api.MessageDto d) {
    final shown = e2ee?.openCached(d) ?? d;
    unawaited(
      messageStore?.put(shown.conversationId, [shown]) ?? Future.value(),
    );
    return ChatMappers.message(shown);
  }

  Future<List<api.MessageDto>> _open(List<api.MessageDto> ds) =>
      e2ee?.openAll(ds) ?? Future.value(ds);

  final api.ChatClient _chat;
  final StorageUploader _uploader;

  static const _scanMaxPolls = 40;

  @override
  Future<String> uploadVoice(Uint8List bytes) async {
    if (bytes.length > kVoiceMaxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final webm = isWebmVoice(bytes);
    // Owner 2026-10-22 (audit #4 §3): the shared uploader.
    return _uploader.upload(
      purpose: api.FilePurpose.chatVoice,
      body: UploadBody.bytes(bytes),
      mime: webm ? 'audio/webm' : 'audio/mp4',
      filename: webm ? 'voice.webm' : 'voice.m4a',
      scanMaxPolls: _scanMaxPolls,
      // M3 (owner 25.11, Slack / Telegram), as the queue jobs: the message
      // goes once storage has the note; the server shows it to the others
      // after a clean scan, so no 28 s wait and no «scan» failure here.
      waitScan: false,
    );
  }

  @override
  Future<ChatMessage> sendVoice(
    String id,
    String clientMessageId, {
    required String fileId,
    required int durationMs,
    required List<int> waveform,
    String? replyToId,
  }) async =>
      _m(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.voice,
              fileId: fileId,
              durationMs: durationMs,
              waveform: waveform,
              replyToId: replyToId,
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
    // The admin may raise the chat MB (bug 17); the picker checks the live
    // value, this only stops what no setting allows.
    if (bytes.length > kChatAttachmentCeilingBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    return _uploader.upload(
      purpose: api.FilePurpose.chatAttachment,
      body: UploadBody.bytes(bytes),
      mime: mime,
      onProgress: onProgress,
      scanMaxPolls: _scanMaxPolls,
      // M3 (owner 25.11): group files with `group_files_from_disk` off come
      // here; like `uploadChatAttachmentJob` they no longer wait for the
      // antivirus (the server holds the file back from the others until it
      // is clean, PR #1300).
      waitScan: false,
    );
  }

  @override
  Future<ChatMessage> sendAttachment(
    String id,
    String clientMessageId, {
    required String fileId,
    required String fileName,
    String? caption,
    String? replyToId,
  }) async =>
      _m(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.attachment,
              fileId: fileId,
              fileName: fileName,
              body: caption,
              replyToId: replyToId,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<ChatMessage> forward(
    String id,
    String clientMessageId,
    String sourceId,
  ) async =>
      _m(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              forwardFromId: sourceId,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<List<ForwardResult>> forwardBatch(
    String requestId,
    List<ForwardSource> sources,
    List<ForwardTarget> targets,
  ) async {
    final res = await guardApiCall(
      () => _chat.forward(
        body: api.ForwardMessagesDto(
          requestId: requestId,
          sources: [
            for (final s in sources)
              api.ForwardSourceDto(
                kind: switch (s.kind) {
                  ForwardSourceKind.message => api.ForwardSourceKind.message,
                  ForwardSourceKind.groupMessage =>
                    api.ForwardSourceKind.groupMessage,
                  ForwardSourceKind.channelPost =>
                    api.ForwardSourceKind.channelPost,
                  ForwardSourceKind.groupLink =>
                    api.ForwardSourceKind.groupLink,
                  ForwardSourceKind.channelLink =>
                    api.ForwardSourceKind.channelLink,
                },
                id: s.id,
              ),
          ],
          targets: [
            for (final t in targets)
              api.ForwardTargetDto(
                kind: switch (t.kind) {
                  ForwardTargetKind.conversation =>
                    api.ForwardTargetKind.conversation,
                  ForwardTargetKind.group => api.ForwardTargetKind.group,
                  ForwardTargetKind.channel => api.ForwardTargetKind.channel,
                },
                id: t.id,
                topicId: t.topicId,
              ),
          ],
        ),
      ),
    );
    return [
      for (final r in res.data.results)
        ForwardResult(
          target: ForwardTarget(
            switch (r.target.kind) {
              api.ForwardTargetKind.group => ForwardTargetKind.group,
              api.ForwardTargetKind.channel => ForwardTargetKind.channel,
              _ => ForwardTargetKind.conversation,
            },
            r.target.id,
            topicId: r.target.topicId,
          ),
          sourceId: r.sourceId,
          sent: r.status == api.ForwardStatus.sent,
          code: r.code,
          messageId: r.messageId,
        ),
    ];
  }

  @override
  Future<ChatMessage> sendSticker(
    String id,
    String clientMessageId, {
    required String stickerId,
    String? replyToId,
  }) async =>
      _m(
        (await guardApiCall(
          () => _chat.sendMessage(
            id: id,
            body: api.SendMessageDto(
              clientMessageId: clientMessageId,
              type: api.SendMessageType.sticker,
              stickerId: stickerId,
              replyToId: replyToId,
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
  Future<CursorPage<ChatMessage>> searchMessages(
    String id,
    String q, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _chat.listMessages(id: id, cursor: cursor, q: q.trim()),
    );
    return CursorPage(
      items: env.data.map(ChatMappers.message).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<ChatStorageSummary> storage(String id) async {
    final d = (await guardApiCall(
      () => _chat.getConversationStorage(id: id),
    ))
        .data;
    return (
      photos: d.photos.toInt(),
      documents: d.documents.toInt(),
      voice: d.voice.toInt(),
      usedBytes: d.usedBytes.toInt(),
      quotaBytes: d.quotaBytes?.toInt(),
    );
  }

  @override
  Future<ChatMessage> listened(String id, String messageId) async => _m(
        (await guardApiCall(
          () => _chat.voiceListened(id: id, messageId: messageId),
        ))
            .data,
      );

  @override
  Future<String> translate(
    String id,
    String messageId,
    String target,
  ) async =>
      (await guardApiCall(
        () => _chat.translateMessage(
          id: id,
          messageId: messageId,
          body: api.TranslateMessageDto(target: target),
        ),
      ))
          .data
          .text;

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
    String? q,
  }) async {
    final f = requests ? ChatListFolder.requests : folder;
    final query = q?.trim();
    final env = await guardApiCall(
      () => _chat.listConversations(
        cursor: cursor,
        q: query == null || query.isEmpty ? null : query,
        updatedSince: updatedSince?.toUtc().toIso8601String(),
        // Row 110: «Unread» is filtered on the device from «All».
        folder: f == ChatListFolder.all || f == ChatListFolder.unread
            ? null
            : api.ConversationFolder.fromJson(f.name),
      ),
    );
    if (cursor == null &&
        updatedSince == null &&
        (query == null || query.isEmpty) &&
        f == ChatListFolder.all) {
      listCache?.save(env);
    }
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
    bool? archived,
    bool? unread,
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
              archived: archived,
              unread: unread,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async {
    final d = (await guardApiCall(_chat.folderCounts)).data;
    return (
      waiting: d.waiting.toInt(),
      requests: d.requests.toInt(),
      cases: d.cases.toInt(),
      archived: d.archived.toInt(),
    );
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
    final next = env.meta?.nextCursor;
    final data = await _open(env.data);
    unawaited(
      messageStore?.put(
            id,
            data,
            nextCursor: next,
            complete: next == null,
          ) ??
          Future.value(),
    );
    return CursorPage(
      items: data.map(ChatMappers.message).toList(),
      nextCursor: next,
    );
  }

  @override
  Future<List<ChatMessage>> messagesAfter(String id, String afterId) async {
    final env = await guardApiCall(
      () => _chat.listMessages(id: id, afterId: afterId),
    );
    final data = await _open(env.data);
    unawaited(messageStore?.put(id, data) ?? Future.value());
    return data.map(ChatMappers.message).toList();
  }

  @override
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body, {
    String? replyToId,
    bool forwarded = false,
  }) async {
    // Third pass S3 (WhatsApp whitepaper «Link previews»): the link card
    // of an encrypted chat is made here and travels inside the encryption.
    final build = sealedLinkCard;
    SealedLinkCard? card;
    if (build != null && e2ee != null) {
      try {
        if (await e2ee!.seals(id)) card = await build(body);
      } on Object {
        card = null;
      }
    }
    // Item 25: in an end-to-end encrypted chat the text goes sealed (the
    // reply and the «Forwarded» mark inside it; the server sees neither).
    final sealed = await e2ee?.seal(
      id,
      clientMessageId,
      E2eePayload(
        kind: 'text',
        body: body,
        replyToId: replyToId,
        forwarded: forwarded,
        extra: {if (card != null) 'lp': card.toJson()},
      ),
    );
    final api.MessageDto sent;
    try {
      sent = (await guardApiCall(
        () => _chat.sendMessage(
          id: id,
          body: sealed ??
              api.SendMessageDto(
                clientMessageId: clientMessageId,
                body: body,
                replyToId: replyToId,
                forwarded: forwarded ? true : null,
              ),
        ),
      ))
          .data;
    } on ApiException catch (e) {
      // The chat's encryption moved on / it became encrypted / a device
      // must go first: the cached state is stale; the outbox tries again
      // and the next seal catches up (no state request on every send).
      if (e.statusCode == 409 && e.code.startsWith('E2EE_')) {
        e2ee?.invalidate(id);
      }
      rethrow;
    }
    return _m((await _open([sent])).single);
  }

  /// Item 25, PR 4: an end-to-end encrypted file message — the ciphertext
  /// [fileId] is already in storage; the key, name and type go sealed in
  /// [payload] (E2eeService.encryptFile).
  Future<ChatMessage> sendSealedFile(
    String id,
    String clientMessageId,
    E2eePayload payload, {
    required String fileId,
  }) async {
    final sealed =
        await e2ee?.seal(id, clientMessageId, payload, fileId: fileId);
    if (sealed == null) throw const E2eeNotReady('off');
    final api.MessageDto sent;
    try {
      sent = (await guardApiCall(
        () => _chat.sendMessage(id: id, body: sealed),
      ))
          .data;
    } on ApiException catch (e) {
      // As [send]: a stale epoch / state — the next try catches up first.
      if (e.statusCode == 409 && e.code.startsWith('E2EE_')) {
        e2ee?.invalidate(id);
      }
      rethrow;
    }
    return _m((await _open([sent])).single);
  }

  @override
  Future<ChatMessage> editMessage(
    String id,
    String messageId,
    String body,
  ) async =>
      _m(
        (await guardApiCall(
          () => _chat.editChatMessage(
            id: id,
            messageId: messageId,
            body: api.EditMessageDto(body: body),
          ),
        ))
            .data,
      );

  @override
  Future<void> deleteMessage(
    String id,
    String messageId, {
    required bool all,
  }) =>
      guardApiCall(
        () => _chat.deleteChatMessage(
          id: id,
          messageId: messageId,
          scope: all ? api.DeleteScope.all : api.DeleteScope.me,
        ),
      );

  @override
  Future<ChatMessage> react(String id, String messageId, String? emoji) async =>
      _m(
        (await guardApiCall(
          () => _chat.reactToChatMessage(
            id: id,
            messageId: messageId,
            body: api.ReactMessageDto(emoji: emoji),
          ),
        ))
            .data,
      );

  @override
  Future<ChatMessage> setPinned(
    String id,
    String messageId, {
    required bool pinned,
  }) async =>
      _m(
        (await guardApiCall(
          () => pinned
              ? _chat.pinChatMessage(id: id, messageId: messageId)
              : _chat.unpinChatMessage(id: id, messageId: messageId),
        ))
            .data,
      );

  @override
  Future<ChatPins> pins(String id) async {
    final d = (await guardApiCall(() => _chat.listChatPins(id: id))).data;
    return ChatPins(
      items: d.items.map(ChatMappers.message).toList(),
      editWindowMin: d.editWindowMin.toInt(),
      deleteForAllHours: d.deleteForAllHours.toInt(),
      maxPins: d.maxPins.toInt(),
    );
  }

  @override
  Future<void> read(String id, String lastReadMessageId) => guardApiCall(
        () => _chat.readConversation(
          id: id,
          body: api.ReadConversationDto(lastReadMessageId: lastReadMessageId),
        ),
      );

  @override
  Future<void> delivered(String id, String messageId) => guardApiCall(
        () => _chat.deliveredConversation(
          id: id,
          body: api.DeliveredConversationDto(lastDeliveredMessageId: messageId),
        ),
      );

  @override
  Future<Conversation> setDisappearing(String id, int? afterS) async =>
      ChatMappers.conversation(
        (await guardApiCall(
          () => _chat.setDisappearing(
            id: id,
            body: api.SetDisappearingDto(
              afterS: afterS == null
                  ? null
                  : api.SetDisappearingDtoAfterS.fromJson(afterS),
            ),
          ),
        ))
            .data,
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

  @override
  Future<Conversation> muteCalls(String id, {required bool muted}) async =>
      ChatMappers.conversation(
        (await guardApiCall(
          () => _chat.muteChatCalls(
            id: id,
            body: api.MuteCallsDto(muted: muted),
          ),
        ))
            .data,
      );
}

/// OQ-047: the default chat MB per file (admin «Загрузки и файлы»).
const kChatAttachmentMaxBytes = 50 * 1024 * 1024;

/// The most any setting allows per chat or task file (the API's ceiling).
const kChatAttachmentCeilingBytes = 100 * 1024 * 1024;

/// Extensions for the file picker (same list as `chatMimeForName`).
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

/// A note recorded in Chrome/Firefox is Opus in WebM (EBML header);
/// everything else (the phones, Safari) is AAC in MP4.
bool isWebmVoice(List<int> bytes) =>
    bytes.length >= 4 &&
    bytes[0] == 0x1A &&
    bytes[1] == 0x45 &&
    bytes[2] == 0xDF &&
    bytes[3] == 0xA3;

abstract final class ChatMappers {
  /// Owner 2026-10-21 (Instagram «Поделиться»): a shared post's card.
  static SharedPostCard postCard(api.SharedPostCardDto d) {
    final a = d.author;
    final name = [a?.firstName, a?.lastName]
        .whereType<String>()
        .where((x) => x.trim().isNotEmpty)
        .join(' ');
    return SharedPostCard(
      id: d.id,
      available: d.available,
      authorId: a?.id,
      authorName: name.isEmpty ? a?.username : name,
      authorUsername: a?.username,
      authorAvatarUrl: a?.avatarUrl,
      authorVerified: a?.verifiedBadge ?? false,
      title: d.title,
      excerpt: d.excerpt,
      thumbnailUrl: d.thumbnailUrl,
      isVideo: d.isVideo,
    );
  }

  /// Disappearing messages: already past its time (the preview is blank).
  static bool _gone(api.MessageDto d) =>
      d.expiresAt != null && !d.expiresAt!.isAfter(DateTime.now());

  /// Item 25: opens an end-to-end encrypted message from the device's
  /// memory (set by the signed-in account's E2eeService) — every way a
  /// message reaches a screen (lists, events, the phone's copy) passes here.
  static api.MessageDto Function(api.MessageDto d)? e2eeOpen;

  /// Third pass S3: the link card inside an opened end-to-end encrypted
  /// message (E2eeService.linkCardOf), set with [e2eeOpen].
  static SealedLinkCard? Function(api.MessageDto d)? e2eeLinkCard;

  static ChatMessage message(api.MessageDto raw) => _message(
        raw.type == api.MessageDtoType.mls ? (e2eeOpen?.call(raw) ?? raw) : raw,
      );

  static ChatMessage _message(api.MessageDto d) => ChatMessage(
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
          api.MessageDtoType.gift => MessageKind.gift,
          api.MessageDtoType.contact => MessageKind.contact,
          api.MessageDtoType.place => MessageKind.place,
          api.MessageDtoType.post => MessageKind.post,
          _ => MessageKind.text,
        },
        post: d.post == null ? null : postCard(d.post!),
        contact: d.contact == null
            ? null
            : ContactCard(
                userId: d.contact!.userId,
                username: d.contact!.username,
                displayName: d.contact!.displayName,
                avatarUrl: d.contact!.avatarUrl,
                verified: d.contact!.verifiedBadge,
                firmNames: [...d.contact!.firmNames],
                practiceKeys: [...d.contact!.practiceKeys],
                licensedStates: [...d.contact!.licensedStates],
              ),
        sticker:
            d.sticker == null ? null : StickersRepository.sticker(d.sticker!),
        gift: d.gift == null ? null : StarsMappers.send(d.gift!),
        // Owner 2026-10-22: a sealed body never reaches a bubble or the
        // inbox preview (a caption-less photo showed `enc:v2.m1.…`).
        body: isSealedChatBody(d.body) ? '' : d.body,
        unreadable: isSealedChatBody(d.body),
        contactMasked: d.contactMasked,
        clientMessageId: d.clientMessageId,
        seq: d.seq?.toInt(),
        // Third pass S3: encrypted (the ciphertext stays on the opened DTO).
        e2ee: d.ciphertext != null,
        sealedLink: d.ciphertext == null ? null : e2eeLinkCard?.call(d),
        createdAt: d.createdAt,
        editedAt: d.editedAt,
        revoked: d.revoked,
        forwarded: d.forwarded,
        forwardedFrom: d.forwardedFrom,
        pinned: d.pinned,
        expiresAt: d.expiresAt,
        replyTo: d.replyTo == null
            ? null
            : ReplyPreview(
                id: d.replyTo!.id,
                senderId: d.replyTo!.senderId,
                kind: switch (d.replyTo!.type) {
                  api.ReplyPreviewDtoType.voice => MessageKind.voice,
                  api.ReplyPreviewDtoType.attachment => MessageKind.attachment,
                  api.ReplyPreviewDtoType.sticker => MessageKind.sticker,
                  api.ReplyPreviewDtoType.call => MessageKind.call,
                  _ => MessageKind.text,
                },
                snippet: isSealedChatBody(d.replyTo!.snippet)
                    ? ''
                    : d.replyTo!.snippet,
                revoked: d.replyTo!.revoked,
              ),
        reactions: [
          for (final r in d.reactions)
            MessageReaction(
              emoji: r.emoji,
              count: r.count,
              mine: r.mine,
            ),
        ],
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
                blurhash: d.attachment!.blurhash,
                removed: d.attachment!.state == api.ChatMediaState.removed,
              ),
        voice: d.voice == null
            ? null
            : VoiceNote(
                url: playableVoiceUrl(d.voice!.url, d.voice!.m4aUrl),
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
        blocked: d.blocked,
        counterpart: Counterpart(
          isAttorney:
              d.counterpart.kind == api.ConversationCounterpartDtoKind.attorney,
          id: d.counterpart.id,
          displayName: d.counterpart.displayName,
          username: d.counterpart.username,
          avatarUrl: d.counterpart.avatarUrl,
          avatarFullUrl: d.counterpart.avatarFullUrl,
          verified: d.counterpart.verifiedBadge,
          online: d.counterpart.online,
          lastSeenAt: d.counterpart.lastSeenAt,
        ),
        lastMessage: d.lastMessage == null || _gone(d.lastMessage!)
            ? null
            : message(d.lastMessage!),
        lastMessageAt: d.lastMessageAt,
        unreadCount: d.unreadCount.toInt(),
        mutedUntil: d.mutedUntil,
        callsMuted: d.callsMuted,
        counterpartLastReadId: d.counterpartLastReadMessageId,
        counterpartLastDeliveredId: d.counterpartLastDeliveredMessageId,
        counterpartLastReadAt: d.counterpartLastReadAt,
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
        markedUnread: d.markedUnread ?? false,
        matchedMessage: d.matchedMessage,
        disappearAfterS: d.disappearAfterS?.toInt(),
        e2eeSince: d.e2eeSince,
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
