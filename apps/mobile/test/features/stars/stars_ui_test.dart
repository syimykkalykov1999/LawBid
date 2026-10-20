import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/data/stars_repository.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/stars/presentation/gift_widgets.dart';
import 'package:lawbid/features/stars/presentation/stars_screen.dart';

/// Owner 2026-10-20 — stars: the balance screen prints no money price in
/// the apps, the gift picker and the gift sheet.
class _FakeStars extends StarsRepository {
  _FakeStars({this.balance = 120}) : super(Dio());

  final int balance;

  @override
  Future<StarsOverview> overview() async => StarsOverview(
        enabled: true,
        balance: balance,
        giftConvertPercent: 70,
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
            kind: StarLedgerKind.giftSent,
            createdAt: DateTime(2026, 10, 19, 9),
          ),
        ],
        next: null,
      );

  @override
  Future<List<Gift>> gifts() async => const [
        Gift(id: 'g1', title: 'Gavel', priceStars: 30),
        Gift(id: 'g2', title: 'Scales', priceStars: 200),
      ];
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
    expect(find.text('50 ⭐'), findsWidgets);
    expect(find.text('150 ⭐'), findsOneWidget);
    // The native apps never print a price (the payment page is on the web).
    expect(find.textContaining(r'$'), findsNothing);
    expect(find.text('Top up'), findsNWidgets(2));
    expect(find.text('Top-up'), findsOneWidget);
    expect(find.text('Gift sent'), findsOneWidget);
    expect(find.text('+50 ⭐'), findsOneWidget);
    expect(find.text('-30 ⭐'), findsOneWidget);
  });

  testWidgets('the gift picker shows every gift with its price',
      (tester) async {
    Gift? picked;
    await tester.pumpWidget(
      _app(Scaffold(body: GiftPicker(onGift: (g) => picked = g))),
    );
    await tester.pumpAndSettle();
    expect(find.text('30 ⭐'), findsOneWidget);
    expect(find.text('200 ⭐'), findsOneWidget);
    expect(find.text('Balance: 120 ⭐'), findsOneWidget);
    await tester.tap(find.text('30 ⭐'));
    expect(picked?.id, 'g1');
  });

  testWidgets('enough stars: «Give for N», the draft carries one key',
      (tester) async {
    GiftDraft? sent;
    await tester.pumpWidget(
      _app(
        Consumer(
          builder: (context, ref, _) => TextButton(
            onPressed: () => showGiftSheet(
              context,
              gift: const Gift(id: 'g1', title: 'Gavel', priceStars: 30),
              onSend: (d) async => sent = d,
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Give for 30 ⭐'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Congrats');
    await tester.tap(find.byKey(const ValueKey('gift-send')));
    await tester.pumpAndSettle();
    expect(sent?.note, 'Congrats');
    expect(sent?.clientMessageId, isNotEmpty);
  });

  testWidgets('too few stars: the sheet leads to the top-up', (tester) async {
    await tester.pumpWidget(
      _app(
        Consumer(
          builder: (context, ref, _) => TextButton(
            onPressed: () => showGiftSheet(
              context,
              gift: const Gift(id: 'g2', title: 'Scales', priceStars: 200),
              onSend: (_) async {},
            ),
            child: const Text('open'),
          ),
        ),
        balance: 20,
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('gift-send')), findsNothing);
    expect(find.byKey(const ValueKey('gift-topup')), findsOneWidget);
    expect(find.text('Not enough stars: 200 ⭐ needed'), findsOneWidget);
  });
}
