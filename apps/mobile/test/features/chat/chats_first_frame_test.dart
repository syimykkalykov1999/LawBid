import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/saved_json.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_list_cache.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// R-404 (a) (owner 2026-11-04, iPhone recording): opening Chats showed the
/// Cases cards for a frame under the list. Cause: the chats list opened in
/// a loading state (its saved page is a disk read, one frame late) and the
/// shared PagedListBody fills that frame with the case-card skeleton. Now
/// the list's memory copy is drawn in the very first frame, opaque.
class _NeverChats implements ChatRepository {
  final _never = Completer<CursorPage<Conversation>>();

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) =>
      _never.future;

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _NoPages implements SavedPageStore {
  @override
  Future<String?> pageJson(String key) async => null;
  @override
  Future<void> savePage(String key, String json) async {}
  @override
  Future<int> pagesBytes() async => 0;
  @override
  Future<void> clearPages() async {}
}

Conversation _conv(String id) => Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: true,
        verified: true,
        id: 'u-$id',
        displayName: 'Person $id',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      lastMessageAt: DateTime(2026),
      lastMessage: ChatMessage(
        id: 'm-$id',
        conversationId: id,
        kind: MessageKind.text,
        body: 'Hello from $id',
        createdAt: DateTime(2026),
        senderId: 'u-$id',
      ),
      isDirect: true,
    );

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets(
      'the Chats screen paints its rows on an opaque background in its '
      'FIRST frame, from the list in memory (no case-card skeleton)',
      (tester) async {
    final cache = ChatListCache(SavedJson(_NoPages(), null))
      ..remember([_conv('a'), _conv('b')]);
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        const InboxScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(_NeverChats()),
            chatListCacheProvider.overrideWithValue(cache),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            currentUserRoleProvider.overrideWithValue(UserRole.attorney),
            channelsEnabledProvider.overrideWithValue(true),
            realtimeClientProvider.overrideWithValue(null),
            messageStoreProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    // ONE frame: pumpWidget built and drew the first frame, nothing else.
    final scaffold = tester.widget<Scaffold>(
      find.descendant(
        of: find.byType(InboxScreen),
        matching: find.byType(Scaffold),
      ),
    );
    final bg = scaffold.backgroundColor;
    expect(bg, isNotNull);
    expect(bg!.a, 1.0, reason: 'the chats screen must be opaque at once');
    expect(find.byType(ConversationRow), findsNWidgets(2));
    expect(find.text('Person a'), findsOneWidget);
    expect(find.byType(CasesListSkeleton), findsNothing);
    // The next frames keep the same rows (no blank, no swap).
    await tester.pump(const Duration(milliseconds: 16));
    expect(find.byType(ConversationRow), findsNWidgets(2));
    expect(find.byType(CasesListSkeleton), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  test('ChatListCache: memory follows save / remember / read', () async {
    final cache = ChatListCache(SavedJson(_NoPages(), null));
    expect(cache.memory, isNull);
    await cache.warm();
    expect(cache.memory, isNull);
    cache.remember([_conv('a')]);
    expect(cache.memory?.items.single.id, 'a');
    // The disk (none here) never replaces a newer memory copy.
    await cache.read();
    expect(cache.memory?.items.single.id, 'a');
  });
}
