import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_invite_card.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_invited_tile.dart';

import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

class _Chats implements ChatRepository {
  @override
  Future<int> requestsCount() async => 0;

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Owner 2026-10-21: a group invitation is answered from its card in
/// Requests; nothing is joined until «Accept».
void main() {
  Future<FakeGroupRepository> pumpCard(WidgetTester tester) async {
    final repo = FakeGroupRepository(
      const [],
      null,
      const [],
      const [],
      const [],
      const [],
      null,
      const [],
      [groupInvite()],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            groupRepositoryProvider.overrideWithValue(repo),
            chatRepositoryProvider.overrideWithValue(_Chats()),
            realtimeClientProvider.overrideWithValue(null),
          ],
        ),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: GroupInviteCard(invite: groupInvite())),
        ),
      ),
    );
    await tester.pump();
    return repo;
  }

  testWidgets('«Decline» on the card declines and joins nothing',
      (tester) async {
    final repo = await pumpCard(tester);
    await tester.tap(find.byKey(const ValueKey('group-invite-decline-i1')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(repo.updates, ['decline:i1']);
  });

  testWidgets('«Accept» on the card accepts that invitation', (tester) async {
    final repo = await pumpCard(tester);
    await tester.tap(find.byKey(const ValueKey('group-invite-accept-i1')));
    await tester.pump();
    expect(repo.updates, ['accept:i1']);
  });

  testWidgets('an invited person is marked as invited', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: GroupInvitedTile(person: people[5])),
        ),
      ),
    );
    await tester.pump();
    expect(find.textContaining('Maximilian'), findsOneWidget);
    expect(find.byType(GroupInvitedTile), findsOneWidget);
  });
}
