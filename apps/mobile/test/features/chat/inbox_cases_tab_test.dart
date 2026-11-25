import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

Conversation _conv(
  String id,
  String name, {
  String? caseTitle,
  int unread = 0,
  String body = 'Добрый день',
}) =>
    Conversation(
      id: id,
      caseId: caseTitle == null ? null : 'case-$id',
      caseTitle: caseTitle,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u-$id',
        displayName: name,
      ),
      unreadCount: unread,
      updatedAt: DateTime(2026),
      // A fixed day: the row shows a date, never today's clock.
      lastMessageAt: DateTime(2026, 1, 15, 10, 30),
      lastMessage: ChatMessage(
        id: 'm-$id',
        conversationId: id,
        kind: MessageKind.text,
        body: body,
        createdAt: DateTime(2026, 1, 15, 10, 30),
        senderId: 'u-$id',
      ),
    );

class _Chats implements ChatRepository {
  final folders = <ChatListFolder>[];

  static final _case = [
    _conv('a', 'Анна Петрова', caseTitle: 'Опека', unread: 2),
    _conv('b', 'Игорь Смирнов', caseTitle: 'Развод', body: 'Спасибо!'),
  ];
  static final _direct = [
    _conv('c', 'Мария Иванова', unread: 1, body: 'Когда удобно созвониться?'),
  ];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    folders.add(folder);
    if (requests) return const CursorPage(items: []);
    return CursorPage(
      items: folder == ChatListFolder.cases ? _case : [..._case, ..._direct],
    );
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 1, requests: 0, cases: 1, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

Future<_Chats> _pump(
  WidgetTester tester, {
  required UserRole role,
  InboxTab initialTab = InboxTab.chats,
  Size size = const Size(412, 915),
}) async {
  final repo = _Chats();
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    uxApp(
      InboxScreen(initialTab: initialTab),
      theme: AppTheme.light(),
      size: size,
      disableAnimations: true,
      overrides: uxOverrides(
        translator: const StaticTranslatorRu(),
        extra: [
          chatRepositoryProvider.overrideWithValue(repo),
          groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
          currentUserIdProvider.overrideWithValue('me'),
          currentUserRoleProvider.overrideWithValue(role),
          actsAsAttorneyProvider.overrideWithValue(role == UserRole.attorney),
          realtimeClientProvider.overrideWithValue(null),
        ],
      ),
    ),
  );
  await tester.pumpAndSettle();
  return repo;
}

Future<void> _dispose(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(minutes: 5));
}

Finder _tab(InboxTab t) => find.byKey(ValueKey('inbox-tab-${t.name}'));
Finder _chip(String f) => find.byKey(ValueKey('chat-folder-$f'));

/// Owner 2026-11-18 (Samsung): top tabs «Чаты | Кейсы | Команда» for an
/// attorney, «Чаты | Кейсы» for a client; the chips under Chats are
/// «Все · Группы · Ожидают ответа · Запросы».
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('attorney: Чаты | Кейсы | Команда, chips without Unread/Cases',
      (tester) async {
    await _pump(tester, role: UserRole.attorney);
    final chats = tester.getCenter(_tab(InboxTab.chats)).dx;
    final cases = tester.getCenter(_tab(InboxTab.cases)).dx;
    final team = tester.getCenter(_tab(InboxTab.team)).dx;
    expect(chats, lessThan(cases));
    expect(cases, lessThan(team));
    expect(
      find.descendant(
        of: find.byType(InboxTabsBar),
        matching: find.text('Кейсы'),
      ),
      findsOneWidget,
    );
    for (final f in ['all', 'groups', 'waiting', 'requests']) {
      expect(_chip(f), findsOneWidget, reason: f);
    }
    expect(_chip('unread'), findsNothing);
    expect(_chip('cases'), findsNothing);
    // The count the «Кейсы» chip had is on the «Кейсы» tab.
    expect(
      find.descendant(of: _tab(InboxTab.cases), matching: find.text('1')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await _dispose(tester);
  });

  testWidgets('client: Чаты | Кейсы, no Команда', (tester) async {
    await _pump(tester, role: UserRole.client);
    expect(_tab(InboxTab.chats), findsOneWidget);
    expect(_tab(InboxTab.cases), findsOneWidget);
    expect(_tab(InboxTab.team), findsNothing);
    expect(
      tester.getCenter(_tab(InboxTab.chats)).dx,
      lessThan(tester.getCenter(_tab(InboxTab.cases)).dx),
    );
    expect(_chip('unread'), findsNothing);
    expect(_chip('cases'), findsNothing);
    expect(tester.takeException(), isNull);
    await _dispose(tester);
  });

  for (final role in [UserRole.attorney, UserRole.client]) {
    testWidgets('${role.name}: the Кейсы tab shows the case chats',
        (tester) async {
      final repo = await _pump(tester, role: role);
      await tester.tap(_tab(InboxTab.cases));
      await tester.pumpAndSettle();
      expect(repo.folders, contains(ChatListFolder.cases));
      final page = find.byKey(const ValueKey('inbox-cases-page'));
      expect(page, findsOneWidget);
      // No chips on the Кейсы tab; the waiting case chat is marked.
      expect(
        find.descendant(of: page, matching: _chip('all')),
        findsNothing,
      );
      expect(
        find.descendant(
          of: page,
          matching: find.byKey(const ValueKey('chat-awaiting-a')),
        ),
        findsOneWidget,
      );
      // «Спасибо!» closes the talk: no «awaiting» mark.
      expect(
        find.descendant(
          of: page,
          matching: find.byKey(const ValueKey('chat-awaiting-b')),
        ),
        findsNothing,
      );
      // The magnifier opens the Кейсы tab's own search.
      await tester.tap(find.byKey(const ValueKey('chat-search-top')));
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: page,
          matching: find.byKey(const ValueKey('chat-search')),
        ),
        findsOneWidget,
      );
      // Back to Чаты: the chips are there again.
      await tester.tapAt(const Offset(10, 600));
      await tester.pumpAndSettle();
      await tester.tap(_tab(InboxTab.chats));
      await tester.pumpAndSettle();
      expect(_chip('all'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _dispose(tester);
    });
  }

  testWidgets('a link to /inbox?tab=cases opens the Кейсы tab', (tester) async {
    expect(ChatRoutes.inboxTab(InboxTab.cases), '/inbox?tab=cases');
    await _pump(tester, role: UserRole.attorney, initialTab: InboxTab.cases);
    expect(find.byKey(const ValueKey('inbox-cases-page')), findsOneWidget);
    expect(
      tester.widget<InboxTabsBar>(find.byType(InboxTabsBar)).value,
      InboxTab.cases,
    );
    expect(tester.takeException(), isNull);
    await _dispose(tester);
  });

  // Owner 2026-11-18: goldens of this screen only, an attorney and a client,
  // on a 412 dp phone (the owner's Samsung).
  for (final role in [UserRole.attorney, UserRole.client]) {
    for (final tab in [InboxTab.chats, InboxTab.cases]) {
      testWidgets('golden: ${role.name}, ${tab.name}', (tester) async {
        await _pump(tester, role: role, initialTab: tab);
        await expectLater(
          find.byType(InboxScreen),
          matchesGoldenFile('goldens/inbox_tabs_${role.name}_${tab.name}.png'),
        );
        await _dispose(tester);
      });
    }
  }
}
