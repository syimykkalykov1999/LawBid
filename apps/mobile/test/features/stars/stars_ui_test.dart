import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/data/stars_repository.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/stars/presentation/stars_screen.dart';
import 'package:material_ui/material_ui.dart';

/// Owner 2026-10-20 — stars: the balance screen prints no money price in
/// the apps.
class _FakeStars extends StarsRepository {
  _FakeStars({this.balance = 120}) : super(Dio());

  final int balance;

  @override
  Future<StarsOverview> overview() async => StarsOverview(
        enabled: true,
        balance: balance,
        packs: const [
          StarPack(id: 'p1', stars: 50, priceCents: 99),
          StarPack(id: 'p2', stars: 150, priceCents: 279),
        ],
      );

  @override
  Future<({List<StarLedgerItem> items, String? next})> history({
    String? cursor,
  }) async =>
      (
        items: [
          StarLedgerItem(
            id: 'l1',
            delta: 50,
            balanceAfter: 120,
            kind: StarLedgerKind.topup,
            createdAt: DateTime(2026, 10, 20, 9),
          ),
          StarLedgerItem(
            id: 'l2',
            delta: -30,
            balanceAfter: 70,
            kind: StarLedgerKind.stickerPack,
            createdAt: DateTime(2026, 10, 19, 9),
          ),
        ],
        next: null,
      );
}

Widget _app(Widget home, {int balance = 120}) => ProviderScope(
      overrides: [
        translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        starsRepositoryProvider.overrideWithValue(_FakeStars(balance: balance)),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: home),
    );

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('balance, packs without a money price, history', (tester) async {
    await tester.pumpWidget(_app(const StarsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('120 ⭐'), findsOneWidget);
    // The native apps never print a price (the payment page is on the web).
    expect(find.textContaining(r'$'), findsNothing);
    // Store rules: no top-up button and no link in the apps, only a note.
    expect(find.text('Top up balance'), findsNothing);
    expect(find.byKey(const ValueKey('stars-topup-note')), findsOneWidget);
    expect(find.text('Top-up'), findsOneWidget);
    expect(find.text('Sticker pack'), findsOneWidget);
    expect(find.text('+50 ⭐'), findsOneWidget);
    expect(find.text('-30 ⭐'), findsOneWidget);
  });
}
