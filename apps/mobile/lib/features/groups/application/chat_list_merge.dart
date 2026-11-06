import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/text/search_fold.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// One row of the Chats list: a direct chat or a group.
@immutable
sealed class ChatListEntry {
  const ChatListEntry();

  /// Unique within the list (direct chat and group ids never collide).
  String get id;

  bool get pinned;

  /// Last message time, else the last update.
  DateTime get activityAt;
}

final class DirectChatEntry extends ChatListEntry {
  const DirectChatEntry(this.conversation);

  final Conversation conversation;

  @override
  String get id => conversation.id;

  @override
  bool get pinned => conversation.pinned;

  @override
  DateTime get activityAt =>
      conversation.lastMessageAt ?? conversation.updatedAt;
}

final class GroupChatEntry extends ChatListEntry {
  const GroupChatEntry(this.group);

  final api.GroupDto group;

  @override
  String get id => group.id;

  @override
  bool get pinned => group.pinned;

  @override
  DateTime get activityAt => group.lastMessageAt ?? group.updatedAt;
}

/// R-404 (b) (owner 2026-11-04, Telegram: one person = one row): in «All»
/// every conversation with the same person — the direct chat and one chat
/// per case — is ONE row. The row is the direct chat (or, while there is
/// none, a stand-in built from the newest case chat; a tap on it opens or
/// starts the direct chat); its preview is the newest message across all
/// of them, its unread count their sum, its place the newest activity.
/// The case chats themselves stay under the «Cases» chip and in the case.
final class PersonChatEntry extends ChatListEntry {
  PersonChatEntry({
    required this.counterpartId,
    required this.direct,
    required List<Conversation> cases,
  }) : cases = List.unmodifiable(cases);

  final String counterpartId;

  /// The direct chat, or null while the two have only case chats.
  final Conversation? direct;

  /// The case chats with this person, newest activity first.
  final List<Conversation> cases;

  /// The id of the stand-in row for a person without a direct chat yet.
  static String standInId(String counterpartId) => 'person-$counterpartId';

  /// All the conversations behind the row.
  List<Conversation> get conversations => [
        if (direct != null) direct!,
        ...cases,
      ];

  /// The row has no direct chat behind it: a tap starts one.
  bool get standIn => direct == null;

  /// The newest message across all the conversations (and the one whose
  /// time and preview the row shows).
  Conversation get newest {
    Conversation? best;
    for (final c in conversations) {
      if (best == null || _activity(c).isAfter(_activity(best))) best = c;
    }
    return best!;
  }

  int get unread {
    var n = 0;
    for (final c in conversations) {
      n += c.unreadCount;
    }
    return n;
  }

  /// The conversation the row is drawn from: the direct chat (else the
  /// newest case chat without its case) carrying the merged preview and
  /// unread count.
  Conversation get row {
    final base = direct;
    final top = newest;
    if (base == null) {
      final n = top;
      return Conversation(
        id: standInId(counterpartId),
        caseId: null,
        caseTitle: null,
        status: ConversationStatus.active,
        contactsUnlocked: n.contactsUnlocked,
        counterpart: n.counterpart,
        unreadCount: unread,
        updatedAt: n.updatedAt,
        lastMessage: n.lastMessage,
        lastMessageAt: n.lastMessageAt,
        mutedUntil: n.mutedUntil,
        callsMuted: n.callsMuted,
        isDirect: true,
        pinnedAt: pinned ? n.pinnedAt ?? n.updatedAt : null,
        blocked: n.blocked,
      );
    }
    if (identical(top, base) && unread == base.unreadCount) return base;
    return base.withActivity(
      lastMessage: top.lastMessage,
      lastMessageAt: top.lastMessageAt,
      unreadCount: unread,
      updatedAt: top.updatedAt,
    );
  }

  @override
  String get id => direct?.id ?? standInId(counterpartId);

  @override
  bool get pinned => conversations.any((c) => c.pinned);

  @override
  DateTime get activityAt => _activity(newest);

  static DateTime _activity(Conversation c) => c.lastMessageAt ?? c.updatedAt;
}

