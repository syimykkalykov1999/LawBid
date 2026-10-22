// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/media/image_size.dart';
import 'package:lawbid/core/media/video_size.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';
import 'package:lawbid/features/chat/data/chat_list_cache.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/notifications/application/call_mute.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart'
    show NotifCategory;
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stickers/application/stickers_providers.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Duration? _noRetry(int retryCount, Object error) => null;

/// Owner 2026-10-20 (speed): the chat list's saved first page, per account.
final chatListCacheProvider = Provider<ChatListCache>(
  (ref) => ChatListCache(ref.watch(savedJsonProvider)),
);

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ApiChatRepository(
    ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
    listCache: ref.watch(chatListCacheProvider),
  ),
);

// --- Conversations list (docs/05 §8.1) ---------------------------------------

class ConversationsNotifier extends PagedNotifier<Conversation> {
  Timer? _debounce;

  // Owner 2026-10-18 (speed): kept for 5 minutes after the screen leaves
  // (see PagedNotifier.keepAliveFor).
  @override
  Duration? get keepAliveFor => const Duration(minutes: 5);

  @override
  Future<PaginatedList<Conversation>> build() {
    // Owner 2026-10-21: remember which chats have their calls muted.
    listenSelf((_, AsyncValue<PaginatedList<Conversation>> next) {
      for (final c in next.value?.items ?? const <Conversation>[]) {
        ref
            .read(callMutedChatsProvider.notifier)
            .mark(c.id, muted: c.callsMuted);
      }
    });
    // New messages, closed chats, a reconnect: re-read the first page
    // (debounced, so a burst of events is one request).
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'message:new' ||
          e.name == 'conversation:update' ||
          e.name == 'message:read' ||
          e.name == 'message:updated' ||
          // Audit 2026-10-02: reading a chat on this or another device
          // only sends the reader a badge update — refresh the unread pills.
          e.name == 'badge:update' ||
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

  // Owner 2026-10-20 (speed, Telegram): the inbox opens on the list saved by
  // the last visit and refreshes in the background (see PagedNotifier).
  @override
  Future<CursorPage<Conversation>?> cachedFirstPage() =>
      ref.read(chatListCacheProvider).read();

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
  // A different list: the saved copy is the plain inbox only.
  @override
  Future<CursorPage<Conversation>?> cachedFirstPage() async => null;

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

  // Only the "All" folder is the saved list.
  @override
  Future<CursorPage<Conversation>?> cachedFirstPage() async =>
      folder == ChatListFolder.all ? super.cachedFirstPage() : null;

  @override
  Future<CursorPage<Conversation>> fetch(String? cursor) => ref
      .read(chatRepositoryProvider)
      .conversations(cursor: cursor, folder: folder);
}

final folderConversationsProvider = AsyncNotifierProvider.autoDispose.family<
    FolderConversationsNotifier, PaginatedList<Conversation>, ChatListFolder>(
  FolderConversationsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-18: the chats of a folder matching a search (`q` is sent
/// to the server: names, @username, case title, message text).
typedef ChatSearchKey = ({ChatListFolder folder, String q});

class SearchConversationsNotifier extends ConversationsNotifier {
  SearchConversationsNotifier(this.key);

  final ChatSearchKey key;

  @override
  Future<CursorPage<Conversation>?> cachedFirstPage() async => null;

  @override
  Future<CursorPage<Conversation>> fetch(String? cursor) =>
      ref.read(chatRepositoryProvider).conversations(
            cursor: cursor,
            folder: key.folder,
            requests: key.folder == ChatListFolder.requests,
            q: key.q,
          );
}

final searchConversationsProvider = AsyncNotifierProvider.autoDispose.family<
    SearchConversationsNotifier, PaginatedList<Conversation>, ChatSearchKey>(
  SearchConversationsNotifier.new,
  retry: _noRetry,
);

/// Waiting / Requests badges; re-read on chat events.
final chatFolderCountsProvider = FutureProvider.autoDispose<
    ({int waiting, int requests, int cases, int archived})>(
  (ref) {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'message:new' ||
          e.name == 'conversation:update' ||
          e.name == 'group:invite') {
        ref.invalidateSelf();
      }
    });
    ref.onDispose(sub.cancel);
    return ref.watch(chatRepositoryProvider).folderCounts();
  },
  retry: _noRetry,
);

