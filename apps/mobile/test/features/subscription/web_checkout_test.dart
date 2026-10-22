import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/seat_purchase_sheet.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_roles_screen.dart';

import '../../helpers/ux_harness.dart';
import '../team/team_fakes.dart';
import 'subscription_fakes.dart';

/// Owner 2026-10-22 (audit #3, App Review 3.1.1): the iPhone app shows no
/// payment screen — a purchase opens our card page in the browser with a
/// one-time link, and the app re-reads it when it is back.
void main() {
  late FakeTeamRepository team;
  late FakeSubscriptionRepository subs;
  late FakePaymentConfirmer confirmer;
  late List<Uri> opened;
  setUpAll(initializeDateFormatting);

  setUp(() {
    team = FakeTeamRepository()
      ..teamInfo = const TeamInfo(
        members: [],
        seats: 0,
        used: 0,
        plan: 'monthly',
      );
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
    opened = [];
  });

  Future<void> openSheet(WidgetTester tester, {required bool iphone}) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        const AssistantRolesScreen(),
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
            paymentsInBrowserProvider.overrideWithValue(iphone),
            checkoutLauncherProvider.overrideWithValue((url) async {
              opened.add(url);
              return true;
            }),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('roles-add')));
    await tester.pumpAndSettle();
  }

  testWidgets('iPhone: seats are bought on the card page in the browser',
      (tester) async {
    await openSheet(tester, iphone: true);
    expect(find.byKey(const ValueKey('seats-buy-web-hint')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('seats-buy-pay')));
    await tester.pumpAndSettle();
    expect(subs.calls, contains('seatsCheckout:2'));
    // Nothing is charged inside the app.
    expect(subs.calls.where((c) => c.startsWith('seats:')), isEmpty);
    expect(confirmer.secrets, isEmpty);
    expect(find.byKey(const ValueKey('seats-buy-error')), findsNothing);
    expect(opened, hasLength(1));
    expect(opened.single.path, '/pay.html');
    expect(opened.single.fragment, contains('native=1'));
    expect(find.byType(SeatPurchaseSheet), findsNothing);
    expect(
      find.textContaining('The payment opened in your browser.'),
      findsOneWidget,
    );
  });

  testWidgets('Android: the in-app purchase stays, no browser', (tester) async {
    await openSheet(tester, iphone: false);
    expect(find.byKey(const ValueKey('seats-buy-web-hint')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('seats-buy-pay')));
    await tester.pumpAndSettle();
    expect(subs.calls, contains('seats:2'));
    expect(opened, isEmpty);
  });

  group('withPayPageLook', () {
    test('adds theme, language and the app marker to our card page only', () {
      final url = withPayPageLook(
        Uri.parse('https://lawbid.dev/pay.html#t=abc&api=x'),
        theme: 'night',
        lang: 'ru',
      );
      expect(url.fragment, 't=abc&api=x&theme=night&lang=ru&native=1');
      final other = Uri.parse('https://checkout.stripe.com/c/pay/cs_1');
      expect(withPayPageLook(other, theme: 'day'), other);
    });
  });

  test('the card page brings the phone app back to the purchase', () {
    expect(
      parseDeepLink(
        Uri.parse('lawbid:/subscription/success'),
        host: 'lawbid.dev',
      ),
      const TabDeepLink('/profile/settings/subscription'),
    );
  });
}
