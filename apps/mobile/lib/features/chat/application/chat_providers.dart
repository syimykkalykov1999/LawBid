import 'package:flutter/services.dart' show HapticFeedback;
import 'package:lawbid/features/stickers/application/stickers_providers.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'dart:typed_data';
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart' show NotifCategory;

Duration? _noRetry(int retryCount, Object error) => null;

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ApiChatRepository(
    ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

// --- Conversations list (docs/05 §8.1) ---------------------------------------

class ConversationsNotifier extends PagedNotifier<Conversation> {
  Timer? _debounce;

  @override
  Future<PaginatedList<Conversation>> build() {
    // New messages, closed chats, a reconnect: re-read the first page
    // (debounced, so a burst of events is one request).
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'message:new' ||
          e.name == 'conversation:update' ||
          e.name == 'message:read' ||
          e.name == RealtimeEvent.reconnected) {
        _debounce?.cancel();
        _debounce = Timer(const Duration(milliseconds: 600), () {
          if (!ref.mounted) return;
          // Offline / 5xx while events arrive: keep what is shown.
          unawaited(refresh().catchError((Object _) {}));
        });
      }
    });
    ref.onDispose(() {
      sub.cancel();
      _debounce?.cancel();
    });
    return super.build();
  }

  @override
  Future<CursorPage<Conversation>> fetch(String? cursor) =>
      ref.read(chatRepositoryProvider).conversations(cursor: cursor);

  @override
  Object idOf(Conversation item) => item.id;
}

final conversationsProvider = AsyncNotifierProvider.autoDispose<
    ConversationsNotifier, PaginatedList<Conversation>>(
  ConversationsNotifier.new,
  retry: _noRetry,
);

// --- Message requests (OQ-043) ------------------------------------------------

/// Requests sent to me (the "Requests" folder).
class MessageRequestsNotifier extends ConversationsNotifier {
  @override
  Future<CursorPage<Conversation>> fetch(String? cursor) => ref
      .read(chatRepositoryProvider)
      .conversations(cursor: cursor, requests: true);
}

