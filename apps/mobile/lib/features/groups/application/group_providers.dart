import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/data/group_list_cache.dart';
import 'package:lawbid/features/groups/data/group_repository.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/notifications/application/call_mute.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

Duration? _noRetry(int retryCount, Object error) => null;

final groupRepositoryProvider = Provider<GroupRepository>(
  (ref) => GroupRepository(ref.watch(dioProvider)),
);

/// Owner 2026-10-22 (package B): the first page of my groups, per account.
final groupListCacheProvider = Provider<GroupListCache>(
  (ref) => GroupListCache(ref.watch(savedJsonProvider)),
);

/// The id of a realtime `group:*` payload, or null.
String? _groupIdOf(Object? data) =>
    data is Map ? data['groupId'] as String? : null;

// --- My groups (the chat list) ---

/// Owner 2026-10-22 (client economy plan, package B, Telegram): the list
/// of my groups is never reloaded whole. `group:message` moves its row
/// (preview, time, unread), `group:update` replaces the shared part of the
/// card, `group:member_removed` drops it, `badge:update` touches nothing;
/// a reconnect or a return to the saved copy is one `?updatedSince`.
class GroupsNotifier extends SyncedListNotifier<api.GroupDto> {
  bool get archived => false;

  @override
  String get listKey => archived ? 'groups:archived' : 'groups';

  @override
  String? get syncOwner => ref.read(currentUserIdProvider);

  @override
  SyncStateStore? get syncStore => ref.read(cacheDatabaseProvider);

  @override
  String keyOf(api.GroupDto item) => item.id;

  @override
  DateTime? updatedAtOf(api.GroupDto item) => item.updatedAt;

  @override
  int Function(api.GroupDto, api.GroupDto)? get order => compareGroups;

  @override
  Future<PaginatedList<api.GroupDto>> build() {
    // Owner 2026-10-21: remember which groups have their calls muted.
    listenSelf((_, AsyncValue<PaginatedList<api.GroupDto>> next) {
      for (final g in next.value?.items ?? const <api.GroupDto>[]) {
        ref
            .read(callMutedChatsProvider.notifier)
            .mark(g.id, muted: g.callsMuted);
      }
    });
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(sub.cancel);
    return super.build();
  }

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    switch (e.name) {
      case 'group:message':
        final raw = data is Map ? data['message'] : null;
        if (raw is! Map) return;
        final m = api.GroupMessageDto.fromJson(Map<String, Object?>.from(raw));
        final held = applyRow(
          m.groupId,
          (g) => g == null ? null : applyGroupMessage(g, m),
        );
        // A group this list does not hold (new, further down): ask once.
        if (!held && !archived) catchUp();
      case 'group:update':
        if (data is! Map) return;
        final id = data['groupId'];
        if (id is! String) return;
        final kind = data['kind'];
        if (kind == 'deleted') {
          removeRow(id);
          return;
        }
        final card = data['card'];
        if (card is Map) {
          final held = applyRow(
            id,
            (g) => g == null
                ? null
                : applyGroupCard(g, Map<String, Object?>.from(card)),
          );
          if (!held) catchUp();
        } else if (kind == 'added' || kind == 'request' || kind == 'invites') {
          // I was added / a request was answered: the row is new here.
          catchUp();
        }
      case 'group:member_removed':
        final id = _groupIdOf(data);
        if (id != null) removeRow(id);
      case RealtimeEvent.reconnected:
        catchUp();
    }
  }

  // Owner 2026-10-22: the list opens on the copy saved by the last visit
  // and catches up with `updatedSince` (SyncedListNotifier).
  @override
  Future<CursorPage<api.GroupDto>?> cachedFirstPage() =>
      archived ? Future.value() : ref.read(groupListCacheProvider).read();

  @override
  Future<CursorPage<api.GroupDto>> fetchPage(String? cursor) async {
    final page = await ref
        .read(groupRepositoryProvider)
        .groups(cursor: cursor, archived: archived);
    if (cursor == null && !archived) {
      ref.read(groupListCacheProvider).save(page.items);
    }
    return page;
  }

  @override
  Future<SyncedPage<api.GroupDto>> fetchChanged(DateTime since) => ref
      .read(groupRepositoryProvider)
      .groupsChangedSince(since, archived: archived);

  @override
  Object idOf(api.GroupDto item) => item.id;

  /// A write of my own (mute, pin, hide, archive) answered the row.
  void applyMine(api.GroupDto g) => upsertRow(g);

  /// I read the group (this device): its unread counters are zero.
  void markReadLocally(String groupId) => applyRow(
        groupId,
        (g) => g == null || (g.unreadCount == 0 && g.unreadMentions == 0)
            ? null
            : api.GroupDto.fromJson({
                ...g.toJson(),
                'unreadCount': 0,
                'unreadMentions': 0,
              }),
      );
}

