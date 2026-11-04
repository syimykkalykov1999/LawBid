import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/team_screen.dart';

import '../../helpers/ux_harness.dart';
import 'team_fakes.dart';

/// R-401 (owner 2026-11-04 13:15): the per-assistant duty cap is the
/// admin's `assistants.max_duties` (3 by default) read from GET /team; the
/// picker says «можно ещё N» and stops at the cap. «все» (0) = no counter,
/// every ready role and every duty fit one assistant.
void main() {
  late FakeTeamRepository repo;
  setUpAll(initializeDateFormatting);
  setUp(() => repo = FakeTeamRepository());

  Future<void> openMember(
    WidgetTester tester, {
    required int maxDuties,
    required bool unlimited,
  }) async {
    repo.teamInfo = TeamInfo(
      members: const [],
      seats: 2,
      used: 0,
      plan: 'monthly',
      maxDuties: maxDuties,
      maxDutiesUnlimited: unlimited,
    );
    await repo.addAssistant(name: 'Sam');
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: TeamScreen()),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            teamRepositoryProvider.overrideWithValue(repo),
            seatLimitRepositoryProvider
                .overrideWithValue(FakeSeatLimitRepository()),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.text('Sam').first);
    await tester.pumpAndSettle();
  }

  testWidgets('cap 3, two duties held: «1 more», no full role', (tester) async {
    await openMember(tester, maxDuties: 3, unlimited: false);
    await tester.dragUntilVisible(
      find.byKey(const ValueKey('duties-left')),
      find.byType(ListView).last,
      const Offset(0, -200),
    );
    expect(find.byKey(const ValueKey('duties-left')), findsOneWidget);
    expect(find.text('You can add 1 more'), findsOneWidget);
    expect(find.byKey(const ValueKey('role-full')), findsNothing);
  });

  testWidgets('«все»: no counter, every ready role offered', (tester) async {
    await openMember(
      tester,
      maxDuties: AssistantDuty.values.length,
      unlimited: true,
    );
    await tester.dragUntilVisible(
      find.byKey(const ValueKey('role-full')),
      find.byType(ListView).last,
      const Offset(0, -200),
    );
    expect(find.byKey(const ValueKey('role-full')), findsOneWidget);
    expect(find.byKey(const ValueKey('duties-left')), findsNothing);
  });
}