/// R-404 (b): [chats] with one row per person (see [PersonChatEntry]) —
/// a person with two or more conversations becomes one row. A chat whose
/// other side has no user id (a client hidden until the case is accepted)
/// cannot be grouped and stays its own row; so does a chat whose request
/// is still pending.
List<ChatListEntry> groupChatsByPerson(List<Conversation> chats) {
  final direct = <String, Conversation>{};
  final cases = <String, List<Conversation>>{};
  final order = <String>[];
  final single = <ChatListEntry>[];
  for (final c in chats) {
    final uid = c.counterpart.id;
    if (uid == null || c.request == MessageRequest.pending) {
      single.add(DirectChatEntry(c));
      continue;
    }
    if (!direct.containsKey(uid) && !cases.containsKey(uid)) order.add(uid);
    if (c.caseId == null) {
      // Two direct chats with one person (never today): the newer one wins.
      final had = direct[uid];
      if (had == null ||
          PersonChatEntry._activity(c)
              .isAfter(PersonChatEntry._activity(had))) {
        direct[uid] = c;
      } else {
        single.add(DirectChatEntry(c));
      }
    } else {
      (cases[uid] ??= []).add(c);
    }
  }
  return [
    ...single,
    for (final uid in order)
      // One conversation with a person is simply its own row (nothing to
      // merge: its case label, note and keys stay as they are).
      if (direct[uid] != null && cases[uid] == null)
        DirectChatEntry(direct[uid]!)
      else if (direct[uid] == null && cases[uid]!.length == 1)
        DirectChatEntry(cases[uid]!.single)
      else
        PersonChatEntry(
          counterpartId: uid,
          direct: direct[uid],
          cases: [...?cases[uid]]..sort(
              (a, b) => PersonChatEntry._activity(b)
                  .compareTo(PersonChatEntry._activity(a)),
            ),
        ),
  ];
}

/// Whether the group's notifications are muted right now.
bool isGroupMuted(api.GroupDto g, {DateTime? now}) =>
    g.mutedUntil != null && g.mutedUntil!.isAfter(now ?? DateTime.now());

/// The Telegram / WhatsApp order: pinned first, then the newest activity;
/// equal times keep a stable order by id.
int compareChatEntries(ChatListEntry a, ChatListEntry b) {
  if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
  final byTime = b.activityAt.compareTo(a.activityAt);
  return byTime != 0 ? byTime : a.id.compareTo(b.id);
}

/// [chats] and [groups] as ONE sorted list. With [query] only the groups
/// whose title contains it (any case) stay; direct chats are passed as they
/// are (the server already filtered them). [onePerPerson]: R-404 (b), the
/// «All» view groups the chats by person.
List<ChatListEntry> mergeChatList(
  List<Conversation> chats,
  List<api.GroupDto> groups, {
  String query = '',
  bool onePerPerson = false,
}) {
  final q = query.trim().toLowerCase();
  return [
    if (onePerPerson)
      ...groupChatsByPerson(chats)
    else
      for (final c in chats) DirectChatEntry(c),
    for (final g in groups)
      if (textMatches(q, [g.title])) GroupChatEntry(g),
  ]..sort(compareChatEntries);
}

/// The two paged lists as one paged state: loading while either one has
/// nothing yet, an error only when the direct chats failed (a failing
/// groups list leaves the chats usable), more pages while either has more.
AsyncValue<PaginatedList<ChatListEntry>> combineChatLists(
  AsyncValue<PaginatedList<Conversation>> chats,
  AsyncValue<PaginatedList<api.GroupDto>> groups, {
  String query = '',
  bool withGroups = true,
  bool onePerPerson = false,
}) {
  final c = chats.value;
  if (c == null) {
    return chats.hasError
        ? AsyncError(chats.error!, chats.stackTrace ?? StackTrace.empty)
        : const AsyncLoading();
  }
  final g = withGroups ? groups.value : null;
  if (withGroups && g == null && !groups.hasError) {
    return const AsyncLoading();
  }
  final more = c.hasMore || (g?.hasMore ?? false);
  return AsyncData(
    PaginatedList(
      items: mergeChatList(
        c.items,
        g?.items ?? const [],
        query: query,
        onePerPerson: onePerPerson,
      ),
      nextCursor: more ? 'more' : null,
      isLoadingMore: c.isLoadingMore || (g?.isLoadingMore ?? false),
      loadMoreError: c.loadMoreError ?? g?.loadMoreError,
    ),
  );
}

/// R-404 (a): the «All» list's state for the chats screen — while the
/// live list has nothing yet (its saved page is still being read from the
/// disk), the copy already in memory, so the first frame has rows.
AsyncValue<PaginatedList<Conversation>> chatsOrMemory(
  AsyncValue<PaginatedList<Conversation>> live,
  CursorPage<Conversation>? memory,
) {
  if (live.hasValue || live.hasError || memory == null) return live;
  return AsyncData(PaginatedList.firstPage(memory));
}

/// The «All» view of Chats: direct chats + my groups.
final mergedChatListProvider =
    Provider.autoDispose<AsyncValue<PaginatedList<ChatListEntry>>>(
  (ref) => combineChatLists(
    chatsOrMemory(
      ref.watch(conversationsProvider),
      ref.watch(chatListCacheProvider).memory,
    ),
    ref.watch(groupsProvider),
    // Owner 2026-10-21: groups live in «Channels», not in the chat list.
    withGroups: false,
    onePerPerson: true,
  ),
);

