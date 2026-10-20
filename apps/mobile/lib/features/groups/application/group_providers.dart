import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/groups/data/group_repository.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

Duration? _noRetry(int retryCount, Object error) => null;

final groupRepositoryProvider = Provider<GroupRepository>(
  (ref) => GroupRepository(ref.watch(dioProvider)),
);

/// The id of a realtime `group:*` payload, or null.
String? _groupIdOf(Object? data) =>
    data is Map ? data['groupId'] as String? : null;

// --- My groups (the chat list) ---

class GroupsNotifier extends PagedNotifier<api.GroupDto> {
  Timer? _debounce;

  @override
  Duration? get keepAliveFor => const Duration(minutes: 5);

  @override
  Future<PaginatedList<api.GroupDto>> build() {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'group:message' ||
          e.name == 'group:update' ||
          e.name == 'group:member_removed' ||
          e.name == 'badge:update' ||
          e.name == RealtimeEvent.reconnected) {
        _debounce?.cancel();
        _debounce = Timer(const Duration(milliseconds: 600), () {
          if (!ref.mounted) return;
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
  Future<CursorPage<api.GroupDto>> fetch(String? cursor) =>
      ref.read(groupRepositoryProvider).groups(cursor: cursor);

  @override
  Object idOf(api.GroupDto item) => item.id;
}

final groupsProvider = AsyncNotifierProvider.autoDispose<GroupsNotifier,
    PaginatedList<api.GroupDto>>(
  GroupsNotifier.new,
  retry: _noRetry,
);

// --- One group ---

/// The group with its members; re-read on every `group:update` for it.
final groupDetailProvider =
    FutureProvider.autoDispose.family<api.GroupDetailDto, String>((ref, id) {
  final sub = ref.watch(realtimeEventsProvider).listen((e) {
    if ((e.name == 'group:update' || e.name == RealtimeEvent.reconnected) &&
        (e.name == RealtimeEvent.reconnected || _groupIdOf(e.data) == id)) {
      ref.invalidateSelf();
    }
  });
  ref.onDispose(sub.cancel);
  return ref.watch(groupRepositoryProvider).group(id);
});

/// Topics of a forum group («General» first); re-read on `group:update`,
/// and on every new message (the unread pills move).
final groupTopicsProvider =
    FutureProvider.autoDispose.family<List<api.GroupTopicDto>, String>(
  (ref, id) {
    Timer? debounce;
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (!_touches(e, id)) return;
      debounce?.cancel();
      debounce = Timer(const Duration(milliseconds: 500), () {
        if (ref.mounted) ref.invalidateSelf();
      });
    });
    ref.onDispose(() {
      sub.cancel();
      debounce?.cancel();
    });
    return ref.watch(groupRepositoryProvider).topics(id);
  },
);

/// A `group:update` / `group:message` for [id], or a reconnect.
bool _touches(RealtimeEvent e, String id) {
  if (e.name == RealtimeEvent.reconnected) return true;
  final data = e.data;
  if (data is! Map) return false;
  if (e.name == 'group:update') return data['groupId'] == id;
  if (e.name != 'group:message') return false;
  final message = data['message'];
  return message is Map && message['groupId'] == id;
}

/// Join requests waiting for an admin.
final groupRequestsProvider =
    FutureProvider.autoDispose.family<List<api.GroupJoinRequestDto>, String>(
  (ref, id) => ref.watch(groupRepositoryProvider).requests(id),
);

// --- The messages of a group (or of one topic) ---

typedef GroupThreadKey = ({String groupId, String? topicId});

/// A message I wrote that the server has not confirmed yet.
class PendingGroupMessage {
  const PendingGroupMessage({
    required this.clientMessageId,
    required this.body,
    this.failed = false,
    this.replyToId,
    this.mentionIds = const [],
    this.fileName,
  });

  final String clientMessageId;
  final String body;
  final bool failed;
  final String? replyToId;
  final List<String> mentionIds;
  final String? fileName;
}

class GroupThreadState {
  const GroupThreadState({
    this.messages = const [],
    this.pending = const [],
    this.nextCursor,
    this.loading = true,
    this.loadingMore = false,
    this.error,
    this.removed = false,
  });

  /// Newest first (the list is built reversed).
  final List<api.GroupMessageDto> messages;
  final List<PendingGroupMessage> pending;
  final String? nextCursor;
  final bool loading;
  final bool loadingMore;
  final ApiException? error;

  /// I was removed from / left the group while it was open.
  final bool removed;

  bool get hasMore => nextCursor != null;

  GroupThreadState copyWith({
    List<api.GroupMessageDto>? messages,
    List<PendingGroupMessage>? pending,
    Object? nextCursor = _keep,
    bool? loading,
    bool? loadingMore,
    Object? error = _keep,
    bool? removed,
  }) =>
      GroupThreadState(
        messages: messages ?? this.messages,
        pending: pending ?? this.pending,
        nextCursor: identical(nextCursor, _keep)
            ? this.nextCursor
            : nextCursor as String?,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        error: identical(error, _keep) ? this.error : error as ApiException?,
        removed: removed ?? this.removed,
      );
}

const Object _keep = Object();

class GroupThread extends Notifier<GroupThreadState> {
  GroupThread(this.key);

