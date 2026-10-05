import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/trust/application/trust_providers.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';
import 'package:lawbid/features/trust/presentation/trust_level_sheet.dart';
import 'package:lawbid/features/trust/presentation/trust_payment_notice.dart';

const _fixture = PublicTrust(
  attorneyId: 'a1',
  level: 1,
  badge: false,
  cleared: false,
  signals: TrustSignals(
    selfAttested: true,
    licenseConfirmed: true,
    licenseConfirmedBy: LicenseConfirmedBy.registry,
    documentsVerified: false,
    stripeKyc: false,
    stripeIdentity: false,
    identityConfirmed: false,
    nameCheck: NameCheck.unknown,
    firmLinkConfirmed: false,
  ),
  acceptsPayments: false,
  canBid: true,
  registryLinks: [
    RegistryLink(stateCode: 'CA', stateName: 'California', url: 'https://x'),
  ],
);

Widget _app(
  Widget child, {
  Translator translator = const StaticTranslatorEn(),
  PublicTrust? trust,
}) =>
    ProviderScope(
      overrides: [
        translatorProvider.overrideWithValue(translator),
        if (trust != null)
          attorneyTrustProvider.overrideWith((ref, id) async => trust),
      ],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: Center(child: child)),
      ),
    );

void main() {
  group('TrustLevelChip labels', () {
    const en = {
      0: 'Self-declared',
      1: 'Registry',
      2: 'Identity',
      3: 'Documents',
    };
    const ru = {0: 'Заявлен', 1: 'Реестр', 2: 'Личность', 3: 'Документы'};
    for (final level in [0, 1, 2, 3]) {
      testWidgets('level $level reads "${en[level]}" / "${ru[level]}"',
          (tester) async {
        await tester.pumpWidget(_app(TrustLevelChip(level: level)));
        expect(find.text(en[level]!), findsOneWidget);

        await tester.pumpWidget(
          _app(
            TrustLevelChip(level: level),
            translator: const StaticTranslatorRu(),
          ),
        );
        expect(find.text(ru[level]!), findsOneWidget);
      });
    }

    testWidgets('out-of-range levels clamp to 0..3', (tester) async {
      await tester.pumpWidget(_app(const TrustLevelChip(level: 9)));
      expect(find.text('Documents'), findsOneWidget);
      await tester.pumpWidget(_app(const TrustLevelChip(level: -2)));
      expect(find.text('Self-declared'), findsOneWidget);
    });

    testWidgets('level 0 is neutral (no tint), level 3 is gold',
        (tester) async {
      await tester.pumpWidget(_app(const TrustLevelChip(level: 0)));
      final colors = AppTheme.light().extension<AppColorTokens>()!;
      Container pill() => tester.widget<Container>(
            find.ancestor(
              of: find.byType(Text),
              matching: find.byType(Container),
            ),
          );
      var deco = pill().decoration! as BoxDecoration;
      expect(deco.color, colors.surface);
      expect(deco.border!.top.color, colors.border);

      await tester.pumpWidget(_app(const TrustLevelChip(level: 3)));
      deco = pill().decoration! as BoxDecoration;
      expect(deco.color, colors.goldTint);
    });

    testWidgets('without an attorney id the chip is not a button',
        (tester) async {
      await tester.pumpWidget(_app(const TrustLevelChip(level: 1)));
      expect(find.byType(GestureDetector), findsNothing);
      final semantics = tester.getSemantics(find.byType(TrustLevelChip));
      expect(semantics.label, 'Trust level: Registry');
    });
  });

  testWidgets('tapping the chip opens the sheet with the signals',
      (tester) async {
    await tester.pumpWidget(
      _app(
        const TrustLevelChip(level: 1, attorneyId: 'a1'),
        trust: _fixture,
      ),
    );
    await tester.tap(find.byType(TrustLevelChip));
    await tester.pumpAndSettle();

    expect(find.byType(TrustLevelSheet), findsOneWidget);
    expect(find.text('Trust level'), findsOneWidget);
    expect(find.text('Level 1 of 3'), findsOneWidget);
    expect(find.text('Bar number matched the state registry'), findsOneWidget);
    expect(find.text('Identity not confirmed yet'), findsOneWidget);
    // The client's pre-payment notice and the registry link are inside.
    expect(find.byType(TrustPaymentNotice), findsOneWidget);
    expect(find.textContaining('does not accept payments'), findsOneWidget);
    expect(find.byKey(const ValueKey('trust-registry-CA')), findsOneWidget);
  });

  testWidgets('TrustPaymentNotice says how identity was confirmed',
      (tester) async {
    const ok = PublicTrust(
      attorneyId: 'a2',
      level: 2,
      badge: true,
      cleared: true,
      signals: TrustSignals(
        selfAttested: true,
        licenseConfirmed: true,
        licenseConfirmedBy: LicenseConfirmedBy.registry,
        documentsVerified: false,
        stripeKyc: true,
        stripeIdentity: true,
        identityConfirmed: true,
        nameCheck: NameCheck.match,
        firmLinkConfirmed: false,
      ),
      acceptsPayments: true,
      canBid: true,
      registryLinks: [],
    );
    await tester.pumpWidget(
      _app(const TrustPaymentNotice(attorneyId: 'a2'), trust: ok),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Stripe verification'), findsOneWidget);
    expect(find.text('Identity'), findsOneWidget);
  });
}