/// The server's order: pinned first, then the newest activity.
int compareGroups(api.GroupDto a, api.GroupDto b) {
  if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
  final byTime = (b.lastMessageAt ?? b.updatedAt)
      .compareTo(a.lastMessageAt ?? a.updatedAt);
  return byTime != 0 ? byTime : b.id.compareTo(a.id);
}

/// A new message in [g]: preview, time and (not mine) one more unread.
/// The same message twice, or one older than the preview, changes nothing.
api.GroupDto applyGroupMessage(api.GroupDto g, api.GroupMessageDto m) {
  final shownAt = g.lastMessageAt;
  if (g.lastMessage?.id == m.id ||
      (shownAt != null && m.createdAt.isBefore(shownAt))) {
    return g;
  }
  return api.GroupDto.fromJson({
    ...g.toJson(),
    'lastMessage': m.toJson(),
    'lastMessageAt': m.createdAt.toIso8601String(),
    if (!m.mine) 'unreadCount': g.unreadCount + 1,
    'updatedAt': (m.createdAt.isAfter(g.updatedAt) ? m.createdAt : g.updatedAt)
        .toIso8601String(),
  });
}

/// The shared part of the card from `group:update` (title, avatar, member
/// count, settings …) over the row; my own fields (role, unread, rights)
/// stay as they are.
api.GroupDto applyGroupCard(api.GroupDto g, Map<String, Object?> card) {
  const shared = {
    'title',
    'description',
    'avatarUrl',
    'avatarFullUrl',
    'memberCount',
    'type',
    'username',
    'joinApproval',
    'topicsEnabled',
    'generalTopicId',
    'whoCanPost',
    'whoCanAdd',
    'whoCanEditInfo',
    'whoCanCall',
    'whoCanMedia',
    'whoCanPoll',
    'whoCanPin',
    'showServiceMessages',
    'disappearAfterS',
    'protectContent',
    'lastMessageAt',
    'updatedAt',
  };
  final json = g.toJson();
  for (final e in card.entries) {
    if (shared.contains(e.key) && e.value != null) json[e.key] = e.value;
  }
  try {
    return api.GroupDto.fromJson(json);
  } on Object {
    return g;
  }
}

final groupsProvider = AsyncNotifierProvider.autoDispose<GroupsNotifier,
    PaginatedList<api.GroupDto>>(
  GroupsNotifier.new,
  retry: _noRetry,
);

/// Owner 2026-10-20: my archived groups (the Archive screen).
class ArchivedGroupsNotifier extends GroupsNotifier {
  @override
  bool get archived => true;
}

final archivedGroupsProvider = AsyncNotifierProvider.autoDispose<
    ArchivedGroupsNotifier, PaginatedList<api.GroupDto>>(
  ArchivedGroupsNotifier.new,
  retry: _noRetry,
);

/// «Recommended» groups for the «Find groups» screen: ranked on the server
/// from my people, practice, region and activity, paged by a cursor.
class RecommendedGroupsNotifier
    extends PagedNotifier<api.GroupInvitePreviewDto> {
  @override
  Future<CursorPage<api.GroupInvitePreviewDto>> fetch(String? cursor) =>
      ref.read(groupRepositoryProvider).discover(cursor: cursor);

  @override
  Object idOf(api.GroupInvitePreviewDto item) => item.id;
}