/// After organizing a chat every folder list and the badges reload.
void refreshChatFolders(WidgetRef ref) {
  ref
    ..invalidate(folderConversationsProvider)
    ..invalidate(conversationsProvider)
    ..invalidate(chatFolderCountsProvider);
}

/// How many requests wait for me — the "Requests · N" row; re-read on new
/// messages and chat updates.
final messageRequestsCountProvider = FutureProvider.autoDispose<int>(
  (ref) {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'message:new' ||
          e.name == 'conversation:update' ||
          e.name == 'group:invite') {
        ref.invalidateSelf();
      }
    });
    ref.onDispose(sub.cancel);
    return ref.watch(chatRepositoryProvider).requestsCount();
  },
  retry: _noRetry,
);

// --- Outbox (docs/05 §8.4) --------------------------------------------------

/// Sends messages written offline, in order, each with its own
/// clientMessageId (the server's UQ makes a retry a no-op, so a message is
/// never delivered twice). Drains after each new message, when the
/// connection comes back and after a socket reconnect.
class OutboxSender with WidgetsBindingObserver {
  OutboxSender(this._ref) {
    // Telegram/WhatsApp: coming back to the app flushes the queue at once.
    WidgetsBinding.instance.addObserver(this);
    _ref
      ..listen(connectivityStatusProvider, (prev, next) {
        if (next.offlineReason == null && prev?.offlineReason != null) {
          unawaited(drain());
        }
      })
      ..listen(
        realtimeEventsProvider,
        (_, stream) {
          _sub?.cancel();
          _sub = stream.listen((e) {
            if (e.name == RealtimeEvent.reconnected) unawaited(drain());
          });
        },
        fireImmediately: true,
      )
      ..onDispose(() {
        _sub?.cancel();
        _retry?.cancel();
        WidgetsBinding.instance.removeObserver(this);
      });
  }

  final Ref _ref;
  StreamSubscription<RealtimeEvent>? _sub;
  Future<void>? _running;
  bool _again = false;

  /// A temporary failure schedules the next pass itself (a wait that grows
  /// 1 → 2 → 4 … 30 s): without it a message stuck on one timeout would sit
  /// at "sending" until the user wrote another one.
  Timer? _retry;
  int _failures = 0;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(drain());
  }

  /// The wait before retry number [failures] (1-based).
  @visibleForTesting
  static Duration backoff(int failures) {
    final s = 1 << (failures - 1).clamp(0, 5);
    return Duration(seconds: s > 30 ? 30 : s);
  }

  void _scheduleRetry() {
    _failures++;
    _retry?.cancel();
    _retry = Timer(backoff(_failures), () => unawaited(drain()));
  }

  /// Whether [e] is worth repeating as it is: no connection, a server that
  /// is down or busy, a token that is being renewed or a request that timed
  /// out. Anything else is a refusal the user has to see.
  static bool _temporary(ApiException e) {
    final c = e.statusCode ?? 500;
    return e.isNetworkError ||
        c == 401 ||
        c == 408 ||
        c == 425 ||
        c == 429 ||
        c >= 500;
  }

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
    // A conversation whose message just failed temporarily keeps its order
    // (nothing behind it goes first) but does not hold the other chats.
    final waiting = <String>{};
    var temporaryFailure = false;
    for (final row in await db.pending(owner)) {
      if (row.failedCode != null) continue;
      if (waiting.contains(row.conversationId)) continue;
      try {
        final m = await repo.send(
          row.conversationId,
          row.clientMessageId,
          row.body,
          replyToId: row.replyToId,
          forwarded: row.forwarded,
        );
        // Merge into the thread before the outbox row disappears, so the
        // bubble never blinks out.
        _sent.add(m);
        await db.sent(row.clientMessageId);
      } on ApiException catch (e) {
        if (_temporary(e)) {
          await db.attempted(row.clientMessageId);
          waiting.add(row.conversationId);
          temporaryFailure = true;
          continue;
        }
        if (e.code == ApiErrorCodes.subscriptionRequired) {
          subscriptionRequired.value = true;
        }
        await db.attempted(row.clientMessageId, failedCode: e.code);
      } on Object {
        // Not an API answer at all (a dropped socket, a parse error): the
        // message is still safe in the queue, try again later.
        await db.attempted(row.clientMessageId);
        waiting.add(row.conversationId);
        temporaryFailure = true;
      }
    }
    if (temporaryFailure) {
      _scheduleRetry();
    } else {
      _failures = 0;
      _retry?.cancel();
    }
  }
}