final messageRequestsProvider = AsyncNotifierProvider.autoDispose<
    MessageRequestsNotifier, PaginatedList<Conversation>>(
  MessageRequestsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-01: one chat folder (All · Primary · General · Waiting).
class FolderConversationsNotifier extends ConversationsNotifier {
  FolderConversationsNotifier(this.folder);

  final ChatListFolder folder;

  @override
  Future<CursorPage<Conversation>> fetch(String? cursor) => ref
      .read(chatRepositoryProvider)
      .conversations(cursor: cursor, folder: folder);
}

final folderConversationsProvider = AsyncNotifierProvider.autoDispose
    .family<FolderConversationsNotifier, PaginatedList<Conversation>,
        ChatListFolder>(
  FolderConversationsNotifier.new,
  retry: _noRetry,
);

/// Waiting / Requests badges; re-read on chat events.
final chatFolderCountsProvider =
    FutureProvider.autoDispose<({int waiting, int requests})>((ref) {
  final sub = ref.watch(realtimeEventsProvider).listen((e) {
    if (e.name == 'message:new' || e.name == 'conversation:update') {
      ref.invalidateSelf();
    }
  });
  ref.onDispose(sub.cancel);
  return ref.watch(chatRepositoryProvider).folderCounts();
}, retry: _noRetry);

/// After organizing a chat every folder list and the badges reload.
void refreshChatFolders(WidgetRef ref) {
  ref
    ..invalidate(folderConversationsProvider)
    ..invalidate(conversationsProvider)
    ..invalidate(chatFolderCountsProvider);
}

/// How many requests wait for me — the "Requests · N" row; re-read on new
/// messages and chat updates.
final messageRequestsCountProvider = FutureProvider.autoDispose<int>((ref) {
  final sub = ref.watch(realtimeEventsProvider).listen((e) {
    if (e.name == 'message:new' || e.name == 'conversation:update') {
      ref.invalidateSelf();
    }
  });
  ref.onDispose(sub.cancel);
  return ref.watch(chatRepositoryProvider).requestsCount();
}, retry: _noRetry);

// --- Outbox (docs/05 §8.4) --------------------------------------------------

/// Sends messages written offline, in order, each with its own
/// clientMessageId (the server's UQ makes a retry a no-op, so a message is
/// never delivered twice). Drains after each new message, when the
/// connection comes back and after a socket reconnect.
class OutboxSender {
  OutboxSender(this._ref) {
    _ref
      ..listen(connectivityStatusProvider, (prev, next) {
        if (next.offlineReason == null && prev?.offlineReason != null) {
          unawaited(drain());
        }
      })
      ..listen(realtimeEventsProvider, (_, stream) {
        _sub?.cancel();
        _sub = stream.listen((e) {
          if (e.name == RealtimeEvent.reconnected) unawaited(drain());
        });
      }, fireImmediately: true)
      ..onDispose(() => _sub?.cancel());
  }

  final Ref _ref;
  StreamSubscription<RealtimeEvent>? _sub;
  Future<void>? _running;
  bool _again = false;
  final _sent = StreamController<ChatMessage>.broadcast();

  /// Messages the server accepted (for threads whose socket is down).
  Stream<ChatMessage> get sent => _sent.stream;

  /// Set when the server said "renew your subscription" (§8.4).
  final subscriptionRequired = ValueNotifier<bool>(false);

  /// Single-flight; a call during a run queues one more pass, so a
  /// message written while another is sending is never left behind.
  Future<void> drain() {
    final running = _running;
    if (running != null) {
      _again = true;
      return running;
    }
    return _running = _loop().whenComplete(() => _running = null);
  }

  Future<void> _loop() async {
    do {
      _again = false;
      try {
        await _drain();
      } on Object {
        // A drift/parse failure must not surface as an uncaught error.
      }
    } while (_again);
  }

  Future<void> _drain() async {
    final owner = _ref.read(currentUserIdProvider);
    if (owner == null) return;
    final db = _ref.read(socialLocalDatabaseProvider);
    final repo = _ref.read(chatRepositoryProvider);
    for (final row in await db.pending(owner)) {
      if (row.failedCode != null) continue;
      try {
        final m =
            await repo.send(row.conversationId, row.clientMessageId, row.body);
        // Merge into the thread before the outbox row disappears, so the
        // bubble never blinks out.
        _sent.add(m);
        await db.sent(row.clientMessageId);
      } on ApiException catch (e) {
        if (e.isNetworkError ||
            e.statusCode == 429 ||
            (e.statusCode ?? 500) >= 500) {
          // Temporary: keep it and stop; the next trigger retries in order.
          await db.attempted(row.clientMessageId);
          return;
        }
        if (e.code == ApiErrorCodes.subscriptionRequired) {
          subscriptionRequired.value = true;
        }
        await db.attempted(row.clientMessageId, failedCode: e.code);
      }
    }
  }
}

final outboxSenderProvider = Provider<OutboxSender>((ref) {
  final sender = OutboxSender(ref);
  ref.onDispose(sender._sent.close);
  return sender;
});

// --- One conversation (docs/05 §8.2) -----------------------------------------

@immutable
class ChatThreadState {
  const ChatThreadState({
    this.conversation,
    this.messages = const [],
    this.outbox = const [],
    this.nextCursor,
    this.loading = true,
    this.loadingMore = false,
    this.error,
    this.loadMoreFailed = false,
    this.typing = false,
    this.voiceOutbox = const [],
  });

  final Conversation? conversation;

  /// Server messages, newest first.
  final List<ChatMessage> messages;

  /// Not yet accepted by the server, oldest first.
  final List<ChatMessage> outbox;
  final String? nextCursor;
  final bool loading;
  final bool loadingMore;
  final Object? error;

  /// The last older-page load failed: the list shows Retry instead of
  /// firing again on every rebuild.
  final bool loadMoreFailed;
  final bool typing;

  /// OQ-040: voice notes being uploaded/sent (or failed), oldest first.
  final List<ChatMessage> voiceOutbox;

  /// Newest first, the outbox on top.
  List<ChatMessage> get all {
    final pending = [...outbox, ...voiceOutbox]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return [...pending, ...messages];
  }

  ChatThreadState copyWith({
    Conversation? conversation,
    List<ChatMessage>? messages,
    List<ChatMessage>? outbox,
    String? nextCursor,
    bool clearCursor = false,
    bool? loading,
    bool? loadingMore,
    Object? error,
    bool clearError = false,
    bool? loadMoreFailed,
    bool? typing,
    List<ChatMessage>? voiceOutbox,
  }) =>
      ChatThreadState(
        conversation: conversation ?? this.conversation,
        messages: messages ?? this.messages,
        outbox: outbox ?? this.outbox,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        error: clearError ? null : (error ?? this.error),
        loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
        typing: typing ?? this.typing,
        voiceOutbox: voiceOutbox ?? this.voiceOutbox,
      );
}

class ChatThread extends Notifier<ChatThreadState> {
  ChatThread(this.id);

  final String id;
  Timer? _typingOff;
  String? _lastReadSent;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  @override
  ChatThreadState build() {
    final owner = ref.watch(currentUserIdProvider);
    final realtime = ref.watch(realtimeClientProvider);
    realtime?.join(id);

    final subs = <StreamSubscription<Object?>>[
      ref.watch(realtimeEventsProvider).listen(_onEvent),
      ref.read(outboxSenderProvider).sent.listen((m) {
        if (m.conversationId == id) _merge([m]);
      }),
      if (owner != null)
        ref
            .read(socialLocalDatabaseProvider)
            .watchPending(owner, id)
            .listen(_onOutbox),
    ];
    ref.onDispose(() {
      for (final s in subs) {
        s.cancel();
      }
      _typingOff?.cancel();
      realtime?.leave(id);
    });
    unawaited(Future.microtask(load));
    return const ChatThreadState();
  }

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final results = await Future.wait([
        _repo.conversation(id),
        _repo.messages(id),
      ]);
      if (!ref.mounted) return;
      final page = results[1] as CursorPage<ChatMessage>;
      state = state.copyWith(
        conversation: results[0] as Conversation,
        messages: page.items,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loading: false,
      );
      unawaited(ref.read(outboxSenderProvider).drain());
    } on Object catch (e) {
      if (ref.mounted) state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (cursor == null || state.loadingMore) return;
    state = state.copyWith(loadingMore: true, loadMoreFailed: false);
    try {
      final page = await _repo.messages(id, cursor: cursor);
      if (!ref.mounted) return;
      state = state.copyWith(
        messages: [...state.messages, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      );
    } on Object {
      if (ref.mounted) {
        state = state.copyWith(loadingMore: false, loadMoreFailed: true);
      }
    }
  }

  /// Written → shown at once as "отправляется" → sent by the outbox.
  Future<void> send(String text) async {
    final body = text.trim();
    final owner = ref.read(currentUserIdProvider);
    if (body.isEmpty || owner == null) return;
    await ref.read(socialLocalDatabaseProvider).enqueue(
          clientMessageId: newClientMessageId(),
          ownerId: owner,
          conversationId: id,
          body: body,
        );
    // OQ-044: a quick "sent" pop, like Telegram.
    unawaited(ref.read(appSoundsProvider).messageOut());
    unawaited(ref.read(outboxSenderProvider).drain());
  }

  /// OQ-040: a recorded note → a local "sending" bubble → upload → send.
  /// A failure keeps the bubble with Retry (the file stays on the device).
  Future<void> sendVoice({
    required String path,
    required int durationMs,
    required List<int> waveform,
  }) async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    final cmid = newClientMessageId();
    final local = ChatMessage(
      id: 'local:$cmid',
      conversationId: id,
      senderId: owner,
      kind: MessageKind.voice,
      body: '',
      clientMessageId: cmid,
      createdAt: DateTime.now(),
      delivery: DeliveryState.sending,
      voice: VoiceNote(
        localPath: path,
        durationMs: durationMs,
        waveform: waveform,
        listened: false,
      ),
    );
    state = state.copyWith(voiceOutbox: [...state.voiceOutbox, local]);
    unawaited(ref.read(appSoundsProvider).messageOut());
    await _uploadVoice(local);
  }

  Future<void> _uploadVoice(ChatMessage local) async {
    final v = local.voice!;
    try {
      final bytes = await readVoiceFile(v.localPath!);
      final fileId = await _repo.uploadVoice(bytes);
      final sent = await _repo.sendVoice(
        id,
        local.clientMessageId!,
        fileId: fileId,
        durationMs: v.durationMs,
        waveform: v.waveform,
      );
      if (!ref.mounted) return;
      state = state.copyWith(
        voiceOutbox: state.voiceOutbox
            .where((m) => m.clientMessageId != local.clientMessageId)
            .toList(),
      );
      _merge([sent]);
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.subscriptionRequired) {
        ref.read(outboxSenderProvider).subscriptionRequired.value = true;
      }
      _markVoice(local, DeliveryState.failed, e.code);
    } on Object {
      _markVoice(local, DeliveryState.failed, null);
    }
  }

  void _markVoice(ChatMessage local, DeliveryState d, String? code) {
    if (!ref.mounted) return;
    state = state.copyWith(voiceOutbox: [
      for (final m in state.voiceOutbox)
        if (m.clientMessageId == local.clientMessageId)
          m.copyWith(delivery: d, failedCode: code)
        else
          m,
    ]);
  }

  /// OQ-047: a picked photo or document → a local bubble with progress →
  /// upload → send. A failure keeps the bubble with Retry.
  Future<void> sendAttachment({
    required Uint8List bytes,
    required String name,
    required String mime,
    String? caption,
  }) async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    final cmid = newClientMessageId();
    final local = ChatMessage(
      id: 'local:$cmid',
      conversationId: id,
      senderId: owner,
      kind: MessageKind.attachment,
      body: caption?.trim() ?? '',
      clientMessageId: cmid,
      createdAt: DateTime.now(),
      delivery: DeliveryState.sending,
      attachment: ChatAttachment(
        fileId: '',
        name: name,
        isImage: mime.startsWith('image/'),
        mime: mime,
        sizeBytes: bytes.length,
        localBytes: bytes,
      ),
    );
    state = state.copyWith(voiceOutbox: [...state.voiceOutbox, local]);
    await _uploadAttachment(local);
  }

  /// Owner 2026-10-01: a sticker — shown at once, sent in the background,
  /// Retry on failure like a voice note.
  Future<void> sendSticker(ChatSticker sticker) async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    final cmid = newClientMessageId();
    final local = ChatMessage(
      id: 'local:$cmid',
      conversationId: id,
      senderId: owner,
      kind: MessageKind.sticker,
      body: '',
      clientMessageId: cmid,
      createdAt: DateTime.now(),
      delivery: DeliveryState.sending,
      sticker: sticker,
    );
    state = state.copyWith(voiceOutbox: [...state.voiceOutbox, local]);
    HapticFeedback.selectionClick();
    await _sendSticker(local);
  }

  Future<void> _sendSticker(ChatMessage local) async {
    try {
      final sent = await _repo.sendSticker(
        id,
        local.clientMessageId!,
        stickerId: local.sticker!.id,
      );
      if (!ref.mounted) return;
      state = state.copyWith(
        voiceOutbox: state.voiceOutbox
            .where((m) => m.clientMessageId != local.clientMessageId)
            .toList(),
      );
      unawaited(ref.read(appSoundsProvider).messageOut());
      _merge([sent]);
      ref.invalidate(stickerLibraryProvider);
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.subscriptionRequired) {
        ref.read(outboxSenderProvider).subscriptionRequired.value = true;
      }
      _markVoice(local, DeliveryState.failed, e.code);
    } on Object {
      _markVoice(local, DeliveryState.failed, null);
    }
  }

  Future<void> _uploadAttachment(ChatMessage local) async {
    final a = local.attachment!;
    try {
      final fileId = await _repo.uploadAttachment(
        a.localBytes!,
        a.mime!,
        onProgress: (p) => _setProgress(local, p),
      );
      final sent = await _repo.sendAttachment(
        id,
        local.clientMessageId!,
        fileId: fileId,
        fileName: a.name,
        caption: local.body.isEmpty ? null : local.body,
      );
      if (!ref.mounted) return;
      state = state.copyWith(
        voiceOutbox: state.voiceOutbox
            .where((m) => m.clientMessageId != local.clientMessageId)
            .toList(),
      );
      unawaited(ref.read(appSoundsProvider).messageOut());
      _merge([sent]);
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.subscriptionRequired) {
        ref.read(outboxSenderProvider).subscriptionRequired.value = true;
      }
      _markVoice(local, DeliveryState.failed, e.code);
    } on Object {
      _markVoice(local, DeliveryState.failed, null);
    }
  }

  void _setProgress(ChatMessage local, double p) {
    if (!ref.mounted) return;
    state = state.copyWith(voiceOutbox: [
      for (final m in state.voiceOutbox)
        if (m.clientMessageId == local.clientMessageId && m.attachment != null)
          m.copyWith(attachment: m.attachment!.copyWith(progress: p))
        else
          m,
    ]);
  }

  /// OQ-040: the recipient played a note — tell the server once.
  Future<void> voicePlayed(ChatMessage m) async {
    final me = ref.read(currentUserIdProvider);
    final v = m.voice;
    if (m.isLocal || v == null || v.listened || m.senderId == me) return;
    _setListened(m.id);
    try {
      await _repo.listened(id, m.id);
    } on Object {
      // Best effort; the next play retries.
    }
  }

  void _setListened(String messageId) {
    if (!ref.mounted) return;
    state = state.copyWith(messages: [
      for (final m in state.messages)
        if (m.id == messageId && m.voice != null)
          m.copyWith(voice: m.voice!.copyWith(listened: true))
        else
          m,
    ]);
  }

  Future<void> retry(ChatMessage local) async {
    if (local.kind == MessageKind.sticker) {
      _markVoice(local, DeliveryState.sending, null);
      await _sendSticker(local.copyWith(delivery: DeliveryState.sending));
      return;
    }
    if (local.kind == MessageKind.attachment) {
      _markVoice(local, DeliveryState.sending, null);
      await _uploadAttachment(local.copyWith(delivery: DeliveryState.sending));
      return;
    }
    if (local.kind == MessageKind.voice) {
      _markVoice(local, DeliveryState.sending, null);
      await _uploadVoice(local.copyWith(delivery: DeliveryState.sending));
      return;
    }
    final owner = ref.read(currentUserIdProvider);
    final cmid = local.clientMessageId;
    if (owner == null || cmid == null) return;
    final db = ref.read(socialLocalDatabaseProvider);
    await db.sent(cmid);
    await db.enqueue(
        clientMessageId: cmid,
        ownerId: owner,
        conversationId: id,
        body: local.body);
    unawaited(ref.read(outboxSenderProvider).drain());
  }

  Future<void> discard(ChatMessage local) async {
    if (local.kind == MessageKind.attachment ||
        local.kind == MessageKind.sticker) {
      state = state.copyWith(
        voiceOutbox: state.voiceOutbox
            .where((m) => m.clientMessageId != local.clientMessageId)
            .toList(),
      );
      return;
    }
    if (local.kind == MessageKind.voice) {
      state = state.copyWith(
        voiceOutbox: state.voiceOutbox
            .where((m) => m.clientMessageId != local.clientMessageId)
            .toList(),
      );
      await deleteVoiceFile(local.voice?.localPath);
      return;
    }
    final cmid = local.clientMessageId;
    if (cmid != null) await ref.read(socialLocalDatabaseProvider).sent(cmid);
  }

  /// Marks the newest message from the other side as read (§8.4).
  Future<void> markRead() async {
    final me = ref.read(currentUserIdProvider);
    final newest =
        state.messages.where((m) => m.senderId != me && !m.isLocal).firstOrNull;
    if (newest == null || newest.id == _lastReadSent) return;
    _lastReadSent = newest.id;
    try {
      await _repo.read(id, newest.id);
    } on Object {
      _lastReadSent = null;
    }
  }

  /// "печатает…" for the other side, at most every 2 s.
  void typing(bool active) {
    final rt = ref.read(realtimeClientProvider);
    if (rt == null) return;
    final now = DateTime.now();
    if (active &&
        now.difference(_lastTypingSent) < const Duration(seconds: 2)) {
      return;
    }
    _lastTypingSent = active ? now : DateTime.fromMillisecondsSinceEpoch(0);
    rt.typing(id, active: active);
  }

  /// OQ-043: accept or delete a message request sent to me.
  Future<void> answerRequest({required bool accept}) async {
    final updated = await _repo.answerRequest(id, accept: accept);
    if (!ref.mounted) return;
    state = state.copyWith(conversation: updated);
    ref
      ..invalidate(messageRequestsProvider)
      ..invalidate(messageRequestsCountProvider)
      ..invalidate(conversationsProvider);
  }

  Future<void> setMuted(bool muted) async {
    final updated = await _repo.mute(
        id, muted ? DateTime.now().add(const Duration(days: 3650)) : null);
    if (ref.mounted) state = state.copyWith(conversation: updated);
  }

  void _onOutbox(List<OutboxRow> rows) {
    if (!ref.mounted) return;
    final sentIds = {
      for (final m in state.messages)
        if (m.clientMessageId != null) m.clientMessageId,
    };
    state = state.copyWith(outbox: [
      for (final r in rows)
        if (!sentIds.contains(r.clientMessageId))
          ChatMessage(
            id: 'local:${r.clientMessageId}',
            conversationId: id,
            senderId: ref.read(currentUserIdProvider),
            kind: MessageKind.text,
            body: r.body,
            clientMessageId: r.clientMessageId,
            createdAt: r.createdAt,
            delivery: r.failedCode == null
                ? DeliveryState.sending
                : DeliveryState.failed,
            failedCode: r.failedCode,
          ),
    ]);
  }

  void _merge(List<ChatMessage> incoming) {
    if (!ref.mounted || incoming.isEmpty) return;
    final byId = {for (final m in state.messages) m.id: m};
    for (final m in incoming) {
      byId[m.id] = m;
    }
    final merged = byId.values.toList()
      ..sort((a, b) {
        final t = b.createdAt.compareTo(a.createdAt);
        return t != 0 ? t : b.id.compareTo(a.id);
      });
    final done = {for (final m in incoming) m.clientMessageId};
    state = state.copyWith(
      messages: merged,
      outbox:
          state.outbox.where((o) => !done.contains(o.clientMessageId)).toList(),
    );
  }

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    switch (e.name) {
      case 'message:new':
        final m = ChatMappers.fromEvent(data);
        if (m != null && m.conversationId == id) {
          // OQ-044: a soft chime for the other side's message in an open,
          // unmuted chat (not for our own echo or call entries).
          final mine = m.senderId == ref.read(currentUserIdProvider);
          final known = state.messages.any((x) => x.id == m.id);
          if (!mine &&
              !known &&
              m.kind != MessageKind.call &&
              !(state.conversation?.muted ?? false) &&
              // Owner 2026-10-02: "Messages" off in Settings → no chime.
              !isCategoryMuted(ref, NotifCategory.messages)) {
            unawaited(ref.read(appSoundsProvider).messageIn());
          }
          _merge([m]);
          if (state.typing) state = state.copyWith(typing: false);
        }
      case 'message:read':
        if (data is Map && data['conversationId'] == id) {
          final c = state.conversation;
          final last = data['lastReadMessageId'];
          if (c != null && last is String) {
            state = state.copyWith(
              conversation: Conversation(
                id: c.id,
                caseId: c.caseId,
                caseTitle: c.caseTitle,
                status: c.status,
                contactsUnlocked: c.contactsUnlocked,
                counterpart: c.counterpart,
                lastMessage: c.lastMessage,
                lastMessageAt: c.lastMessageAt,
                unreadCount: c.unreadCount,
                mutedUntil: c.mutedUntil,
                counterpartLastReadId: last,
                updatedAt: c.updatedAt,
                isDirect: c.isDirect,
                request: c.request,
                requestedByMe: c.requestedByMe,
              ),
            );
          }
        }
      case 'message:listened':
        if (data is Map && data['conversationId'] == id) {
          final mid = data['messageId'];
          if (mid is String) _setListened(mid);
        }
      case 'typing':
        if (data is Map && data['conversationId'] == id) {
          final on = data['typing'] == true;
          state = state.copyWith(typing: on);
          _typingOff?.cancel();
          // §8.5: typing lives 5 s without a new event.
          if (on) {
            _typingOff = Timer(const Duration(seconds: 5), () {
              if (ref.mounted) state = state.copyWith(typing: false);
            });
          }
        }
      case 'conversation:update':
        if (data is Map && data['conversationId'] == id) {
          unawaited(_refreshConversation());
          unawaited(_catchUp());
        }
      case RealtimeEvent.reconnected:
        unawaited(_refreshConversation());
        unawaited(_catchUp());
    }
  }

  Future<void> _refreshConversation() async {
    try {
      final c = await _repo.conversation(id);
      if (ref.mounted) state = state.copyWith(conversation: c);
    } on Object {
      // Keep what is shown.
    }
  }

  /// §8.5: after a drop, fetch everything after the newest known message.
  Future<void> _catchUp() async {
    final newest = state.messages.where((m) => !m.isLocal).firstOrNull;
    if (newest == null) return load();
    try {
      _merge(await _repo.messagesAfter(id, newest.id));
    } on Object {
      // Next reconnect or open retries.
    }
  }
}

final chatThreadProvider = NotifierProvider.autoDispose
    .family<ChatThread, ChatThreadState, String>(ChatThread.new);
