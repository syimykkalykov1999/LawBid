import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';
import 'package:lawbid/features/privacy/presentation/moderation_notices_screen.dart';
import 'package:lawbid/features/privacy/presentation/my_reports_screen.dart';
import 'package:lawbid/features/privacy/presentation/privacy_screen.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

class _FakePrivacy implements PrivacyRepository {
  PrivacySettings current = const PrivacySettings(
    lastSeen: Audience.everyone,
    messageFrom: Audience.everyone,
    callFrom: Audience.contacts,
  );
  final changes = <(PrivacyField, Audience)>[];

  @override
  Future<PrivacySettings> settings() async => current;

  @override
  Future<PrivacySettings> change(PrivacyField field, Audience value) async {
    changes.add((field, value));
    return current = switch (field) {
      PrivacyField.lastSeen => current.copyWith(lastSeen: value),
      PrivacyField.messageFrom => current.copyWith(messageFrom: value),
      PrivacyField.callFrom => current.copyWith(callFrom: value),
      PrivacyField.photoFrom => current.copyWith(photoFrom: value),
      PrivacyField.aboutFrom => current.copyWith(aboutFrom: value),
      PrivacyField.groupAddFrom => current.copyWith(groupAddFrom: value),
    };
  }

  @override
  Future<List<ModerationNotice>> notices() async => [
        for (final (i, action) in ['hide', 'remove', 'warn', 'restore'].indexed)
          ModerationNotice(
            actionId: 'a$i',
            action: action,
            targetType: 'post',
            reason: 'Spam spam spam ' * 6,
            excerpt: 'A long excerpt of the post text ' * 5,
            createdAt: DateTime(2026, 10, 20),
            canAppeal: i == 0,
            appealStatus: i == 1 ? 'pending' : (i == 2 ? 'rejected' : null),
            appealNote: i == 2 ? 'Decision stays ' * 8 : null,
          ),
      ];

  @override
  Future<ModerationNotice> appeal(String actionId, String message) async =>
      (await notices()).first;

  @override
  Future<List<MyReport>> myReports() async => [
        for (final s in ['open', 'actioned', 'dismissed'])
          MyReport(
            id: s,
            targetType: 'user',
            reason: 'selfHarm',
            status: s,
            createdAt: DateTime(2026, 10, 19),
          ),
      ];
}

void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest rtl': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
  };

  Future<void> pump(
    WidgetTester tester,
    Widget home,
    _FakePrivacy repo, {
    Translator? t,
    TextDirection dir = TextDirection.ltr,
    double scale = 1,
  }) async {
    useNarrowPhone(tester);
    final overrides = uxOverrides(
      translator: t ?? const StaticTranslatorEn(),
      extra: [privacyRepositoryProvider.overrideWithValue(repo)],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.light(),
          builder: (context, child) => Directionality(
            textDirection: dir,
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
                disableAnimations: true,
              ),
              child: child!,
            ),
          ),
          home: home,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('choosing an audience sends the change', (tester) async {
    final repo = _FakePrivacy();
    await pump(tester, const PrivacyScreen(), repo);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const ValueKey('privacy-last-seen')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('audience-nobody')));
    await tester.pumpAndSettle();
    expect(repo.changes, [(PrivacyField.lastSeen, Audience.nobody)]);
    expect(tester.takeException(), isNull);
  });

  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    for (final scale in [1.0, 1.1]) {
      testWidgets('no overflow at 360 dp ($name, x$scale)', (tester) async {
        final repo = _FakePrivacy();
        for (final screen in <Widget>[
          const PrivacyScreen(),
          const MyReportsScreen(),
          const ModerationNoticesScreen(),
        ]) {
          await pump(tester, screen, repo, t: t, dir: dir, scale: scale);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: '$screen');
          final list = find.byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          );
          for (var i = 0; i < 6 && list.evaluate().isNotEmpty; i++) {
            await tester.drag(
              list.first,
              const Offset(0, -400),
              warnIfMissed: false,
            );
            await tester.pump(const Duration(milliseconds: 300));
            expect(tester.takeException(), isNull, reason: '$screen scroll');
          }
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 30));
        }
      });
    }
  }
}