final recommendedGroupsProvider = AsyncNotifierProvider.autoDispose<
    RecommendedGroupsNotifier, PaginatedList<api.GroupInvitePreviewDto>>(
  RecommendedGroupsNotifier.new,
  retry: _noRetry,
);

// --- Invitations (owner 2026-10-21) ---

/// Group invitations waiting for my answer; re-read on `group:invite`.
final groupInvitesProvider =
    FutureProvider.autoDispose<List<api.GroupInviteDto>>(
  (ref) {
    final sub = ref.watch(realtimeEventsProvider).listen((e) {
      if (e.name == 'group:invite' ||
          e.name == 'badge:update' ||
          e.name == RealtimeEvent.reconnected) {
        ref.invalidateSelf();
      }
    });
    ref.onDispose(sub.cancel);
    return ref.watch(groupRepositoryProvider).invites();
  },
  retry: _noRetry,
);

/// What lies behind one invitation; one read per card, no automatic retry.
final groupInvitePreviewProvider =
    FutureProvider.autoDispose.family<api.GroupInvitePreviewDetailDto, String>(
  (ref, id) => ref.watch(groupRepositoryProvider).invitePreview(id),
  retry: _noRetry,
);

// --- One group ---

/// The kinds of `group:update` after which the card / the topics are
/// read again (package B); every other kind is applied to the list row.
const kGroupRereadKinds = {'members', 'settings', 'info', 'topics', 'pinned'};

bool _rereads(RealtimeEvent e, String id) {
  if (e.name == RealtimeEvent.reconnected) return true;
  final data = e.data;
  return e.name == 'group:update' &&
      data is Map &&
      data['groupId'] == id &&
      kGroupRereadKinds.contains(data['kind']);
}

/// The group with its members; re-read on a `group:update` that changes
/// it (members, settings, topics, pinned) and after a reconnect.
final groupDetailProvider =
    FutureProvider.autoDispose.family<api.GroupDetailDto, String>((ref, id) {
  final sub = ref.watch(realtimeEventsProvider).listen((e) {
    if (_rereads(e, id)) ref.invalidateSelf();
  });
  ref.onDispose(sub.cancel);
  return ref.watch(groupRepositoryProvider).group(id);
});

/// Topics of a forum group («General» first). Package B: a new message
/// moves its topic's unread pill locally; a `group:update` about topics /
/// settings and a reconnect bring only the changed topics (`updatedSince`).
class GroupTopics extends AsyncNotifier<List<api.GroupTopicDto>> {
  GroupTopics(this.groupId);

  final String groupId;
  DateTime? _syncedAt;

  @override
  Future<List<api.GroupTopicDto>> build() async {
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(sub.cancel);
    final topics = await ref.read(groupRepositoryProvider).topics(groupId);
    _syncedAt = DateTime.now().toUtc();
    return topics;
  }

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    if (e.name == 'group:message' && data is Map) {
      final raw = data['message'];
      if (raw is! Map || raw['groupId'] != groupId) return;
      final m = api.GroupMessageDto.fromJson(Map<String, Object?>.from(raw));
      final current = state.value;
      if (current == null) return;
      state = AsyncData([
        for (final t in current)
          if (t.id == m.topicId || (m.topicId == null && t.isGeneral))
            api.GroupTopicDto.fromJson({
              ...t.toJson(),
              'lastMessage': m.toJson(),
              'lastMessageAt': m.createdAt.toIso8601String(),
              if (!m.mine) 'unreadCount': t.unreadCount + 1,
            })
          else
            t,
      ]);
    } else if (_rereads(e, groupId)) {
      unawaited(_catchUp());
    }
  }

  Future<void> _catchUp() async {
    final since = _syncedAt;
    final current = state.value;
    if (since == null || current == null) {
      ref.invalidateSelf();
      return;
    }
    try {
      final page = await ref.read(groupRepositoryProvider).topicsChangedSince(
            groupId,
            since.subtract(const Duration(seconds: 2)),
          );
      if (!ref.mounted) return;
      _syncedAt = page.syncedAt ?? DateTime.now().toUtc();
      if (page.items.isEmpty) return;
      final byId = {for (final t in page.items) t.id: t};
      state = AsyncData([
        for (final t in current) byId.remove(t.id) ?? t,
        ...byId.values,
      ]);
    } on ApiException {
      ref.invalidateSelf();
    }
  }

  /// I read [topicId]: its pill goes.
  void markRead(String topicId) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData([
      for (final t in current)
        if (t.id == topicId && (t.unreadCount != 0 || t.unreadMentions != 0))
          api.GroupTopicDto.fromJson({
            ...t.toJson(),
            'unreadCount': 0,
            'unreadMentions': 0,
          })
        else
          t,
    ]);
  }

  /// A topic write answered the whole list.
  void setAll(List<api.GroupTopicDto> topics) => state = AsyncData(topics);

  /// A topic read / created / edited here: the row from the answer.
  void apply(api.GroupTopicDto topic) {
    final current = state.value;
    if (current == null) return;
    final i = current.indexWhere((t) => t.id == topic.id);
    state = AsyncData(
      i < 0 ? [...current, topic] : ([...current]..[i] = topic),
    );
  }
}

