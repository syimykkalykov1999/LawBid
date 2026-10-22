import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chats_icon_button.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';
import '../team/team_fakes.dart';

/// Owner 2026-10-22 («дальше слайд переходит в Чаты и обратно выходит»):
/// Chats is the feed's page after the last tab — a swipe on slides it in, a
/// swipe back (or its back arrow) slides the feed back, the header's chats
/// icon slides there; a chat row's own edge swipe stays the row's.
Conversation _conv() => Conversation(
      id: 'c1',
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u1',
        displayName: 'Anna Petrova',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      lastMessageAt: DateTime.now().subtract(const Duration(hours: 2)),
    );

class _Chats implements ChatRepository {
  final calls = <String>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: [_conv()]);

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  Future<Conversation> organize(
    String id, {
    ChatFolder? folder,
    bool resetFolder = false,
    bool? waiting,
    String? note,
    bool? pinned,
    bool? hidden,
    bool? archived,
  }) async {
    calls.add('organize pinned=$pinned');
    return _conv();
  }

  @override
  Future<Conversation> mute(String id, DateTime? until) async {
    calls.add('mute');
    return _conv();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<_Chats> pump(WidgetTester tester, UserRole role) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final repo = _Chats();
    await tester.pumpWidget(
      uxApp(
        const FeedScreen(),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            // The topic slider reads practice names; no network in tests.
            practiceTreeProvider.overrideWith((ref) async => const []),
            chatRepositoryProvider.overrideWithValue(repo),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            teamRepositoryProvider.overrideWithValue(FakeTeamRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            currentUserRoleProvider.overrideWithValue(role),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  Future<void> swipe(WidgetTester tester, double dx) async {
    await tester.flingFrom(const Offset(195, 520), Offset(dx, 0), 1500);
    await tester.pumpAndSettle();
  }

  Future<void> done(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  }

  final chats = find.byType(InboxScreen);

  testWidgets('client: a swipe on from Reels slides Chats in, back slides out',
      (tester) async {
    await pump(tester, UserRole.client);
    expect(chats, findsNothing);
    await swipe(tester, -300); // Posts → Reels
    expect(chats, findsNothing);
    await swipe(tester, -300); // Reels → Chats
    expect(chats, findsOneWidget);
    expect(tester.getTopLeft(chats).dx, 0);
    await swipe(tester, 300); // Chats → Reels
    expect(chats, findsNothing);
    await done(tester);
  });

  testWidgets(
      'attorney: Cases → Chats, a swipe inside goes Chats → Team, '
      'and back past Chats leaves to the feed', (tester) async {
    await pump(tester, UserRole.attorney);
    await swipe(tester, -300); // Posts → Reels
    await swipe(tester, -300); // Reels → Cases
    expect(chats, findsNothing);
    await swipe(tester, -300); // Cases → Chats
    expect(chats, findsOneWidget);
    expect(find.byType(InboxTabsBar), findsOneWidget);
    // Inside the Chats screen its own pages move first: Chats → Team.
    await swipe(tester, -300);
    expect(chats, findsOneWidget);
    expect(tester.getTopLeft(chats).dx, 0);
    expect(find.text('Anna Petrova'), findsNothing);
    await swipe(tester, 300); // Team → Chats
    expect(find.text('Anna Petrova'), findsOneWidget);
    // Past the first inner page the swipe belongs to the feed.
    await swipe(tester, 300); // Chats → Cases
    expect(chats, findsNothing);
    await done(tester);
  });

  testWidgets('the chats icon slides to Chats; the back arrow slides back',
      (tester) async {
    await pump(tester, UserRole.client);
    await tester.tap(find.byType(ChatsIconButton).first);
    await tester.pumpAndSettle();
    expect(chats, findsOneWidget);
    expect(tester.getTopLeft(chats).dx, 0);
    // A page of the feed, not a pushed screen.
    expect(find.byType(FeedScreen, skipOffstage: false), findsOneWidget);
    await tester.tap(find.byType(AppBackButton));
    await tester.pumpAndSettle();
    expect(chats, findsNothing);
    // Back where it was opened from: Posts.
    expect(find.byType(ChatsIconButton), findsOneWidget);
    await done(tester);
  });

  testWidgets("a chat row's edge swipe stays the row's, the page stays",
      (tester) async {
    final repo = await pump(tester, UserRole.client);
    await tester.tap(find.byType(ChatsIconButton).first);
    await tester.pumpAndSettle();
    final row = tester.getRect(find.byKey(const ValueKey('chat-swipe-c1')));
    // From the row's leading edge towards the feed: the row pins.
    await tester.dragFrom(
      Offset(row.left + 8, row.center.dy),
      const Offset(200, 0),
    );
    await tester.pumpAndSettle();
    expect(repo.calls, contains('organize pinned=true'));
    expect(chats, findsOneWidget);
    expect(tester.getTopLeft(chats).dx, 0);
    // From the trailing edge: the row mutes, still on Chats.
    await tester.dragFrom(
      Offset(row.right - 8, row.center.dy),
      const Offset(-200, 0),
    );
    await tester.pumpAndSettle();
    expect(repo.calls, contains('mute'));
    expect(tester.getTopLeft(chats).dx, 0);
    await done(tester);
  });

  testWidgets('assistant: Chats is the page after Reels too', (tester) async {
    await pump(tester, UserRole.assistant);
    await swipe(tester, -300);
    await swipe(tester, -300);
    expect(chats, findsOneWidget);
    await done(tester);
  });
}
