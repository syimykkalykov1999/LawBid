import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/chat_media_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/media/stable_network_image.dart'
    show stableImageCacheKey;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/chat/application/chat_thread_memory.dart'
    show CachedMessageStore, ThreadMemory;
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart' show VoiceNote;
import 'package:lawbid/features/groups/application/group_media_outbox.dart';
import 'package:lawbid/features/groups/data/group_list_cache.dart';
import 'package:lawbid/features/groups/data/group_repository.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/notifications/application/call_mute.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

Duration? _noRetry(int retryCount, Object error) => null;

/// Owner 2026-11-16 (row 183): the admin switch «Группы в чатах» (flag
/// `groups`, on by default, independent of `channelsEnabledProvider`; the
/// same pattern). Off = no
/// group anywhere: the lists below are empty without a request, the saved
/// copy is not shown, the group routes show nothing (GroupsGate).
final groupsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('groups'),
);

/// Owner 2026-11-16 18:25 CT (row 183): «Звонки в группах» (flag
/// `groups_calls`, on by default): off = no call button in group chats.
/// 1:1 calls and channel calls read their own switches.
final groupChatCallsEnabledProvider = Provider<bool>(
  (ref) =>
      ref.watch(groupsEnabledProvider) &&
      ref.watch(featureFlagsControllerProvider).isEnabled('groups_calls'),
);