final groupTopicsProvider = AsyncNotifierProvider.autoDispose
    .family<GroupTopics, List<api.GroupTopicDto>, String>(GroupTopics.new);

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
  Timer? _expiryTimer;

  GroupRepository get _repo => ref.read(groupRepositoryProvider);

  @override
  GroupThreadState build() {
    // The server only sends group events to the members; joining the room
    // (the same `conversation:join`) tells it the chat is open, so it does
    // not push what I am looking at.
    final realtime = ref.watch(realtimeClientProvider);
    realtime?.join(key.groupId);
    // Owner 2026-10-22: the group is open — its notification goes.
    unawaited(chatNotificationsChannel.clearChat(key.groupId));
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      sub.cancel();
      _expiryTimer?.cancel();
      realtime?.leave(key.groupId);
    });
    // Owner 2026-10-21: disappearing messages leave the list by the clock.
    listenSelf((prev, next) {
      if (!identical(prev?.messages, next.messages)) _armExpiry();
    });
    unawaited(load());
    return const GroupThreadState();
  }

  /// Drops the messages that ran out and arms one timer for the next one.
  void _armExpiry() {
    _expiryTimer?.cancel();
    final now = DateTime.now();
    if (state.messages.any((m) => m.isExpired(now))) {
      state = state.copyWith(
        messages: [
          for (final m in state.messages)
            if (!m.isExpired(now)) m,
        ],
      );
      return;
    }
    DateTime? soonest;
    for (final m in state.messages) {
      final at = m.expiresAt;
      if (at != null && (soonest == null || at.isBefore(soonest))) {
        soonest = at;
      }
    }
    if (soonest == null) return;
    _expiryTimer = Timer(
      soonest.difference(now) + const Duration(milliseconds: 50),
      _armExpiry,
    );
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

  /// Owner 2026-10-22 (package B): after a reconnect only what came after
  /// the newest message is asked for (`afterId`); more than the server
  /// gives at once (409) → the page again.
  Future<void> catchUp() async {
    final newest = state.messages.firstOrNull;
    if (newest == null) return load();
    try {
      final fresh = await _repo.messagesAfter(
        key.groupId,
        newest.id,
        topicId: key.topicId,
      );
      if (!ref.mounted) return;
      for (final m in fresh) {
        if (_inThisThread(m)) _upsert(m);
      }
      if (fresh.any((m) => !m.mine)) unawaited(markRead());
    } on ApiException {
      if (ref.mounted) unawaited(load());
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
      unawaited(catchUp());
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
      // Package B: the unread counters are zeroed here, nothing re-read.
      ref.read(groupsProvider.notifier).markReadLocally(key.groupId);
      final topicId = key.topicId;
      if (topicId != null) {
        ref.read(groupTopicsProvider(key.groupId).notifier).markRead(topicId);
      }
    } on ApiException {
      _lastReadSent = null;
    }
  }
}

final groupThreadProvider = NotifierProvider.autoDispose
    .family<GroupThread, GroupThreadState, GroupThreadKey>(GroupThread.new);