final outboxSenderProvider = Provider<OutboxSender>((ref) {
  final sender = OutboxSender(ref);
  ref.onDispose(sender._sent.close);
  return sender;
});

// --- Delivery receipts (WhatsApp's two grey ticks) ---------------------------

/// Tells the server that this device has received the other side's messages:
/// the newest one of each chat, shortly after it arrives. A device that was
/// offline gets the same from the server when the chat list is pulled.
class DeliveryAcker {
  DeliveryAcker(this._ref) {
    _ref.listen(
      realtimeEventsProvider,
      (_, stream) {
        _sub?.cancel();
        _sub = stream.listen(_onEvent);
      },
      fireImmediately: true,
    );
    _ref.onDispose(() {
      _sub?.cancel();
      for (final t in _timers.values) {
        t.cancel();
      }
    });
  }

  final Ref _ref;
  StreamSubscription<RealtimeEvent>? _sub;
  final _timers = <String, Timer>{};
  final _newest = <String, String>{};
  final _acked = <String, String>{};

  void _onEvent(RealtimeEvent e) {
    if (e.name != 'message:new') return;
    final m = ChatMappers.fromEvent(e.data);
    final me = _ref.read(currentUserIdProvider);
    if (m == null || me == null || m.senderId == me || m.senderId == null) {
      return;
    }
    if (m.kind == MessageKind.call) return;
    _newest[m.conversationId] = m.id;
    _timers[m.conversationId]?.cancel();
    _timers[m.conversationId] = Timer(
      const Duration(milliseconds: 300),
      () => unawaited(_send(m.conversationId)),
    );
  }

  Future<void> _send(String conversationId) async {
    final id = _newest[conversationId];
    if (id == null || _acked[conversationId] == id) return;
    try {
      await _ref.read(chatRepositoryProvider).delivered(conversationId, id);
      _acked[conversationId] = id;
    } on Object {
      // The server marks it when this device next pulls the chat list.
    }
  }
}

final deliveryAckerProvider = Provider<DeliveryAcker>(DeliveryAcker.new);

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
    this.typingVoice = false,
    this.voiceOutbox = const [],
    this.pins = const [],
    this.editWindowMin = 15,
    this.deleteForAllHours = 48,
    this.maxPins = 3,
    this.unreadFromId,
    this.unreadCount = 0,
  });

  final Conversation? conversation;

  /// Owner 2026-10-20: pinned messages (newest pin first) and the rules the
  /// server reports (admin-editable): edit window, delete-for-all window.
  final List<ChatMessage> pins;
  final int editWindowMin;
  final int deleteForAllHours;
  final int maxPins;

  /// Owner 2026-10-20: the oldest message that was unread when the chat was
  /// opened ("N unread messages" divider above it); fixed for the visit.
  final String? unreadFromId;
  final int unreadCount;

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

  /// Owner 2026-10-20: the other side is recording a voice message.
  final bool typingVoice;

  /// OQ-040: voice notes being uploaded/sent (or failed), oldest first.
  final List<ChatMessage> voiceOutbox;

  /// Newest first, the outbox on top.
  List<ChatMessage> get all {
    final pending = [...outbox, ...voiceOutbox]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    // Owner 2026-10-21: disappearing messages vanish by the clock, before
    // the server's sweep (and from a cached page) reaches the device.
    final now = DateTime.now();
    return [
      ...pending,
      ...messages.where((m) => !m.isExpired(now)),
    ];
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
    bool? typingVoice,
    List<ChatMessage>? voiceOutbox,
    List<ChatMessage>? pins,
    int? editWindowMin,
    int? deleteForAllHours,
    int? maxPins,
    String? unreadFromId,
    int? unreadCount,
  }) =>
      ChatThreadState(
        unreadFromId: unreadFromId ?? this.unreadFromId,
        unreadCount: unreadCount ?? this.unreadCount,
        pins: pins ?? this.pins,
        editWindowMin: editWindowMin ?? this.editWindowMin,
        deleteForAllHours: deleteForAllHours ?? this.deleteForAllHours,
        maxPins: maxPins ?? this.maxPins,
        conversation: conversation ?? this.conversation,
        messages: messages ?? this.messages,
        outbox: outbox ?? this.outbox,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        error: clearError ? null : (error ?? this.error),
        loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
        typing: typing ?? this.typing,
        typingVoice: typingVoice ?? this.typingVoice,
        voiceOutbox: voiceOutbox ?? this.voiceOutbox,
      );
}

