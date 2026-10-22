import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/permissions/permission_primer.dart';
import 'package:lawbid/core/permissions/permission_primer_host.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';

/// Owner 2026-10-22 (audit #13): the phone's notification and microphone
/// dialogs come after a short explanation, never cold after sign-in. The
/// iPhone gets the microphone step right after notifications (CallKit,
/// PR #236); Android at the first call.
void main() {
  late SharedPreferences prefs;
  late bool micGranted;
  late DateTime clock;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    micGranted = false;
    clock = DateTime(2026, 10, 22, 12);
    PermissionPrimer.now = () => clock;
  });

  tearDown(() => PermissionPrimer.now = DateTime.now);

  Future<ProviderContainer> pump(
    WidgetTester tester, {
    bool host = true,
    Translator translator = const StaticTranslatorEn(),
    AppThemeId theme = AppThemeId.day,
    double textScale = 1,
  }) async {
    final container = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        translatorProvider.overrideWithValue(translator),
        microphoneGrantedProvider.overrideWithValue(() async => micGranted),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AppTheme.of(theme),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(textScale),
              disableAnimations: true,
            ),
            child: host ? PermissionPrimerHost(child: child!) : child!,
          ),
          home: const Scaffold(body: Text('home')),
        ),
      ),
    );
    return container;
  }

  PermissionPrimer primer(ProviderContainer c) =>
      c.read(permissionPrimerProvider.notifier);

  Finder card() => find.byKey(const ValueKey('permission-primer'));
  Finder continueButton() =>
      find.byKey(const ValueKey('permission-primer-continue'));
  Finder laterButton() => find.byKey(const ValueKey('permission-primer-later'));

  testWidgets(
      'after sign-in: the explanation first, the system dialog only after '
      '«Continue»; iPhone: the microphone step next', (tester) async {
    final c = await pump(tester);
    final asked = <String>[];
    final done = primer(c).onboard(
      notifications: () async => asked.add('notifications'),
      microphone: () async => asked.add('microphone'),
    );
    await tester.idle();
    await tester.pump();
    expect(card(), findsOneWidget);
    expect(find.text('Turn on notifications'), findsOneWidget);
    expect(asked, isEmpty, reason: 'no system dialog before the explanation');

    await tester.tap(continueButton());
    await tester.idle();
    await tester.pump();
    expect(asked, ['notifications']);
    expect(find.text('Allow the microphone'), findsOneWidget);

    await tester.tap(continueButton());
    await tester.idle();
    await tester.pump();
    await done;
    expect(asked, ['notifications', 'microphone']);
    expect(card(), findsNothing);
  });

  testWidgets('the microphone step is skipped when it is already allowed',
      (tester) async {
    micGranted = true;
    final c = await pump(tester);
    final asked = <String>[];
    final done = primer(c).onboard(
      notifications: () async => asked.add('notifications'),
      microphone: () async => asked.add('microphone'),
    );
    await tester.idle();
    await tester.pump();
    await tester.tap(continueButton());
    await tester.idle();
    await tester.pump();
    await done;
    expect(asked, ['notifications']);
    expect(card(), findsNothing);
  });

  testWidgets('Android: no microphone step after sign-in', (tester) async {
    final c = await pump(tester);
    final asked = <String>[];
    final done = primer(c).onboard(
      notifications: () async => asked.add('notifications'),
    );
    await tester.idle();
    await tester.pump();
    await tester.tap(continueButton());
    await tester.idle();
    await tester.pump();
    await done;
    expect(asked, ['notifications']);
    expect(card(), findsNothing);
  });

  testWidgets('«Not now»: nothing is asked, the card returns after 3 days',
      (tester) async {
    final c = await pump(tester);
    final asked = <String>[];
    Future<void> run() => primer(c).onboard(
          notifications: () async => asked.add('notifications'),
        );

    var done = run();
    await tester.idle();
    await tester.pump();
    await tester.tap(laterButton());
    await tester.idle();
    await tester.pump();
    await done;
    expect(asked, isEmpty);

    clock = clock.add(const Duration(days: 1));
    await run();
    await tester.idle();
    await tester.pump();
    expect(card(), findsNothing);

    clock = clock.add(const Duration(days: 3));
    done = run();
    await tester.idle();
    await tester.pump();
    expect(card(), findsOneWidget);
    await tester.tap(continueButton());
    await tester.idle();
    await tester.pump();
    await done;
    expect(asked, ['notifications']);
  });

  testWidgets('once accepted, later sign-ins go straight to the system',
      (tester) async {
    await prefs.setString('permissions.primer.v1', 'yes');
    final c = await pump(tester);
    final asked = <String>[];
    await primer(c).onboard(
      notifications: () async => asked.add('notifications'),
      microphone: () async => asked.add('microphone'),
    );
    await tester.idle();
    await tester.pump();
    expect(card(), findsNothing);
    expect(asked, ['notifications', 'microphone']);
  });

  testWidgets('Android first call: explained once, «Not now» means no call',
      (tester) async {
    final c = await pump(tester);
    var answer = primer(c).explainMicrophone();
    await tester.idle();
    await tester.pump();
    expect(find.text('Allow the microphone'), findsOneWidget);
    await tester.tap(laterButton());
    await tester.idle();
    await tester.pump();
    expect(await answer, isFalse);

    answer = primer(c).explainMicrophone();
    await tester.idle();
    await tester.pump();
    await tester.tap(continueButton());
    await tester.idle();
    await tester.pump();
    expect(await answer, isTrue);

    // The next call goes straight to the system.
    expect(await primer(c).explainMicrophone(), isTrue);
    await tester.idle();
    await tester.pump();
    expect(card(), findsNothing);
  });

  testWidgets('a granted microphone needs no explanation', (tester) async {
    micGranted = true;
    final c = await pump(tester);
    expect(await primer(c).explainMicrophone(), isTrue);
    await tester.idle();
    await tester.pump();
    expect(card(), findsNothing);
  });

  testWidgets('without a host on screen the system is asked as before',
      (tester) async {
    final c = await pump(tester, host: false);
    final asked = <String>[];
    await primer(c).onboard(
      notifications: () async => asked.add('notifications'),
    );
    expect(asked, ['notifications']);
    expect(await primer(c).explainMicrophone(), isTrue);
  });

  testWidgets('Russian text', (tester) async {
    final c = await pump(tester, translator: const StaticTranslatorRu());
    final done = primer(c).onboard(notifications: () async {});
    await tester.idle();
    await tester.pump();
    expect(find.text('Включите уведомления'), findsOneWidget);
    expect(find.text('Продолжить'), findsOneWidget);
    expect(find.text('Не сейчас'), findsOneWidget);
    await tester.tap(laterButton());
    await tester.idle();
    await tester.pump();
    await done;
  });

  for (final id in AppThemeId.values) {
    for (final (name, t) in [
      ('longest', LongestTranslator() as Translator),
      ('ne', ShippedTranslator('ne') as Translator),
      ('ar', ShippedTranslator('ar') as Translator),
    ]) {
      testWidgets('no overflow at 360 dp ($name, ${id.name}, x1.3)',
          (tester) async {
        useNarrowPhone(tester);
        final c = await pump(tester, translator: t, theme: id, textScale: 1.3);
        for (final step in PrimerStep.values) {
          final done = step == PrimerStep.notifications
              ? primer(c).onboard(notifications: () async {})
              : primer(c).explainMicrophone();
          await tester.idle();
          await tester.pump();
          expect(tester.takeException(), isNull);
          expect(card(), findsOneWidget);
          await tester.tap(laterButton());
          await tester.idle();
          await tester.pump();
          await done;
        }
      });
    }
  }
}
