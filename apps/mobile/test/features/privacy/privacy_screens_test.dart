import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';
import 'package:lawbid/features/privacy/presentation/moderation_notices_screen.dart';
import 'package:lawbid/features/privacy/presentation/my_reports_screen.dart';
import 'package:lawbid/features/privacy/presentation/privacy_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

class _FakePrivacy implements PrivacyRepository {
  final appeals = <(String, String)>[];

  PrivacySettings current = const PrivacySettings(
    lastSeen: Audience.everyone,
    messageFrom: Audience.everyone,
    callFrom: Audience.contacts,
  );
  final changes = <(PrivacyField, Audience)>[];
  final doNotSell = <bool>[];

  @override
  Future<PrivacySettings> settings() async => current;

  @override
  Future<PrivacySettings> setDoNotSell({required bool value}) async {
    doNotSell.add(value);
    return current = current.copyWith(doNotSell: value);
  }

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
  Future<ModerationNotice> appeal(String actionId, String message) async {
    appeals.add((actionId, message));
    return (await notices()).first;
  }

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
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  Future<void> pump(
    WidgetTester tester,
    Widget home,
    _FakePrivacy repo, {
    Translator? t,
    TextDirection dir = TextDirection.ltr,
    double scale = 1,
    Dio? dio,
  }) async {
    useNarrowPhone(tester);
    // The link-preview switch is a device setting (SharedPreferences).
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final overrides = uxOverrides(
      translator: t ?? const StaticTranslatorEn(),
      extra: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        privacyRepositoryProvider.overrideWithValue(repo),
        if (dio != null) dioProvider.overrideWithValue(dio),
      ],
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

  testWidgets(
      'usage statistics: off until turned on; the answer goes to the server',
      (tester) async {
    AppEvents.setConsent(granted: null);
    final adapter = FakeHttpAdapter(
      (_) async => jsonBody(
        {
          'data': {'saved': true},
        },
        201,
      ),
    );
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = adapter;
    await pump(tester, const PrivacyScreen(), _FakePrivacy(), dio: dio);
    await tester.pumpAndSettle();
    final row = find.byKey(const ValueKey('privacy-analytics'));
    await tester.scrollUntilVisible(row, 200);
    final toggle = find.descendant(of: row, matching: find.byType(Switch));
    expect(tester.widget<Switch>(toggle).value, isFalse);
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(adapter.requests.single.path, endsWith('/users/me/consents'));
    final body = jsonDecode(jsonEncode(adapter.requests.single.data))
        as Map<String, Object?>;
    expect(body['consents'], [
      {'type': 'analytics', 'granted': true},
    ]);
    expect(AppEvents.consent, isTrue);
    expect(tester.widget<Switch>(toggle).value, isTrue);
    AppEvents.setConsent(granted: null);
  });

  testWidgets('CCPA: «do not sell or share» goes to PATCH /users/me/privacy',
      (tester) async {
    final repo = _FakePrivacy();
    await pump(tester, const PrivacyScreen(), repo);
    await tester.pumpAndSettle();
    final row = find.byKey(const ValueKey('privacy-do-not-sell'));
    await tester.scrollUntilVisible(row, 200);
    final toggle = find.descendant(of: row, matching: find.byType(Switch));
    expect(tester.widget<Switch>(toggle).value, isFalse);
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(repo.doNotSell, [true]);
    expect(tester.widget<Switch>(toggle).value, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('link previews: on by default, the switch is kept on the phone',
      (tester) async {
    await pump(tester, const PrivacyScreen(), _FakePrivacy());
    await tester.pumpAndSettle();
    final row = find.byKey(const ValueKey('privacy-link-previews'));
    await tester.scrollUntilVisible(row, 200);
    await tester.ensureVisible(row);
    await tester.pumpAndSettle();
    final toggle = find.descendant(of: row, matching: find.byType(Switch));
    expect(tester.widget<Switch>(toggle).value, isTrue);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(toggle).value, isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('chat.linkPreviews.v1'), 'off');
  });

  testWidgets('an appeal is sent with the written message', (tester) async {
    final repo = _FakePrivacy();
    await pump(tester, const ModerationNoticesScreen(), repo);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('appeal-a0')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('appeal-field')),
      'It is a court exhibit.',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('appeal-send')));
    await tester.pumpAndSettle();
    expect(repo.appeals, [('a0', 'It is a court exhibit.')]);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the appeal sheet fits at 360 dp, large text, German and Arabic',
      (tester) async {
    for (final (t, dir) in [
      (ShippedTranslator('de'), TextDirection.ltr),
      (ShippedTranslator('ar'), TextDirection.rtl),
    ]) {
      final repo = _FakePrivacy();
      await pump(
        tester,
        const ModerationNoticesScreen(),
        repo,
        t: t,
        dir: dir,
        scale: 1.3,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('appeal-a0')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 30));
    }
  });

  test('new privacy captions are really translated, not English', () {
    for (final code in ['ar', 'de', 'ne', 'mr']) {
      final t = ShippedTranslator(code);
      for (final key in [
        'privacy.photoFrom',
        'privacy.aboutFrom',
        'privacy.groupAddFrom',
        'privacy.title',
        'notices.appeal',
      ]) {
        expect(
          t.t(key),
          isNot(equals(const StaticTranslatorEn().t(key))),
          reason: '$code $key',
        );
      }
    }
  });

  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    for (final scale in [1.0, 1.1, 1.3]) {
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