final groupRepositoryProvider = Provider<GroupRepository>(
  (ref) => GroupRepository(
    ref.watch(dioProvider),
    // Owner 2026-11-03: group pictures are indexed as group media («Данные
    // и память»: the groups' auto-delete age). Never blocks the chat.
    noteMedia: (id, urls) => unawaited(
      ref
          .read(chatMediaIndexProvider)
          .note(
            id,
            {for (final u in urls) stableImageCacheKey(u) ?? u},
            isGroup: true,
          )
          .catchError((Object _) {}),
    ),
  ),
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
    // Row 183: «Группы» off = no groups, no request, no saved copy.
    if (!ref.watch(groupsEnabledProvider)) {
      return Future.value(const PaginatedList<api.GroupDto>(items: []));
    }
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
      archived || !ref.read(groupsEnabledProvider)
          ? Future.value()
          : ref.read(groupListCacheProvider).read();

  @override
  Future<CursorPage<api.GroupDto>> fetchPage(String? cursor) async {
    // Row 183: a refresh / catch-up while «Группы» is off asks nothing.
    if (!ref.read(groupsEnabledProvider)) {
      return const CursorPage<api.GroupDto>(items: []);
    }
    final page = await ref
        .read(groupRepositoryProvider)
        .groups(cursor: cursor, archived: archived);
    if (cursor == null && !archived) {
      ref.read(groupListCacheProvider).save(page.items);
    }
    return page;
  }

  /// How many rows a copy re-saved after a catch-up keeps (a first page).
  static const _copyRows = 50;

  // The copy follows «caught up to»: without this the next cold start shows
  // the page of the last full read and asks only for changes since a later
  // time, so a group changed in between stayed old on screen.
  @override
  void didMerge(List<api.GroupDto> items) {
    if (archived) return;
    ref.read(groupListCacheProvider).save(items.take(_copyRows).toList());
  }

  @override
  Future<SyncedPage<api.GroupDto>> fetchChanged(DateTime since) =>
      ref.read(groupsEnabledProvider)
          ? ref
              .read(groupRepositoryProvider)
              .groupsChangedSince(since, archived: archived)
          : Future.value(const SyncedPage<api.GroupDto>(items: []));

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
  // Verify 17.11: the preview itself edited or deleted for everyone — it is
  // replaced, the unread count stays (the old text stayed in the list).
  if (g.lastMessage?.id == m.id) {
    return api.GroupDto.fromJson({...g.toJson(), 'lastMessage': m.toJson()});
  }
  if (shownAt != null && m.createdAt.isBefore(shownAt)) return g;
  // Verify 17.11: service lines and tombstones are not unread (as the
  // server's count, which skips `system`).
  final counts =
      !m.mine && m.type != api.GroupMessageDtoType.system && !m.deleted;
  return api.GroupDto.fromJson({
    ...g.toJson(),
    'lastMessage': m.toJson(),
    'lastMessageAt': m.createdAt.toIso8601String(),
    if (counts) 'unreadCount': g.unreadCount + 1,
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
  Future<PaginatedList<api.GroupInvitePreviewDto>> build() {
    // Row 183: «Группы» off = nothing to recommend, no request.
    if (!ref.watch(groupsEnabledProvider)) {
      return Future.value(
        const PaginatedList<api.GroupInvitePreviewDto>(items: []),
      );
    }
    return super.build();
  }

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
    // Row 183: «Группы» off = no invitations shown, no request.
    if (!ref.watch(groupsEnabledProvider)) return const [];
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

/// Groups WhatsApp parity: where the unsent text of a group (or of one of
/// its topics) waits in the 1:1 chat's drafts (chatTextDraftsProvider).
/// Group ids never clash with chat ids (both are server UUIDs).
String groupDraftKey(String groupId, String? topicId) =>
    topicId == null ? groupId : '$groupId/$topicId';

/// Groups WhatsApp parity (the 1:1 `MessageStore`): where a group thread
/// (the group, or one topic of a forum group) keeps its copy on the phone.
/// A prefix of its own, so a group never shares rows with a 1:1 chat.
String groupThreadStoreKey(GroupThreadKey key) => key.topicId == null
    ? 'group:${key.groupId}'
    : 'group:${key.groupId}/${key.topicId}';

api.GroupMessageDto _groupMessageOf(Object? json) =>
    api.GroupMessageDto.fromJson(Map<String, dynamic>.from(json! as Map));

/// Groups WhatsApp parity: the group threads on the phone — the same store
/// as the 1:1 chats' (`cached_messages`, the «Сообщения» limit and LRU of
/// Settings → Data and storage), rows are the server's `GroupMessageDto`.
final groupMessageStoreProvider =
    Provider<CachedMessageStore<api.GroupMessageDto>?>((ref) {
  final owner = ref.watch(currentUserIdProvider);
  if (owner == null) return null;
  final store = CachedMessageStore<api.GroupMessageDto>(
    ref.watch(cacheDatabaseProvider),
    owner,
    limitBytes: () =>
        ref.read(cacheLimitsProvider).limitBytes(CacheStore.messages),
    decode: _groupMessageOf,
    encode: (m) => m.toJson(),
    idOf: (m) => m.id,
    createdAtOf: (m) => m.createdAt,
    imageUrlsOf: (m) => [
      if (m.attachment?.isImage ?? false) ...[
        m.attachment!.url,
        m.attachment!.previewUrl,
      ],
    ],
  );
  ref.onDispose(store.dispose);
  return store;
});

/// Groups WhatsApp parity (R-404 (c) of 1:1 chats): the newest page of the
/// group threads opened recently, in memory — a group opened again draws
/// its messages in the same first frame as its header.
final groupThreadMemoryProvider =
    Provider<ThreadMemory<api.GroupMessageDto>>((ref) {
  ref.watch(currentUserIdProvider);
  return ThreadMemory<api.GroupMessageDto>();
});

/// ROUND1 25.11 row 16 (the 1:1 chat keeps an unsent message in its
/// outbox): the texts — and files sent without the queue — of a group thread
/// that the server has not confirmed yet («sending» or «Not sent», with
/// Retry), per thread, for as long as the app runs. Leaving the group no
/// longer drops them (the thread is auto-disposed); a send that ends after
/// the thread closed writes its result here, and a thread open again takes
/// it ([changes]). Files and voice notes of the queue are on disk already.
/// Like the 1:1 outbox (and the drafts, chatTextDraftsProvider) the rows
/// are on the device per account (SharedPreferences): after the app was
/// killed they are back, and those that were still being sent go out again
/// with the same client id ([unsentAtStart]; the server keeps one message
/// per id).
class GroupUnsent {
  GroupUnsent({SharedPreferences? prefs, String key = ''})
      : _prefs = prefs,
        _key = key {
    _load();
  }

  final SharedPreferences? _prefs;
  final String _key;
  final _byThread = <String, List<PendingGroupMessage>>{};
  final _changes = StreamController<String>.broadcast(sync: true);

  /// Rows read from the device that were «sending» when the app stopped.
  final _restarted = <String>{};

  List<PendingGroupMessage> of(String thread) => _byThread[thread] ?? const [];

  /// The rows of [thread] that were in flight when the app was killed (each
  /// returned once: the thread that opens sends them again).
  List<PendingGroupMessage> unsentAtStart(String thread) {
    final out = [
      for (final p in of(thread))
        if (_restarted.remove(p.clientMessageId)) p,
    ];
    return out;
  }

  /// The open thread's own copy (no event: it is the one that changed).
  void put(String thread, List<PendingGroupMessage> rows) {
    if (rows.isEmpty) {
      if (_byThread.remove(thread) == null) return;
    } else {
      _byThread[thread] = List.unmodifiable(rows);
    }
    _save();
  }

  void _load() {
    final raw = _prefs?.getString(_key);
    if (raw == null) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      for (final e in decoded.entries) {
        final rows = e.value;
        if (e.key is! String || rows is! List) continue;
        final list = [
          for (final r in rows)
            if (r is Map && r['id'] is String && r['body'] is String)
              PendingGroupMessage(
                clientMessageId: r['id'] as String,
                body: r['body'] as String,
                failed: r['failed'] == true,
                replyToId: r['replyTo'] as String?,
                mentionIds: [
                  for (final m in (r['mentions'] as List?) ?? const [])
                    if (m is String) m,
                ],
                fileName: r['fileName'] as String?,
                fileId: r['fileId'] as String?,
              ),
        ];
        if (list.isEmpty) continue;
        _byThread[e.key as String] = List.unmodifiable(list);
        _restarted.addAll([
          for (final p in list)
            if (!p.failed) p.clientMessageId,
        ]);
      }
    } on FormatException {
      // A broken copy: nothing to restore.
    }
  }

  void _save() {
    final prefs = _prefs;
    if (prefs == null) return;
    final rows = {
      for (final e in _byThread.entries)
        e.key: [
          for (final p in e.value)
            {
              'id': p.clientMessageId,
              'body': p.body,
              if (p.failed) 'failed': true,
              if (p.replyToId != null) 'replyTo': p.replyToId,
              if (p.mentionIds.isNotEmpty) 'mentions': p.mentionIds,
              if (p.fileName != null) 'fileName': p.fileName,
              if (p.fileId != null) 'fileId': p.fileId,
            },
        ],
    };
    unawaited(
      (rows.isEmpty
              ? prefs.remove(_key)
              : prefs.setString(_key, jsonEncode(rows)))
          .catchError((Object _) => false),
    );
  }

  /// A send that ended while its thread was closed: confirmed (gone) or
  /// refused ([failed] takes the row's place).
  void settle(
    String thread,
    String clientMessageId, {
    PendingGroupMessage? failed,
  }) {
    put(thread, [
      for (final p in of(thread))
        if (p.clientMessageId != clientMessageId)
          p
        else if (failed != null)
          failed,
    ]);
    if (!_changes.isClosed) _changes.add(thread);
  }

  /// The threads [settle] changed.
  Stream<String> get changes => _changes.stream;

  void dispose() => unawaited(_changes.close());
}

/// Per account: the next account never sees these.
final groupUnsentProvider = Provider<GroupUnsent>((ref) {
  final user = ref.watch(currentUserIdProvider);
  SharedPreferences? prefs;
  try {
    prefs = user == null ? null : ref.read(sharedPreferencesProvider);
  } on Object {
    // No device storage (a test without it): memory only.
  }
  final unsent = GroupUnsent(prefs: prefs, key: 'group.unsent.v1.$user');
  ref.onDispose(unsent.dispose);
  return unsent;
});

/// A message I wrote that the server has not confirmed yet.
class PendingGroupMessage {
  const PendingGroupMessage({
    required this.clientMessageId,
    required this.body,
    this.failed = false,
    this.replyToId,
    this.mentionIds = const [],
    this.fileName,
    this.fileId,
    this.slowWaitS,
    this.voice,
  });

  final String clientMessageId;
  final String body;
  final bool failed;

  /// Owner 2026-11-02 (slow mode): the server refused for now; seconds left.
  final int? slowWaitS;
  final String? replyToId;
  final List<String> mentionIds;
  final String? fileName;

  /// Audit 26.10 B9: the uploaded file of an attachment sent without the
  /// queue, so Retry sends it again (queued files retry in the queue).
  final String? fileId;

  /// Groups WhatsApp parity: a queued voice note (its recording plays from
  /// the phone while it is being sent, as in 1:1).
  final VoiceNote? voice;

  /// This message refused by the server («Not sent», Retry).
  PendingGroupMessage asFailed({int? slowWaitS}) => PendingGroupMessage(
        clientMessageId: clientMessageId,
        body: body,
        failed: true,
        slowWaitS: slowWaitS,
        replyToId: replyToId,
        mentionIds: mentionIds,
        fileName: fileName,
        fileId: fileId,
      );
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

  CachedMessageStore<api.GroupMessageDto>? get _store =>
      ref.read(groupMessageStoreProvider);
  String get _storeKey => groupThreadStoreKey(key);

  /// The marker cursor while older pages still come from the phone (1:1).
  static const localCursor = 'local';

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
    // R-255: the files of this group waiting in the upload queue.
    final media = ref.read(groupMediaOutboxProvider);
    final owner = media.ownerId;
    final jobs = owner == null
        ? null
        : media.db
            .watchTarget(owner, key.groupId, kindPrefix: GroupMediaKind.prefix)
            .listen(_onMediaJobs);
    final sent = ref.read(groupMediaSentProvider).stream.listen((m) {
      if (_inThisThread(m)) _upsert(m);
    });
    ref.onDispose(() {
      sub.cancel();
      unawaited(jobs?.cancel());
      unawaited(sent.cancel());
      _expiryTimer?.cancel();
      realtime?.leave(key.groupId);
    });
    // Owner 2026-10-21: disappearing messages leave the list by the clock.
    final memory = ref.read(groupThreadMemoryProvider);
    // ROUND1 25.11 row 16: what is not confirmed outlives this thread.
    final unsent = ref.read(groupUnsentProvider);
    final settled = unsent.changes.listen((thread) {
      if (thread == _storeKey) _adoptUnsent();
    });
    ref.onDispose(() => unawaited(settled.cancel()));
    listenSelf((prev, next) {
      if (!identical(prev?.messages, next.messages)) {
        _armExpiry();
        // Groups WhatsApp parity: the newest page stays in memory.
        memory.put(_storeKey, next.messages);
      }
      if (!identical(prev?.pending, next.pending)) {
        unsent.put(_storeKey, [
          for (final p in next.pending)
            if (!_mediaIds.contains(p.clientMessageId)) p,
        ]);
      }
    });
    unawaited(load());
    // The page this group left in memory is drawn in the first frame;
    // load() brings the phone's copy and the server's delta on top.
    final now = DateTime.now();
    final warm = [
      for (final m in memory.take(_storeKey) ?? const <api.GroupMessageDto>[])
        if (!m.isExpired(now)) m,
    ];
    final waiting = unsent.of(_storeKey);
    // Killed while these were being sent: they go again (same client id).
    final again = unsent.unsentAtStart(_storeKey);
    if (again.isNotEmpty) {
      scheduleMicrotask(() {
        if (ref.mounted) {
          for (final p in again) {
            unawaited(_send(_dtoOf(p)));
          }
        }
      });
    }
    return warm.isEmpty
        ? GroupThreadState(pending: waiting)
        : GroupThreadState(
            messages: warm,
            pending: waiting,
            nextCursor: localCursor,
            loading: false,
          );
  }

  /// The request of a pending text or (already uploaded) file.
  api.SendGroupMessageDto _dtoOf(PendingGroupMessage p) => p.fileId != null
      ? api.SendGroupMessageDto(
          clientMessageId: p.clientMessageId,
          type: api.SendGroupMessageDtoType.attachment,
          body: p.body.isEmpty ? null : p.body,
          topicId: key.topicId,
          replyToId: p.replyToId,
          fileId: p.fileId,
          fileName: p.fileName,
        )
      : api.SendGroupMessageDto(
          clientMessageId: p.clientMessageId,
          type: api.SendGroupMessageDtoType.text,
          body: p.body,
          topicId: key.topicId,
          replyToId: p.replyToId,
          mentionIds: p.mentionIds.isEmpty ? null : p.mentionIds,
        );

  /// A send of a closed instance of this thread ended: its row goes (sent)
  /// or turns «Not sent»; the queue's rows stay as they are.
  void _adoptUnsent() {
    state = state.copyWith(
      pending: [
        ...ref.read(groupUnsentProvider).of(_storeKey),
        for (final p in state.pending)
          if (_mediaIds.contains(p.clientMessageId)) p,
      ],
    );
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

  /// Groups WhatsApp parity (the 1:1 `ChatThread.load`, package C): the
  /// group opens on the phone's copy at once, the server is asked only for
  /// what came after the newest message on the phone (`afterId`); a group
  /// without a copy reads its first page (and saves it).
  Future<void> load() async {
    final store = _store;
    if (store != null) {
      final local = await store.page(_storeKey);
      if (!ref.mounted) return;
      final now = DateTime.now();
      final shown = [
        for (final m in local)
          if (!m.isExpired(now)) m,
      ];
      if (shown.isNotEmpty) {
        unawaited(store.touch(_storeKey));
        // What came meanwhile (realtime, the memory page) is at least as
        // fresh as the disk: it wins for the same id.
        final byId = {for (final m in shown) m.id: m};
        for (final m in state.messages) {
          byId[m.id] = m;
        }
        final merged = byId.values.toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        state = state.copyWith(
          messages: merged,
          nextCursor: state.nextCursor ?? localCursor,
          loading: false,
          error: null,
        );
        unawaited(catchUp());
        return;
      }
    }
    await _loadPage();
  }

  /// The newest page from the server (it replaces the list: a stale copy
  /// goes) and onto the phone.
  Future<void> _loadPage() async {
    try {
      final page = await _repo.messages(key.groupId, topicId: key.topicId);
      if (!ref.mounted) return;
      state = state.copyWith(
        messages: page.items,
        nextCursor: page.nextCursor,
        loading: false,
        error: null,
      );
      unawaited(
        _store?.put(
              _storeKey,
              page.items,
              nextCursor: page.nextCursor,
              complete: page.nextCursor == null,
            ) ??
            Future.value(),
      );
      unawaited(markRead());
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(loading: false, error: e);
    }
  }

  /// Owner 2026-10-22 (package B): after a reconnect (and after opening on
  /// the phone's copy) only what came after the newest message is asked
  /// for (`afterId`); more than the server gives at once (409) or a newest
  /// message the server no longer has (404) → the copy goes, the page
  /// again. No network: the copy stays as it is (the next reconnect asks).
  Future<void> catchUp() async {
    final newest = state.messages.firstOrNull;
    if (newest == null) return _loadPage();
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
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      if (e.code == ApiException.networkErrorCode) return;
      if (e.code == ApiErrorCodes.syncTooOld || e.statusCode == 404) {
        await _store?.forget(_storeKey);
        if (!ref.mounted) return;
      }
      unawaited(_loadPage());
    }
  }

  /// After a failed older page the footer (which asks again on every
  /// build) must not hammer the server: the next try waits a few seconds.
  DateTime? _loadMoreRetryAt;

  Future<void>? _loadMoreRunning;

  /// One older page; a second caller waits for the one already running.
  Future<void> loadMore() {
    final running = _loadMoreRunning;
    if (running != null) return running;
    final f = _loadMore().whenComplete(() => _loadMoreRunning = null);
    _loadMoreRunning = f;
    return f;
  }

  Future<void> _loadMore() async {
    final cursor = state.nextCursor;
    if (cursor == null || state.loadingMore) return;
    final retryAt = _loadMoreRetryAt;
    if (retryAt != null && DateTime.now().isBefore(retryAt)) return;
    state = state.copyWith(loadingMore: true);
    if (cursor == localCursor) return _loadMoreLocal();
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
      _loadMoreRetryAt = null;
      unawaited(
        _store?.put(
              _storeKey,
              page.items,
              nextCursor: page.nextCursor,
              complete: page.nextCursor == null,
            ) ??
            Future.value(),
      );
    } on Object {
      _loadMoreRetryAt = DateTime.now().add(const Duration(seconds: 5));
      if (ref.mounted) state = state.copyWith(loadingMore: false);
    }
  }

  /// Older messages from the phone; when it has no more, the server's page
  /// after the oldest one on the phone (its cursor was saved with it) — the
  /// 1:1 `ChatThread._loadMoreLocal`.
  Future<void> _loadMoreLocal() async {
    final store = _store;
    final oldest = state.messages.lastOrNull;
    try {
      final older = store == null || oldest == null
          ? const <api.GroupMessageDto>[]
          : await store.page(_storeKey, before: oldest.createdAt);
      if (!ref.mounted) return;
      final now = DateTime.now();
      final known = state.messages.map((m) => m.id).toSet();
      final shown = [
        for (final m in older)
          if (!known.contains(m.id) && !m.isExpired(now)) m,
      ];
      if (shown.isNotEmpty) {
        state = state.copyWith(
          messages: [...state.messages, ...shown],
          loadingMore: false,
        );
        return;
      }
      final history = await store?.history(_storeKey);
      if (!ref.mounted) return;
      if (history != null && history.complete) {
        state = state.copyWith(nextCursor: null, loadingMore: false);
        return;
      }
      // No saved cursor (the copy grew from events only): the first page
      // again — it merges by id and brings the cursor for the rest.
      final page = await _repo.messages(
        key.groupId,
        topicId: key.topicId,
        cursor: history?.nextCursor,
      );
      if (!ref.mounted) return;
      final have = state.messages.map((m) => m.id).toSet();
      state = state.copyWith(
        messages: [
          ...state.messages,
          ...page.items.where((m) => !have.contains(m.id)),
        ]..sort((a, b) => b.createdAt.compareTo(a.createdAt)),
        nextCursor: page.nextCursor,
        loadingMore: false,
      );
      _loadMoreRetryAt = null;
      unawaited(
        store?.put(
              _storeKey,
              page.items,
              nextCursor: page.nextCursor,
              complete: page.nextCursor == null,
            ) ??
            Future.value(),
      );
    } on Object {
      _loadMoreRetryAt = DateTime.now().add(const Duration(seconds: 5));
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
      final changed =
          state.messages.where((m) => m.id == messageId).firstOrNull;
      if (changed != null) {
        unawaited(_store?.put(_storeKey, [changed]) ?? Future.value());
      }
    } else if (e.name == 'group:member_removed' &&
        data is Map &&
        data['groupId'] == key.groupId) {
      // Out of the group: its copy on the phone goes too.
      unawaited(_store?.forget(_storeKey) ?? Future.value());
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
    // Groups WhatsApp parity: every new or changed message is on the phone
    // for the next open (1:1: the repository and the sync ledger).
    unawaited(_store?.put(_storeKey, [m]) ?? Future.value());
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
          fileId: fileId,
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

  /// Owner 2026-11-08 (every upload finishes): files read into memory (flag
  /// `group_files_from_disk` off) go up and out as messages even when the
  /// group screen is closed meanwhile — the thread is kept alive until the
  /// last message left, instead of the screen stopping at `mounted`.
  Future<void> uploadAndSend<T>({
    required List<T> items,
    required int atOnce,
    required Future<String> Function(T item) upload,
    required Future<void> Function(int index, T item, String fileId) send,
  }) async {
    final release = ref.keepAlive().close;
    try {
      await uploadThenSendInOrder<T, String>(
        items: items,
        atOnce: atOnce,
        upload: upload,
        send: send,
      );
    } finally {
      release();
    }
  }

  /// R-255 (flag `group_files_from_disk`): a picked file goes through the
  /// persistent queue. With [path] it stays on disk (then [bytes] is empty):
  /// it is copied to the queue folder and sent from there.
  Future<void> queueAttachment({
    required Uint8List bytes,
    required String name,
    required String mime,
    String? path,
    String? caption,
    String? replyToId,
  }) async {
    // Read before the first await: the screen may be left meanwhile (this
    // provider is auto-disposed) and the file must still be queued.
    final queue = ref.read(groupMediaOutboxProvider);
    final files = ref.read(uploadFilesProvider);
    final cmid = _newClientId();
    final file = path != null
        ? await files.keep('$cmid.bin', fromPath: path)
        : await files.keep('$cmid.bin', bytes: bytes);
    await queue.enqueue(
      id: cmid,
      kind: GroupMediaKind.attachment,
      target: key.groupId,
      payload: {
        'name': name,
        'caption': caption?.trim() ?? '',
        if (key.topicId != null) 'topicId': key.topicId,
        if (replyToId != null) 'replyToId': replyToId,
      },
      fileName: file,
      mime: mime,
    );
  }

  /// Groups WhatsApp parity (voice): a recorded note goes through the
  /// persistent queue like a 1:1 one (ChatThread.sendVoice): the file is
  /// moved into the queue folder, the job uploads it and sends it.
  Future<void> sendVoice({
    required String path,
    required int durationMs,
    required List<int> waveform,
    String? replyToId,
  }) async {
    // Read before the first await: the screen may be left meanwhile.
    final queue = ref.read(groupMediaOutboxProvider);
    final files = ref.read(uploadFilesProvider);
    final sounds = ref.read(appSoundsProvider);
    if (queue.ownerId == null) return;
    final cmid = _newClientId();
    final ext = path.toLowerCase().endsWith('.webm') || kIsWeb ? 'webm' : 'm4a';
    final name = await files.keep('$cmid.$ext', fromPath: path, move: true);
    unawaited(sounds.messageOut());
    await queue.enqueue(
      id: cmid,
      kind: GroupMediaKind.voice,
      target: key.groupId,
      payload: {
        'durationMs': durationMs,
        'waveform': waveform,
        if (key.topicId != null) 'topicId': key.topicId,
        if (replyToId != null) 'replyToId': replyToId,
      },
      fileName: name,
    );
  }

  /// Client ids of this thread's queued files, shown as pending bubbles.
  Set<String> _mediaIds = const {};

  /// The recordings of queued voice notes, by clientMessageId.
  final _voicePaths = <String, String?>{};

  /// The queue's jobs of this group → pending bubbles of this thread.
  Future<void> _onMediaJobs(List<UploadJobRow> rows) async {
    if (!ref.mounted) return;
    final jobs = [
      for (final r in rows)
        if (UploadJob.fromRow(r) case final j
            when key.topicId == null || j.payload['topicId'] == key.topicId)
          j,
    ];
    final files = ref.read(uploadFilesProvider);
    for (final j in jobs) {
      final n = j.fileName;
      if (j.kind == GroupMediaKind.voice &&
          n != null &&
          !_voicePaths.containsKey(j.id)) {
        _voicePaths[j.id] = await files.pathOf(n);
      }
    }
    if (!ref.mounted) return;
    final live = {for (final j in jobs) j.id};
    _voicePaths.removeWhere((k, _) => !live.contains(k));
    final old = _mediaIds;
    _mediaIds = {for (final j in jobs) j.id};
    final delivered = {for (final m in state.messages) m.clientMessageId};
    state = state.copyWith(
      pending: [
        for (final p in state.pending)
          if (!old.contains(p.clientMessageId)) p,
        for (final j in jobs)
          if (!delivered.contains(j.id) && j.kind == GroupMediaKind.voice)
            PendingGroupMessage(
              clientMessageId: j.id,
              body: '',
              replyToId: j.payload['replyToId'] as String?,
              failed: j.failed,
              voice: VoiceNote(
                localPath: _voicePaths[j.id],
                durationMs: (j.payload['durationMs'] as num?)?.toInt() ?? 0,
                waveform: [
                  for (final v in (j.payload['waveform'] as List?) ?? const [])
                    (v as num).toInt(),
                ],
                listened: false,
              ),
            )
          else if (!delivered.contains(j.id))
            PendingGroupMessage(
              clientMessageId: j.id,
              body: j.payload['caption'] as String? ?? '',
              fileName: j.payload['name'] as String? ?? 'file',
              replyToId: j.payload['replyToId'] as String?,
              failed: j.failed,
            ),
      ],
    );
  }

  Future<void> _send(api.SendGroupMessageDto dto) async {
    // ROUND1 25.11 row 16: read before the request — the group may be left
    // while it runs (this provider is auto-disposed), and its result must
    // still land: the message on the phone, a refusal as «Not sent».
    final unsent = ref.read(groupUnsentProvider);
    final store = _store;
    final storeKey = _storeKey;
    final sentOut = ref.read(groupMediaSentProvider);
    final cmid = dto.clientMessageId;
    try {
      final m = await _repo.send(key.groupId, dto);
      if (ref.mounted) {
        _upsert(m);
        return;
      }
      unawaited(store?.put(storeKey, [m]) ?? Future.value());
      unsent.settle(storeKey, cmid);
      // A thread of this group open again meanwhile shows it at once.
      if (!sentOut.isClosed) sentOut.add(m);
    } on Object catch (e) {
      final details = e is ApiException ? e.details : null;
      final slow = details?['kind'] == 'group_slow_mode'
          ? (details?['retryAfterSeconds'] as num?)?.toInt()
          : null;
      if (!ref.mounted) {
        final p = unsent
            .of(storeKey)
            .where((x) => x.clientMessageId == cmid)
            .firstOrNull;
        if (p != null) {
          unsent.settle(storeKey, cmid, failed: p.asFailed(slowWaitS: slow));
        }
        return;
      }
      state = state.copyWith(
        pending: [
          for (final p in state.pending)
            if (p.clientMessageId == cmid) p.asFailed(slowWaitS: slow) else p,
        ],
      );
    }
  }

  /// Retry a failed message (text, or a file — audit 26.10 B9) with the
  /// same client id.
  Future<void> retry(String clientMessageId) async {
    if (_mediaIds.contains(clientMessageId)) {
      return ref.read(groupMediaOutboxProvider).retry(clientMessageId);
    }
    final p = state.pending
        .where((x) => x.clientMessageId == clientMessageId)
        .firstOrNull;
    if (p == null || (p.fileName != null && p.fileId == null)) return;
    state = state.copyWith(
      pending: [
        for (final x in state.pending)
          if (x.clientMessageId == clientMessageId)
            PendingGroupMessage(
              clientMessageId: x.clientMessageId,
              body: x.body,
              replyToId: x.replyToId,
              mentionIds: x.mentionIds,
              fileName: x.fileName,
              fileId: x.fileId,
            )
          else
            x,
      ],
    );
    final fileId = p.fileId;
    if (fileId != null) {
      return _send(
        api.SendGroupMessageDto(
          clientMessageId: clientMessageId,
          type: api.SendGroupMessageDtoType.attachment,
          body: p.body.isEmpty ? null : p.body,
          topicId: key.topicId,
          replyToId: p.replyToId,
          fileId: fileId,
          fileName: p.fileName,
        ),
      );
    }
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

  void dropPending(String clientMessageId) {
    if (_mediaIds.contains(clientMessageId)) {
      unawaited(ref.read(groupMediaOutboxProvider).discard(clientMessageId));
    }
    state = state.copyWith(
      pending: [
        for (final p in state.pending)
          if (p.clientMessageId != clientMessageId) p,
      ],
    );
  }

  Future<void> edit(String messageId, String body) async {
    final m = await _repo.edit(key.groupId, messageId, body);
    if (ref.mounted) _upsert(m);
  }

  /// Groups WhatsApp parity (the 1:1 `ChatThread.react`): my emoji on a
  /// message, null takes it away; the answer replaces the message.
  Future<void> react(String messageId, String? emoji) async {
    final m = await _repo.react(key.groupId, messageId, emoji);
    if (ref.mounted) _upsert(m);
  }

  Future<void> deleteForEveryone(String messageId) async {
    await _repo.deleteMessage(key.groupId, messageId);
    if (!ref.mounted) return;
    // The server also sends the tombstone over realtime; show it at once
    // without dropping the older pages that were already loaded.
    final at = state.messages.indexWhere((x) => x.id == messageId);
    if (at < 0) return;
    final list = [...state.messages];
    list[at] = list[at].asTombstone();
    state = state.copyWith(messages: list);
    unawaited(_store?.put(_storeKey, [list[at]]) ?? Future.value());
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
    final m = state.messages.where((x) => x.id == messageId).firstOrNull;
    if (m != null) {
      unawaited(_store?.put(_storeKey, [m]) ?? Future.value());
    }
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
