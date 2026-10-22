import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/seat_purchase_sheet.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_roles_screen.dart';

import '../../helpers/ux_harness.dart';
import '../subscription/subscription_fakes.dart';
import 'team_fakes.dart';

/// Owner 2026-10-22: «Роли помощников» — open to every attorney; with an
/// assistant the switches give duties (at most 3 each), without a seat a
/// switch opens the purchase sheet: price now + per month, pay, 3-D Secure.
void main() {
  late FakeTeamRepository team;
  late FakeSubscriptionRepository subs;
  late FakePaymentConfirmer confirmer;
  setUpAll(initializeDateFormatting);

  setUp(() {
    team = FakeTeamRepository();
    subs = FakeSubscriptionRepository(
      makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.active,
          assistantSeats: 1,
        ),
        trialEligible: false,
      ),
    );
    confirmer = FakePaymentConfirmer();
  });

  Future<void> pump(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        child,
        size: const Size(900, 2400),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            teamRepositoryProvider.overrideWithValue(team),
            seatLimitRepositoryProvider
                .overrideWithValue(FakeSeatLimitRepository()),
            subscriptionRepositoryProvider.overrideWithValue(subs),
            paymentConfirmerProvider.overrideWithValue(confirmer),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  TeamInfo teamWith({required List<TeamMember> members, int seats = 1}) =>
      TeamInfo(
        members: members,
        seats: seats,
        used: members.length,
        plan: 'monthly',
      );

  TeamMember member(Set<AssistantDuty> duties) => TeamMember(
        id: 'm1',
        name: 'Sam',
        status: MemberStatus.active,
        approval: 'attorney_added',
        duties: duties,
        createdAt: DateTime.utc(2026, 10, 2),
      );

  group('AssistantRolesScreen', () {
    testWidgets('every duty in three groups with one line each, the limit',
        (tester) async {
      team.teamInfo = teamWith(members: [], seats: 0);
      await pump(tester, const AssistantRolesScreen());
      expect(find.text('Assistant roles'), findsOneWidget);
      expect(find.textContaining('at most 3 roles'), findsOneWidget);
      expect(find.text('Calls, chats and files'), findsOneWidget);
      expect(find.text('Cases and preparation'), findsOneWidget);
      expect(find.text('In your name'), findsOneWidget);
      for (final d in AssistantDuty.values) {
        expect(find.byKey(ValueKey('role-duty-${d.wire}')), findsOneWidget);
      }
      expect(find.byKey(const ValueKey('roles-empty-note')), findsOneWidget);
    });

    testWidgets('with an assistant: a switch gives the duty', (tester) async {
      team.teamInfo = teamWith(
        members: [
          member({AssistantDuty.chats}),
        ],
      );
      await pump(tester, const AssistantRolesScreen());
      expect(find.byKey(const ValueKey('roles-member-m1')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('role-duty-tasks')));
      await tester.pumpAndSettle();
      // Responsibility is accepted first (OQ-049).
      await tester.tap(find.byKey(const ValueKey('liability-check')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('liability-accept')));
      await tester.pumpAndSettle();
      final update = team.calls.lastWhere((c) => c.startsWith('update:m1'));
      expect(update, contains('chats'));
      expect(update, contains('tasks'));
      final tile = tester.widget<SwitchListTile>(
        find.byKey(const ValueKey('role-duty-tasks')),
      );
      expect(tile.value, isTrue);
    });

    testWidgets('a fourth duty is refused with a clear message',
        (tester) async {
      team.teamInfo = teamWith(
        members: [
          member({
            AssistantDuty.calls,
            AssistantDuty.chats,
            AssistantDuty.tasks,
          }),
        ],
      );
      await pump(tester, const AssistantRolesScreen());
      await tester.tap(find.byKey(const ValueKey('role-duty-files')));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'One assistant holds at most 3 roles. Add another assistant.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('liability-check')), findsNothing);
      expect(team.calls.where((c) => c.startsWith('update:')), isEmpty);
    });

    testWidgets('no assistant, no free seat: a switch opens the purchase',
        (tester) async {
      team.teamInfo = teamWith(members: [], seats: 0);
      await pump(tester, const AssistantRolesScreen());
      await tester.tap(find.byKey(const ValueKey('role-duty-calls')));
      await tester.pumpAndSettle();
      expect(find.byType(SeatPurchaseSheet), findsOneWidget);
      expect(subs.calls, contains('preview:2'));
      expect(find.text(r'Due now: $50 (until Oct 6, 2026)'), findsOneWidget);
      expect(find.text(r'Then +$100 a month'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('seats-buy-pay')));
      await tester.pumpAndSettle();
      expect(subs.calls, contains('seats:2'));
      expect(find.text('Seats added'), findsOneWidget);
      expect(find.byType(SeatPurchaseSheet), findsNothing);
    });
  });

  group('SeatPurchaseSheet', () {
    Future<void> open(WidgetTester tester) async {
      team.teamInfo = teamWith(members: [], seats: 0);
      await pump(tester, const AssistantRolesScreen());
      await tester.tap(find.byKey(const ValueKey('roles-add')));
      await tester.pumpAndSettle();
    }

    testWidgets('the stepper re-prices', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('seats-buy-plus')));
      await tester.pumpAndSettle();
      expect(subs.calls, contains('preview:3'));
      expect(find.text(r'Due now: $100 (until Oct 6, 2026)'), findsOneWidget);
      expect(find.text(r'Pay $100'), findsOneWidget);
    });

    testWidgets('3-D Secure: the bank check opens with the secret',
        (tester) async {
      subs.seatStatus = SeatChangeStatus.requiresAction;
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('seats-buy-pay')));
      await tester.pump();
      await tester.pump();
      expect(confirmer.secrets, ['pi_secret']);
      expect(
        find.text('Payment confirmed — the seats appear in a minute'),
        findsOneWidget,
      );
      // The webhook adds the seats: the screen re-reads twice.
      await tester.pump(const Duration(seconds: 9));
      await tester.pumpAndSettle();
    });

    testWidgets('declined card: a clear message, nothing changes',
        (tester) async {
      subs.seatStatus = SeatChangeStatus.failed;
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('seats-buy-pay')));
      await tester.pumpAndSettle();
      expect(
        find.text('The card was declined. Nothing was charged.'),
        findsOneWidget,
      );
      expect(find.byType(SeatPurchaseSheet), findsOneWidget);
    });

    testWidgets('during a trial: «after the first payment», no sheet',
        (tester) async {
      subs.current = makeOverview(subscription: makeInfo());
      await open(tester);
      expect(
        find.text(
          'Seats can be bought after the first payment of your subscription.',
        ),
        findsOneWidget,
      );
      expect(find.byType(SeatPurchaseSheet), findsNothing);
      expect(subs.calls.where((c) => c.startsWith('preview')), isEmpty);
    });
  });
}
