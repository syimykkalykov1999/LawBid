import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
/// are (the server already filtered them).
List<ChatListEntry> mergeChatList(
  List<Conversation> chats,
  List<api.GroupDto> groups, {
  String query = '',
}) {
  final q = query.trim().toLowerCase();
  return [
    for (final c in chats) DirectChatEntry(c),
    for (final g in groups)
      if (q.isEmpty || g.title.toLowerCase().contains(q)) GroupChatEntry(g),
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
      items: mergeChatList(c.items, g?.items ?? const [], query: query),
      nextCursor: more ? 'more' : null,
      isLoadingMore: c.isLoadingMore || (g?.isLoadingMore ?? false),
      loadMoreError: c.loadMoreError ?? g?.loadMoreError,
    ),
  );
}

/// The «All» view of Chats: direct chats + my groups.
final mergedChatListProvider =
    Provider.autoDispose<AsyncValue<PaginatedList<ChatListEntry>>>(
  (ref) => combineChatLists(
    ref.watch(conversationsProvider),
    ref.watch(groupsProvider),
  ),
);

/// The Chats search: server-filtered chats + the loaded groups by title.
final mergedChatSearchProvider = Provider.autoDispose
    .family<AsyncValue<PaginatedList<ChatListEntry>>, ChatSearchKey>(
  (ref, key) => combineChatLists(
    ref.watch(searchConversationsProvider(key)),
    ref.watch(groupsProvider),
    query: key.q,
    withGroups: key.folder == ChatListFolder.all,
  ),
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
  bool? hidden,
  bool? archived,
}) async {
  final now = DateTime.now();
  await ref.read(groupRepositoryProvider).updateMine(
        id,
        api.UpdateGroupMeDto(
          pinned: pinned,
          hidden: hidden,
          archived: archived,
          mutedUntil: muted == null
              ? null
              : muted
                  ? now.add(const Duration(days: 3650))
                  : now.subtract(const Duration(seconds: 1)),
        ),
      );
  if (!ref.context.mounted) return;
  final notifier = ref.read(groupsProvider.notifier);
  if ((hidden ?? false) || archived != null) {
    notifier.removeWhere((g) => g.id == id);
  }
  ref
    ..invalidate(archivedGroupsProvider)
    ..invalidate(chatFolderCountsProvider);
  await notifier.refresh().catchError((Object _) {});
}