  final GroupThreadKey key;
  String? _lastReadSent;
  int _seq = 0;

  GroupRepository get _repo => ref.read(groupRepositoryProvider);

  @override
  GroupThreadState build() {
    // The server only sends group events to the members; joining the room
    // (the same `conversation:join`) tells it the chat is open, so it does
    // not push what I am looking at.
    final realtime = ref.watch(realtimeClientProvider);
    realtime?.join(key.groupId);
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      sub.cancel();
      realtime?.leave(key.groupId);
    });
    unawaited(load());
    return const GroupThreadState();
  }

  Future<void> load() async {
    try {
      final page = await _repo.messages(key.groupId, topicId: key.topicId);
      if (!ref.mounted) return;
      state = state.copyWith(
        messages: page.items,
        nextCursor: page.nextCursor,
        loading: false,
        error: null,
      );
      unawaited(markRead());
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (cursor == null || state.loadingMore) return;
    state = state.copyWith(loadingMore: true);
    try {
      final page = await _repo.messages(
        key.groupId,
        topicId: key.topicId,
        cursor: cursor,
      );
      if (!ref.mounted) return;
      final known = state.messages.map((m) => m.id).toSet();
      state = state.copyWith(
        messages: [
          ...state.messages,
          ...page.items.where((m) => !known.contains(m.id)),
        ],
        nextCursor: page.nextCursor,
        loadingMore: false,
      );
    } on ApiException {
      if (ref.mounted) state = state.copyWith(loadingMore: false);
    }
  }

  bool _inThisThread(api.GroupMessageDto m) =>
      m.groupId == key.groupId &&
      (key.topicId == null ||
          m.topicId == key.topicId ||
          // «General» also holds the chat from before topics.
          m.topicId == null);

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    if (e.name == RealtimeEvent.reconnected) {
      unawaited(load());
    } else if (e.name == 'group:message' && data is Map) {
      final raw = data['message'];
      if (raw is! Map) return;
      final m = api.GroupMessageDto.fromJson(Map<String, Object?>.from(raw));
      if (!_inThisThread(m)) return;
      _upsert(m);
      if (!m.mine) unawaited(markRead());
    } else if (e.name == 'poll:update' && data is Map) {
      if (data['groupId'] != key.groupId) return;
      final poll = data['poll'];
      final messageId = data['messageId'];
      if (poll is! Map || messageId is! String) return;
      final updated = api.PollDto.fromJson(Map<String, Object?>.from(poll));
      final mine = data['actorId'] == ref.read(currentUserIdProvider);
      state = state.copyWith(
        messages: [
          for (final m in state.messages)
            if (m.id == messageId)
              // The event carries the neutral view (no «my vote»): keep mine.
              m.withPoll(_withMyVotes(updated, m.poll, mine ? null : m.poll))
            else
              m,
        ],
      );
    } else if (e.name == 'group:member_removed' &&
        data is Map &&
        data['groupId'] == key.groupId) {
      state = state.copyWith(removed: true);
    }
  }

  /// The event's poll has no «my vote»; keep what the screen already knew.
  api.PollDto _withMyVotes(
    api.PollDto fresh,
    api.PollDto? old,
    api.PollDto? keepFrom,
  ) {
    if (keepFrom == null) return fresh;
    final mine = keepFrom.myOptionIds;
    return api.PollDto(
      id: fresh.id,
      question: fresh.question,
      multiple: fresh.multiple,
      anonymous: fresh.anonymous,
      closed: fresh.closed,
      creatorId: fresh.creatorId,
      totalVoters: fresh.totalVoters,
      options: [
        for (final o in fresh.options)
          api.PollOptionDto(
            id: o.id,
            text: o.text,
            votes: o.votes,
            percent: o.percent,
            voted: mine.contains(o.id),
            recentVoters: o.recentVoters,
          ),
      ],
      myOptionIds: mine,
    );
  }

  void _upsert(api.GroupMessageDto m) {
    final list = [...state.messages];
    final at = list.indexWhere(
      (x) => x.id == m.id || x.clientMessageId == m.clientMessageId && x.mine,
    );
    if (at >= 0) {
      // A poll arrives with the viewer's own vote only in REST answers.
      list[at] = m.isPoll && m.poll != null && list[at].poll != null
          ? m.withPoll(_withMyVotes(m.poll!, list[at].poll, list[at].poll))
          : m;
    } else {
      list
        ..insert(0, m)
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }
    state = state.copyWith(
      messages: list,
      pending: [
        for (final p in state.pending)
          if (p.clientMessageId != m.clientMessageId) p,
      ],
    );
  }

  String _newClientId() =>
      'g${DateTime.now().microsecondsSinceEpoch}-${_seq++}';

  /// Send text (idempotent on the client id, so a retry never doubles).
  Future<void> sendText(
    String body, {
    String? replyToId,
    List<String> mentionIds = const [],
  }) {
    final text = body.trim();
    if (text.isEmpty) return Future.value();
    final cmid = _newClientId();
    state = state.copyWith(
      pending: [
        ...state.pending,
        PendingGroupMessage(
          clientMessageId: cmid,
          body: text,
          replyToId: replyToId,
          mentionIds: mentionIds,
        ),
      ],
    );
    return _send(
      api.SendGroupMessageDto(
        clientMessageId: cmid,
        type: api.SendGroupMessageDtoType.text,
        body: text,
        topicId: key.topicId,
        replyToId: replyToId,
        mentionIds: mentionIds.isEmpty ? null : mentionIds,
      ),
    );
  }

  /// Send an uploaded file (the caller uploaded it and holds the file id).
  Future<void> sendAttachment({
    required String fileId,
    required String fileName,
    String? caption,
    String? replyToId,
  }) {
    final cmid = _newClientId();
    state = state.copyWith(
      pending: [
        ...state.pending,
        PendingGroupMessage(
          clientMessageId: cmid,
          body: caption ?? '',
          fileName: fileName,
          replyToId: replyToId,
        ),
      ],
    );
    return _send(
      api.SendGroupMessageDto(
        clientMessageId: cmid,
        type: api.SendGroupMessageDtoType.attachment,
        body: caption,
        topicId: key.topicId,
        replyToId: replyToId,
        fileId: fileId,
        fileName: fileName,
      ),
    );
  }

  Future<void> _send(api.SendGroupMessageDto dto) async {
    try {
      final m = await _repo.send(key.groupId, dto);
      if (ref.mounted) _upsert(m);
    } on ApiException {
      if (!ref.mounted) return;
      state = state.copyWith(
        pending: [
          for (final p in state.pending)
            if (p.clientMessageId == dto.clientMessageId)
              PendingGroupMessage(
                clientMessageId: p.clientMessageId,
                body: p.body,
                failed: true,
                replyToId: p.replyToId,
                mentionIds: p.mentionIds,
                fileName: p.fileName,
              )
            else
              p,
        ],
      );
    }
  }

  /// Retry a failed text message with the same client id.
  Future<void> retry(String clientMessageId) async {
    final p = state.pending
        .where((x) => x.clientMessageId == clientMessageId)
        .firstOrNull;
    if (p == null || p.fileName != null) return;
    state = state.copyWith(
      pending: [
        for (final x in state.pending)
          if (x.clientMessageId == clientMessageId)
            PendingGroupMessage(
              clientMessageId: x.clientMessageId,
              body: x.body,
              replyToId: x.replyToId,
              mentionIds: x.mentionIds,
            )
          else
            x,
      ],
    );
    await _send(
      api.SendGroupMessageDto(
        clientMessageId: clientMessageId,
        type: api.SendGroupMessageDtoType.text,
        body: p.body,
        topicId: key.topicId,
        replyToId: p.replyToId,
        mentionIds: p.mentionIds.isEmpty ? null : p.mentionIds,
      ),
    );
  }

  void dropPending(String clientMessageId) => state = state.copyWith(
        pending: [
          for (final p in state.pending)
            if (p.clientMessageId != clientMessageId) p,
        ],
      );

  Future<void> edit(String messageId, String body) async {
    final m = await _repo.edit(key.groupId, messageId, body);
    if (ref.mounted) _upsert(m);
  }

  Future<void> deleteForEveryone(String messageId) async {
    await _repo.deleteMessage(key.groupId, messageId);
    if (!ref.mounted) return;
    // The server also sends the tombstone over realtime; show it at once.
    await load();
  }

  Future<void> pin(String? messageId) async {
    await _repo.pin(key.groupId, messageId);
    if (ref.mounted) ref.invalidate(groupDetailProvider(key.groupId));
  }

  /// A poll vote came back from REST with «my vote» filled in.
  void applyPoll(String messageId, api.PollDto poll) {
    state = state.copyWith(
      messages: [
        for (final m in state.messages)
          if (m.id == messageId) m.withPoll(poll) else m,
      ],
    );
  }

  /// Marks everything up to the newest message read (debounced by value).
  Future<void> markRead() async {
    final newest = state.messages.firstOrNull;
    if (newest == null || newest.id == _lastReadSent) return;
    _lastReadSent = newest.id;
    try {
      await _repo.read(key.groupId, newest.id);
      if (!ref.mounted) return;
      ref
        ..invalidate(groupsProvider)
        ..invalidate(groupTopicsProvider(key.groupId));
    } on ApiException {
      _lastReadSent = null;
    }
  }
}

final groupThreadProvider = NotifierProvider.autoDispose
    .family<GroupThread, GroupThreadState, GroupThreadKey>(GroupThread.new);