class ChatThread extends Notifier<ChatThreadState> {
  ChatThread(this.id);

  final String id;
  Timer? _typingOff;
  Timer? _expiryTimer;
  String? _lastReadSent;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  @override
  ChatThreadState build() {
    final owner = ref.watch(currentUserIdProvider);
    final realtime = ref.watch(realtimeClientProvider);
    realtime?.join(id);
    // Owner 2026-10-22: the chat is open — its notification goes.
    unawaited(chatNotificationsChannel.clearChat(id));

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
      _expiryTimer?.cancel();
      realtime?.leave(id);
    });
    // Owner 2026-10-21: wake up at the next message that runs out.
    listenSelf((prev, next) {
      if (!identical(prev?.messages, next.messages)) _armExpiry();
    });
    unawaited(Future.microtask(load));
    return const ChatThreadState();
  }

  /// Owner 2026-10-21: one timer for the soonest expiring message; when it
  /// fires the expired ones leave the state and the next one is armed.
  void _armExpiry() {
    _expiryTimer?.cancel();
    DateTime? soonest;
    for (final m in state.messages) {
      final at = m.expiresAt;
      if (at != null && (soonest == null || at.isBefore(soonest))) {
        soonest = at;
      }
    }
    if (soonest == null) return;
    final wait = soonest.difference(DateTime.now());
    _expiryTimer = Timer(
      wait.isNegative ? Duration.zero : wait + const Duration(milliseconds: 50),
      () {
        if (!ref.mounted) return;
        final now = DateTime.now();
        state = state.copyWith(
          messages: [
            for (final m in state.messages)
              if (!m.isExpired(now)) m,
          ],
        );
      },
    );
  }

  /// Owner 2026-10-21: switch the disappearing-messages timer (null = off).
  Future<void> setDisappearing(int? afterS) async {
    final updated = await _repo.setDisappearing(id, afterS);
    if (!ref.mounted) return;
    state = state.copyWith(conversation: updated);
    ref
      ..invalidate(conversationsProvider)
      ..invalidate(folderConversationsProvider);
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
      final conv = results[0] as Conversation;
      final me = ref.read(currentUserIdProvider);
      String? firstUnread;
      if (state.unreadFromId == null && conv.unreadCount > 0) {
        // Newest first: the unread ones are the newest from the other side.
        var left = conv.unreadCount;
        for (final m in page.items) {
          if (m.senderId == me || m.isLocal) continue;
          firstUnread = m.id;
          if (--left == 0) break;
        }
      }
      state = state.copyWith(
        conversation: conv,
        unreadFromId: firstUnread,
        unreadCount: firstUnread == null ? null : conv.unreadCount,
        messages: page.items,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loading: false,
      );
      unawaited(ref.read(outboxSenderProvider).drain());
      unawaited(loadPins());
    } on Object catch (e) {
      if (ref.mounted) state = state.copyWith(loading: false, error: e);
    }
  }

  /// Pinned messages plus the edit/delete windows (all server-side rules).
  Future<void> loadPins() async {
    try {
      final info = await _repo.pins(id);
      if (!ref.mounted) return;
      state = state.copyWith(
        pins: info.items,
        editWindowMin: info.editWindowMin,
        deleteForAllHours: info.deleteForAllHours,
        maxPins: info.maxPins,
      );
    } on Object {
      // Keep the defaults; the server still enforces the rules.
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
  Future<void> send(String text, {String? replyToId}) async {
    final body = text.trim();
    final owner = ref.read(currentUserIdProvider);
    if (body.isEmpty || owner == null) return;
    await ref.read(socialLocalDatabaseProvider).enqueue(
          clientMessageId: newClientMessageId(),
          ownerId: owner,
          conversationId: id,
          body: body,
          replyToId: replyToId,
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
      // Your own note plays from the recording, not from a download.
      await adoptVoiceFileAsCache(v.localPath, sent.id);
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
    state = state.copyWith(
      voiceOutbox: [
        for (final m in state.voiceOutbox)
          if (m.clientMessageId == local.clientMessageId)
            m.copyWith(delivery: d, failedCode: code)
          else
            m,
      ],
    );
  }

  /// OQ-047: a picked photo or document → a local bubble with progress →
  /// upload → send. A failure keeps the bubble with Retry.
  Future<void> sendAttachment({
    required Uint8List bytes,
    required String name,
    required String mime,
    String? caption,

    /// Owner 2026-10-19 (albums): files picked together upload at once but
    /// are sent in the picked order — this one waits for `after` (the
    /// previous file's send) so the album keeps its order and the caption
    /// stays on the last.
    Future<void>? after,
  }) async {
    final owner = ref.read(currentUserIdProvider);
    if (owner == null) return;
    final cmid = newClientMessageId();
    final isImage = mime.startsWith('image/');
    final px = isImage
        ? await imageSizeOf(bytes)
        : (mime.startsWith('video/') ? videoSizeOf(bytes) : null);
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
        isImage: isImage,
        mime: mime,
        sizeBytes: bytes.length,
        localBytes: bytes,
        width: px?.width.round(),
        height: px?.height.round(),
      ),
    );
    state = state.copyWith(voiceOutbox: [...state.voiceOutbox, local]);
    await _uploadAttachment(local, after: after);
  }

  /// Owner 2026-10-05: a document template — a local bubble, then the
  /// server's own copy is sent (no upload from the phone); Retry repeats.
  Future<void> sendTemplate(DocTemplate tpl, {String? caption}) async {
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
        name: tpl.fileName,
        isImage: false,
        mime: tpl.mime,
        sizeBytes: tpl.sizeBytes,
      ),
    );
    _templateOf[cmid] = tpl.id;
    state = state.copyWith(voiceOutbox: [...state.voiceOutbox, local]);
    await _sendTemplateCopy(local);
  }

  /// Local template bubbles → the template they send (for Retry).
  final _templateOf = <String, String>{};

  Future<void> _sendTemplateCopy(ChatMessage local) async {
    final cmid = local.clientMessageId!;
    try {
      final fileId = await ref
          .read(templatesRepositoryProvider)
          .copy(_templateOf[cmid]!, TemplateTarget.chat);
      final sent = await _repo.sendAttachment(
        id,
        cmid,
        fileId: fileId,
        fileName: local.attachment!.name,
        caption: local.body.isEmpty ? null : local.body,
      );
      if (!ref.mounted) return;
      _templateOf.remove(cmid);
      state = state.copyWith(
        voiceOutbox:
            state.voiceOutbox.where((m) => m.clientMessageId != cmid).toList(),
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

  /// Owner 2026-10-20: an attorney's card ([contactUserId]) or a place
  /// ([place], an address). Sent at once; a refusal goes to the caller.
  Future<void> sendCard({String? contactUserId, String? place}) async {
    assert(
      (contactUserId == null) != (place == null),
      'a card is either a contact or a place',
    );
    final repo = ref.read(chatExtrasRepositoryProvider);
    final cmid = newClientMessageId();
    try {
      final sent = contactUserId != null
          ? await repo.sendContact(id, cmid, contactUserId)
          : await repo.sendPlace(id, cmid, place!);
      if (!ref.mounted) return;
      unawaited(ref.read(appSoundsProvider).messageOut());
      _merge([sent]);
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.subscriptionRequired) {
        ref.read(outboxSenderProvider).subscriptionRequired.value = true;
      }
      rethrow;
    }
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
    // ignore: unawaited_futures
    HapticFeedback.selectionClick();
    await _sendSticker(local);
  }

  /// Owner 2026-10-20: a gift paid in stars. Not shown before the server
  /// has charged it; throws like an API call (INSUFFICIENT_STARS …) so the
  /// gift sheet can answer. The same [clientMessageId] never charges twice.
  Future<void> sendGift(
    String giftId, {
    required String clientMessageId,
    String? note,
  }) async {
    final sent = ChatMappers.message(
      await ref
          .read(starsRepositoryProvider)
          .sendInChat(id, clientMessageId, giftId, note: note),
    );
    if (!ref.mounted) return;
    unawaited(ref.read(appSoundsProvider).messageOut());
    _merge([sent]);
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

  Future<void> _uploadAttachment(
    ChatMessage local, {
    Future<void>? after,
  }) async {
    final a = local.attachment!;
    try {
      final fileId = await _repo.uploadAttachment(
        a.localBytes!,
        a.mime!,
        onProgress: (p) => _setProgress(local, p),
      );
      if (after != null) await after;
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
    state = state.copyWith(
      voiceOutbox: [
        for (final m in state.voiceOutbox)
          if (m.clientMessageId == local.clientMessageId &&
              m.attachment != null)
            m.copyWith(attachment: m.attachment!.copyWith(progress: p))
          else
            m,
      ],
    );
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
    state = state.copyWith(
      messages: [
        for (final m in state.messages)
          if (m.id == messageId && m.voice != null)
            m.copyWith(voice: m.voice!.copyWith(listened: true))
          else
            m,
      ],
    );
  }

  Future<void> retry(ChatMessage local) async {
    if (local.kind == MessageKind.sticker) {
      _markVoice(local, DeliveryState.sending, null);
      await _sendSticker(local.copyWith(delivery: DeliveryState.sending));
      return;
    }
    if (local.kind == MessageKind.attachment &&
        _templateOf.containsKey(local.clientMessageId)) {
      _markVoice(local, DeliveryState.sending, null);
      await _sendTemplateCopy(local.copyWith(delivery: DeliveryState.sending));
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
      body: local.body,
      replyToId: local.replyTo?.id,
      forwarded: local.forwarded,
    );
    unawaited(ref.read(outboxSenderProvider).drain());
  }

  // --- Owner 2026-10-20: what you can do with a message -------------------

  /// Whether [m] is mine, a text, and still inside the edit window.
  bool canEdit(ChatMessage m) =>
      !m.isLocal &&
      !m.revoked &&
      m.kind == MessageKind.text &&
      m.senderId == ref.read(currentUserIdProvider) &&
      DateTime.now().difference(m.createdAt) <
          Duration(minutes: state.editWindowMin);

  /// Whether [m] is mine and can still be deleted for everyone.
  bool canDeleteForAll(ChatMessage m) =>
      !m.isLocal &&
      !m.revoked &&
      m.kind != MessageKind.system &&
      m.kind != MessageKind.call &&
      m.senderId == ref.read(currentUserIdProvider) &&
      DateTime.now().difference(m.createdAt) <
          Duration(hours: state.deleteForAllHours);

  Future<void> edit(ChatMessage m, String body) async {
    final sent = await _repo.editMessage(id, m.id, body.trim());
    _apply(sent);
  }

  /// Throws the API error (the screen maps the code to a message).
  Future<void> delete(ChatMessage m, {required bool all}) async {
    await _repo.deleteMessage(id, m.id, all: all);
    if (all) {
      _apply(
        m.copyWith(revoked: true, body: '', reactions: const [], pinned: false),
      );
    } else {
      _drop(m.id);
    }
  }

  Future<void> react(ChatMessage m, String? emoji) async {
    final sent = await _repo.react(id, m.id, emoji);
    _apply(sent);
  }

  Future<void> setPinned(ChatMessage m, {required bool pinned}) async {
    final sent = await _repo.setPinned(id, m.id, pinned: pinned);
    _apply(sent);
  }

  void _drop(String messageId) {
    if (!ref.mounted) return;
    state = state.copyWith(
      messages: state.messages.where((x) => x.id != messageId).toList(),
      pins: state.pins.where((x) => x.id != messageId).toList(),
    );
  }

  /// A changed message (edit, reaction, pin, revoke): replace it in place and
  /// keep the pinned list in step.
  void _apply(ChatMessage m) {
    if (!ref.mounted) return;
    final known = state.messages.any((x) => x.id == m.id);
    final pins = [
      for (final p in state.pins)
        if (p.id != m.id) p,
    ];
    if (m.pinned && !m.revoked) pins.insert(0, m);
    state = state.copyWith(
      messages: [
        for (final x in state.messages)
          if (x.id == m.id) m else x,
      ],
      pins: pins,
    );
    if (!known) _merge([m]);
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
      // Audit 2026-10-02: the chat list and its folders drop this pill now.
      ref
        ..invalidate(conversationsProvider)
        ..invalidate(folderConversationsProvider);
    } on Object {
      _lastReadSent = null;
    }
  }

  /// "печатает…" for the other side, at most every 2 s.
  // ignore: avoid_positional_boolean_parameters
  void typing(bool active, {bool voice = false}) {
    final rt = ref.read(realtimeClientProvider);
    if (rt == null) return;
    final now = DateTime.now();
    if (active &&
        now.difference(_lastTypingSent) < const Duration(seconds: 2)) {
      return;
    }
    _lastTypingSent = active ? now : DateTime.fromMillisecondsSinceEpoch(0);
    rt.typing(id, active: active, voice: voice);
  }

  /// OQ-043: accept or delete a message request sent to me.
  Future<void> answerRequest({required bool accept}) async {
    final updated = await _repo.answerRequest(id, accept: accept);
    if (!ref.mounted) return;
    state = state.copyWith(conversation: updated);
    ref
      ..invalidate(messageRequestsProvider)
      ..invalidate(messageRequestsCountProvider)
      ..invalidate(conversationsProvider)
      // Audit 2026-10-02: folders and their counts follow at once.
      ..invalidate(folderConversationsProvider)
      ..invalidate(chatFolderCountsProvider);
  }

  // ignore: avoid_positional_boolean_parameters
  Future<void> setMuted(bool muted) async {
    final updated = await _repo.mute(
      id,
      muted ? DateTime.now().add(const Duration(days: 3650)) : null,
    );
    if (!ref.mounted) return;
    state = state.copyWith(conversation: updated);
    // Audit 2026-10-04: the lists show the mute mark at once.
    ref
      ..invalidate(conversationsProvider)
      ..invalidate(folderConversationsProvider);
  }

  /// Owner 2026-10-21 (WhatsApp): mute for an hour, 8 hours, a week, always.
  Future<void> setMutedUntil(DateTime? until) async {
    final updated = await _repo.mute(id, until);
    if (!ref.mounted) return;
    state = state.copyWith(conversation: updated);
    ref
      ..invalidate(conversationsProvider)
      ..invalidate(folderConversationsProvider);
  }

  // ignore: avoid_positional_boolean_parameters
  Future<void> setCallsMuted(bool muted) async {
    final updated = await _repo.muteCalls(id, muted: muted);
    if (!ref.mounted) return;
    ref.read(callMutedChatsProvider.notifier).mark(id, muted: muted);
    state = state.copyWith(conversation: updated);
    ref
      ..invalidate(conversationsProvider)
      ..invalidate(folderConversationsProvider);
  }

  ReplyPreview? _previewOf(String? messageId) {
    if (messageId == null) return null;
    final m = state.messages.where((x) => x.id == messageId).firstOrNull;
    return m == null ? null : ReplyPreview.of(m);
  }

  void _onOutbox(List<OutboxRow> rows) {
    if (!ref.mounted) return;
    final sentIds = {
      for (final m in state.messages)
        if (m.clientMessageId != null) m.clientMessageId,
    };
    state = state.copyWith(
      outbox: [
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
              forwarded: r.forwarded,
              replyTo: _previewOf(r.replyToId),
              delivery: r.failedCode == null
                  ? DeliveryState.sending
                  : DeliveryState.failed,
              failedCode: r.failedCode,
            ),
      ],
    );
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
      case 'message:updated':
        if (data is Map && data['conversationId'] == id) {
          final gone = data['messageId'];
          if (data['hiddenForMe'] == true && gone is String) _drop(gone);
        } else {
          final m = ChatMappers.fromEvent(data);
          if (m != null && m.conversationId == id) _apply(m);
        }
      case 'message:read':
        if (data is Map && data['conversationId'] == id) {
          final c = state.conversation;
          final last = data['lastReadMessageId'];
          if (c != null && last is String) {
            state = state.copyWith(
              conversation: c.withReceipts(
                readId: last,
                readAt:
                    DateTime.tryParse('${data['readAt']}') ?? DateTime.now(),
                // Reading it means it got there.
                deliveredId: last,
              ),
            );
          }
        }
      case 'message:delivered':
        if (data is Map && data['conversationId'] == id) {
          final c = state.conversation;
          final last = data['lastDeliveredMessageId'];
          if (c != null && last is String) {
            state = state.copyWith(
              conversation: c.withReceipts(deliveredId: last),
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
          state = state.copyWith(
            typing: on,
            typingVoice: on && data['kind'] == 'voice',
          );
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
