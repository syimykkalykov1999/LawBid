import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/client_badge/application/client_badge_providers.dart';
import 'package:lawbid/features/client_badge/domain/client_badge_models.dart';
import 'package:lawbid/features/client_badge/presentation/client_badge_screen.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 16.11: a client's subscription asks for NO documents — the client
/// pays and gets the gold check (and the plan's features). The admin switch
/// «Проверка документов клиента» (off by default) brings the document step
/// back.
void main() {
  setUpAll(() => initializeDateFormatting('en'));

  Future<void> open(WidgetTester tester, ClientBadgeState state) async {
    useNarrowPhone(tester);
    final extra = <Override>[clientBadgeProvider.overrideWith((ref) => state)];
    await tester.pumpWidget(
      uxApp(
        const ClientBadgeScreen(),
        theme: AppTheme.of(AppThemeId.values.first),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(extra: extra),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  final addPhoto = find.text('Add a photo');
  final sendForReview = find.text('Send for review');
  final pay = find.textContaining('Subscribe for');

  testWidgets('documents off: benefits and the pay button, no document step', (
    tester,
  ) async {
    await open(
      tester,
      const ClientBadgeState(
        status: ClientBadgeStatus.none,
        badgeActive: false,
        priceCents: 1000,
        canSubmit: false,
        canSubscribe: true,
        documentsRequired: false,
      ),
    );
    expect(addPhoto, findsNothing);
    expect(sendForReview, findsNothing);
    expect(find.text('Documents approved'), findsNothing);
    expect(find.text('What the gold check gives you'), findsOneWidget);
    expect(find.textContaining('No documents needed'), findsOneWidget);
    await tester.scrollUntilVisible(pay.last, 200);
    expect(pay, findsWidgets);
  });

  testWidgets('documents on (admin switch): the document step is back', (
    tester,
  ) async {
    await open(
      tester,
      const ClientBadgeState(
        status: ClientBadgeStatus.none,
        badgeActive: false,
        priceCents: 1000,
        canSubmit: true,
        canSubscribe: false,
      ),
    );
    expect(find.textContaining('Send documents'), findsOneWidget);
    await tester.scrollUntilVisible(addPhoto, 200);
    expect(addPhoto, findsOneWidget);
    expect(sendForReview, findsOneWidget);
    expect(pay, findsNothing);
  });

  testWidgets('documents off, revoked by the admin: reason, no form, no pay', (
    tester,
  ) async {
    await open(
      tester,
      const ClientBadgeState(
        status: ClientBadgeStatus.revoked,
        badgeActive: false,
        priceCents: 1000,
        canSubmit: false,
        canSubscribe: false,
        documentsRequired: false,
        revokeReason: 'fake name',
      ),
    );
    expect(find.textContaining('fake name'), findsOneWidget);
    expect(addPhoto, findsNothing);
    expect(sendForReview, findsNothing);
    expect(pay, findsNothing);
  });
}