/// R-404 (b): the case chats with one person, from the chats list already
/// in memory (the live «All» list, else its memory copy) — no request. The
/// direct chat's «Cases with this person (N)» row reads it.
final caseChatsWithProvider =
    Provider.autoDispose.family<List<Conversation>, String>((ref, userId) {
  final live = ref.watch(conversationsProvider).value?.items;
  final rows = live ?? ref.watch(chatListCacheProvider).memory?.items;
  if (rows == null) return const [];
  return [
    for (final c in rows)
      if (c.caseId != null && c.counterpart.id == userId) c,
  ]..sort(
      (a, b) =>
          PersonChatEntry._activity(b).compareTo(PersonChatEntry._activity(a)),
    );
});

/// The Chats search: server-filtered chats + the loaded groups by title.
final mergedChatSearchProvider = Provider.autoDispose
    .family<AsyncValue<PaginatedList<ChatListEntry>>, ChatSearchKey>(
  (ref, key) => combineChatLists(
    ref.watch(searchConversationsProvider(key)),
    ref.watch(groupsProvider),
    query: key.q,
    withGroups: false,
  ),
);

/// How many of my loaded groups have something unread (the badge on the
/// «Channels» door of Chats).
final unreadGroupsProvider = Provider.autoDispose<int>(
  (ref) => [
    for (final g
        in ref.watch(groupsProvider).value?.items ?? const <api.GroupDto>[])
      if (g.unreadCount > 0 && !isGroupMuted(g)) g,
  ].length,
);

/// Pull-to-refresh of the merged list: both lists.
Future<void> refreshChatList(
  WidgetRef ref, {
  ChatSearchKey? search,
}) async {
  ref.invalidate(chatFolderCountsProvider);
  final chats = search == null
      ? ref.read(conversationsProvider.notifier).refresh()
      : ref.read(searchConversationsProvider(search).notifier).refresh();
  final groups = search != null && search.folder != ChatListFolder.all
      ? Future<void>.value()
      : ref.read(groupsProvider.notifier).refresh().catchError((Object _) {});
  await Future.wait([chats, groups]);
}

/// Loads the next page of whichever list has one.
void loadMoreChatList(WidgetRef ref, {ChatSearchKey? search}) {
  if (search == null) {
    ref.read(conversationsProvider.notifier).loadMore();
  } else {
    ref.read(searchConversationsProvider(search).notifier).loadMore();
  }
  if (search == null || search.folder == ChatListFolder.all) {
    ref.read(groupsProvider.notifier).loadMore();
  }
}

/// Retries a failed next page of either list.
void retryChatListMore(WidgetRef ref, {ChatSearchKey? search}) {
  if (search == null) {
    ref.read(conversationsProvider.notifier).retryLoadMore();
  } else {
    ref.read(searchConversationsProvider(search).notifier).retryLoadMore();
  }
  if (search == null || search.folder == ChatListFolder.all) {
    ref.read(groupsProvider.notifier).retryLoadMore();
  }
}

/// My own pin / mute / hide of one group, then the list re-reads.
///
/// The generated client cannot send `mutedUntil: null` (null fields are
/// dropped), so «unmute» sends a moment in the past, which the server
/// stores and every reader treats as «not muted» ([isGroupMuted]).
Future<void> updateMyGroup(
  WidgetRef ref,
  String id, {
  bool? pinned,
  bool? muted,
  Duration? mutedFor,
  bool? hidden,
  bool? archived,
}) async {
  final now = DateTime.now();
  final updated = await ref.read(groupRepositoryProvider).updateMine(
        id,
        api.UpdateGroupMeDto(
          pinned: pinned,
          hidden: hidden,
          archived: archived,
          mutedUntil: mutedFor != null
              ? now.add(mutedFor)
              : muted == null
                  ? null
                  : muted
                      ? now.add(const Duration(days: 3650))
                      : now.subtract(const Duration(seconds: 1)),
        ),
      );
  // The write is done: updating the lists is best-effort, never an error.
  try {
    if (!ref.context.mounted) return;
    // Package B: the answer is the row — applied here, nothing re-read
    // (the Archive is another list without an event of its own).
    final notifier = ref.read(groupsProvider.notifier);
    if ((hidden ?? false) || archived != null) {
      notifier.removeWhere((g) => g.id == id);
    } else {
      notifier.applyMine(updated);
    }
    ref
      ..invalidate(archivedGroupsProvider)
      ..invalidate(chatFolderCountsProvider);
  } on Object {
    // The screen is gone; the next open re-reads the lists.
  }
}
