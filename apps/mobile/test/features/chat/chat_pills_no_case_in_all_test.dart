import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Conversation _conv(String id, {String? caseId, int unread = 0}) => Conversation(
      id: id,
      caseId: caseId,
      caseTitle: caseId == null ? null : 'Case $caseId',
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u-$id',
        displayName: 'Person $id',
      ),
      unreadCount: unread,
      updatedAt: DateTime(2026),
      isDirect: caseId == null,
    );

/// Owner 2026-11-25: «Все · Группы · Запросы» only; «Все» has no case chats.
void main() {
  group('chatFolderPills', () {
    test('All · Groups · Requests — no Waiting, Unread, Cases', () {
      expect(chatFolderPills(groupsOn: true), [
        ChatListFolder.all,
        ChatListFolder.groups,
        ChatListFolder.requests,
      ]);
    });

    test('groups off: All · Requests', () {
      expect(chatFolderPills(groupsOn: false), [
        ChatListFolder.all,
        ChatListFolder.requests,
      ]);
    });
  });

  group('shownChatFolder', () {
    test('a remembered «Waiting» falls back to «All»', () {
      expect(
        shownChatFolder(ChatListFolder.waiting, groupsOn: true),
        ChatListFolder.all,
      );
      expect(
        shownChatFolder(ChatListFolder.unread, groupsOn: true),
        ChatListFolder.all,
      );
    });

    test('«Groups» while groups are off falls back to «All»', () {
      expect(
        shownChatFolder(ChatListFolder.groups, groupsOn: false),
        ChatListFolder.all,
      );
    });

    test('the shown pills stay as they are', () {
      for (final f in chatFolderPills(groupsOn: true)) {
        expect(shownChatFolder(f, groupsOn: true), f);
      }
    });
  });

  group('withoutCaseChats', () {
    test('drops the case chats, keeps the order and the paging', () {
      final out = withoutCaseChats(
        AsyncData(
          PaginatedList(
            items: [
              _conv('d1'),
              _conv('k1', caseId: 'A'),
              _conv('d2'),
              _conv('k2', caseId: 'B'),
            ],
            nextCursor: 'next',
          ),
        ),
      );
      expect(out.value!.items.map((c) => c.id), ['d1', 'd2']);
      expect(out.value!.nextCursor, 'next');
    });

    test('loading and errors pass through', () {
      expect(
        withoutCaseChats(const AsyncLoading<PaginatedList<Conversation>>()),
        isA<AsyncLoading<PaginatedList<Conversation>>>(),
      );
      final err = withoutCaseChats(
        const AsyncError<PaginatedList<Conversation>>('x', StackTrace.empty),
      );
      expect(err.hasError, isTrue);
    });
  });

  group('chatsTabCount', () {
    test('the case chats unread are not counted on «Чаты»', () {
      expect(chatsTabCount(10, caseUnread: 6, requests: 2), 4 + 2);
    });

    test('never below the requests', () {
      expect(chatsTabCount(3, caseUnread: 9, requests: 1), 1);
    });
  });
}
