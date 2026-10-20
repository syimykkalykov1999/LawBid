import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

final _base = DateTime.utc(2026, 10, 20, 12);

Conversation chat(
  String id, {
  int minutes = 0,
  bool pinned = false,
  bool lastMessage = true,
}) =>
    Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        id: 'u',
        displayName: 'Ann',
        isAttorney: true,
        verified: false,
      ),
      unreadCount: 0,
      updatedAt: _base.add(Duration(minutes: minutes)),
      lastMessageAt: lastMessage ? _base.add(Duration(minutes: minutes)) : null,
      pinnedAt: pinned ? _base : null,
    );

api.GroupDto grp(
  String id, {
  int minutes = 0,
  bool pinned = false,
  String title = 'Group',
  bool lastMessage = true,
}) =>
    api.GroupDto(
      id: id,
      title: title,
      memberCount: 3,
      type: api.GroupType.private,
      joinApproval: false,
      topicsEnabled: false,
      pendingRequests: 0,
      whoCanPost: api.GroupWho.all,
      whoCanAdd: api.GroupWho.all,
      whoCanEditInfo: api.GroupWho.admins,
      whoCanCall: api.GroupWho.all,
      canPost: true,
      canAdd: true,
      canEditInfo: false,
      canCall: true,
      isAdmin: false,
      inviteEnabled: true,
      unreadCount: 0,
      unreadMentions: 0,
      pinned: pinned,
      createdAt: _base,
      updatedAt: _base.add(Duration(minutes: minutes)),
      lastMessageAt: lastMessage ? _base.add(Duration(minutes: minutes)) : null,
    );

List<String> ids(List<ChatListEntry> l) => [for (final e in l) e.id];

void main() {
  test('pinned first, then the newest activity, chats and groups mixed', () {
    final merged = mergeChatList(
      [chat('c-old', minutes: 1), chat('c-new', minutes: 30)],
      [
        grp('g-mid', minutes: 10),
        grp('g-pin-old', minutes: 2, pinned: true),
      ],
    );
    expect(ids(merged), ['g-pin-old', 'c-new', 'g-mid', 'c-old']);
  });

  test('pinned chats and groups sort among themselves by activity', () {
    final merged = mergeChatList(
      [chat('c-pin', minutes: 5, pinned: true)],
      [grp('g-pin', minutes: 9, pinned: true), grp('g', minutes: 99)],
    );
    expect(ids(merged), ['g-pin', 'c-pin', 'g']);
  });

  test('no last message falls back to updatedAt; ties are stable by id', () {
    final merged = mergeChatList(
      [chat('b', minutes: 4, lastMessage: false)],
      [grp('a', minutes: 4, lastMessage: false)],
    );
    expect(ids(merged), ['a', 'b']);
  });

  test('query keeps the groups whose title matches, any case', () {
    final merged = mergeChatList(
      [chat('c')],
      [
        grp('g1', title: 'Tax Law Club'),
        grp('g2', title: 'Football'),
      ],
      query: 'LAW',
    );
    expect(ids(merged).toSet(), {'c', 'g1'});
  });

  test('isGroupMuted only for a future mutedUntil', () {
    final g = grp('g');
    expect(isGroupMuted(g), isFalse);
    final now = DateTime.utc(2026, 10, 20);
    expect(
      isGroupMuted(
        _withMute(g, now.add(const Duration(days: 1))),
        now: now,
      ),
      isTrue,
    );
    expect(
      isGroupMuted(
        _withMute(g, now.subtract(const Duration(seconds: 1))),
        now: now,
      ),
      isFalse,
    );
  });

  group('combineChatLists', () {
    PaginatedList<Conversation> chats({String? next}) =>
        PaginatedList(items: [chat('c')], nextCursor: next);
    PaginatedList<api.GroupDto> groups({String? next}) =>
        PaginatedList(items: [grp('g', minutes: 5)], nextCursor: next);

    test('loading until both are loaded', () {
      expect(
        combineChatLists(AsyncData(chats()), const AsyncLoading()),
        isA<AsyncLoading<PaginatedList<ChatListEntry>>>(),
      );
    });

    test('merged, with more pages while either list has one', () {
      final v = combineChatLists(
        AsyncData(chats()),
        AsyncData(groups(next: 'x')),
      ).requireValue;
      expect(ids(v.items), ['g', 'c']);
      expect(v.hasMore, isTrue);
      expect(
        combineChatLists(AsyncData(chats()), AsyncData(groups()))
            .requireValue
            .hasMore,
        isFalse,
      );
    });

    test('a failing groups list leaves the chats; failing chats is an error',
        () {
      final ok = combineChatLists(
        AsyncData(chats()),
        AsyncError(Exception('x'), StackTrace.empty),
      );
      expect(ids(ok.requireValue.items), ['c']);
      final bad = combineChatLists(
        AsyncError(Exception('x'), StackTrace.empty),
        AsyncData(groups()),
      );
      expect(bad.hasError, isTrue);
    });

    test('withGroups: false ignores the groups (other folders)', () {
      final v = combineChatLists(
        AsyncData(chats()),
        const AsyncLoading(),
        withGroups: false,
      );
      expect(ids(v.requireValue.items), ['c']);
    });
  });
}

api.GroupDto _withMute(api.GroupDto g, DateTime until) => api.GroupDto(
      id: g.id,
      title: g.title,
      memberCount: g.memberCount,
      type: g.type,
      joinApproval: g.joinApproval,
      topicsEnabled: g.topicsEnabled,
      pendingRequests: g.pendingRequests,
      whoCanPost: g.whoCanPost,
      whoCanAdd: g.whoCanAdd,
      whoCanEditInfo: g.whoCanEditInfo,
      whoCanCall: g.whoCanCall,
      canPost: g.canPost,
      canAdd: g.canAdd,
      canEditInfo: g.canEditInfo,
      canCall: g.canCall,
      isAdmin: g.isAdmin,
      inviteEnabled: g.inviteEnabled,
      unreadCount: g.unreadCount,
      unreadMentions: g.unreadMentions,
      pinned: g.pinned,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      mutedUntil: until,
    );
