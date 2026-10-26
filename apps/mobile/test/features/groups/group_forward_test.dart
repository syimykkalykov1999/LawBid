import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_selection_bar.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Owner 2026-10-21 (Telegram «Переслать» + «Запретить копирование»):
/// a group message can be forwarded and selected; a protected group hides
/// Copy / Forward and offers its link instead.
class _Chats implements ChatRepository {
  final batches = <List<ForwardSource>>[];

  @override
  Future<List<ForwardResult>> forwardBatch(
    String requestId,
    List<ForwardSource> sources,
    List<ForwardTarget> targets,
  ) async {
    batches.add(sources);
    return const [];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

const _en = StaticTranslatorEn();

void main() {
  setUpAll(initializeDateFormatting);

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Future<void> pump(
    WidgetTester tester,
    FakeGroupRepository repo,
    _Chats chats,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            partnerOffOverride,
            groupRepositoryProvider.overrideWithValue(repo),
            chatRepositoryProvider.overrideWithValue(chats),
            currentUserIdProvider.overrideWithValue('me'),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const GroupConversationScreen(groupId: 'g1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  }

  List<api.GroupMessageDto> thread() => [
        message('m3', body: 'Third note', minutes: 3),
        message(
          'm2',
          body: 'Second note',
          minutes: 2,
          forwardedFrom: 'Anna Kowalski',
        ),
      ];

  testWidgets('menu: Forward and Select; select mode copies and forwards',
      (tester) async {
    final chats = _Chats();
    final repo =
        FakeGroupRepository(const [], groupDetail(withPinned: false), thread());
    await pump(tester, repo, chats);
    // «Forwarded from» in the bubble.
    expect(
      find.text(_en.t('chat.forwardedFrom', {'name': 'Anna Kowalski'})),
      findsOneWidget,
    );

    await tester.longPress(find.text('Third note'));
    await tester.pumpAndSettle();
    expect(find.text(_en.t('chat.act.forward')), findsOneWidget);
    expect(find.text(_en.t('group.conv.copy')), findsOneWidget);
    expect(find.text(_en.t('chat.forward.shareLink')), findsNothing);
    await tester.tap(find.text(_en.t('chat.act.select')));
    await tester.pumpAndSettle();

    expect(find.byType(GroupSelectionBar), findsOneWidget);
    await tester.tap(find.text('Second note'));
    await tester.pump();
    expect(
      find.text(_en.t('chat.select.count', {'count': '2'})),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('group-select-copy')), findsOneWidget);
    expect(find.byKey(const ValueKey('group-select-forward')), findsOneWidget);
    expect(find.byKey(const ValueKey('group-select-share')), findsNothing);

    // Forward opens the sheet of chats.
    await tester.tap(find.byKey(const ValueKey('group-select-forward')));
    await tester.pumpAndSettle();
    expect(find.text(_en.t('chat.forward.title')), findsOneWidget);
    await settle(tester);
  });

  testWidgets('protected group: no Copy / Forward, «Share link» instead',
      (tester) async {
    final chats = _Chats();
    final repo = FakeGroupRepository(
      const [],
      groupDetail(withPinned: false, protectContent: true),
      thread(),
    );
    await pump(tester, repo, chats);
    await tester.longPress(find.text('Third note'));
    await tester.pumpAndSettle();
    expect(find.text(_en.t('chat.act.forward')), findsNothing);
    expect(find.text(_en.t('group.conv.copy')), findsNothing);
    expect(find.text(_en.t('chat.forward.shareLink')), findsOneWidget);
    await tester.tap(find.text(_en.t('chat.act.select')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('group-select-copy')), findsNothing);
    expect(find.byKey(const ValueKey('group-select-forward')), findsNothing);
    expect(find.byKey(const ValueKey('group-select-share')), findsOneWidget);
    await settle(tester);
  });

  test('what can be forwarded; the link to share; the service line', () {
    expect(message('a', body: 'x').canForward, isTrue);
    expect(
      message('b', body: 'x', expiresAt: DateTime.utc(2030)).canForward,
      isFalse,
    );
    expect(
      message('c', body: '', type: api.GroupMessageDtoType.system).canForward,
      isFalse,
    );
    expect(groupDetail().hasShareLink, isTrue);
    expect(groupDetail(protectContent: true).isProtected, isTrue);
    expect(groupDetail().isProtected, isFalse);
    final on = message(
      's',
      body: '',
      type: api.GroupMessageDtoType.system,
      systemKind: 'protect_content',
      systemPeople: [people[0]],
      systemText: '1',
    );
    expect(
      groupSystemText(_en, on),
      _en.t('group.system.protectOn', {'name': people[0].displayName!}),
    );
  });
}
