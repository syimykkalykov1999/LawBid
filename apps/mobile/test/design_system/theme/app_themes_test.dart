import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/theme/theme_picker_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/l10n/l10n_test_harness.dart';

/// Owner 2026-10-13: Day, Night, Blue and Green — the registry, what is
/// saved, the tokens' contrast and the picker sheet.
double _contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

Color _over(Color top, Color base) => Color.alphaBlend(top, base);

Future<void> main() async {
  group('registry', () {
    test('four themes, each stored and sent to the server by its own name', () {
      expect(AppThemes.all.map((s) => s.id), AppThemeId.values);
      expect(
        AppThemes.all.map((s) => s.wire).toSet().length,
        AppThemes.all.length,
      );
      expect(AppThemes.of(AppThemeId.day).serverWire, 'light');
      expect(AppThemes.of(AppThemeId.night).serverWire, 'dark');
      expect(AppThemes.of(AppThemeId.blue).serverWire, 'blue');
      expect(AppThemes.of(AppThemeId.green).wire, 'green');
      expect(AppThemes.of(AppThemeId.green).serverWire, 'green');
    });

    test('saved values of older versions still read', () {
      expect(AppThemes.fromWire('light'), AppThemeId.day);
      expect(AppThemes.fromWire('dark'), AppThemeId.night);
      expect(AppThemes.fromWire('system'), isNull);
      expect(AppThemes.fromWire(null), isNull);
      // The removed Glass theme reads as Night; the old Navy is Blue.
      expect(AppThemes.fromWire('glass'), AppThemeId.night);
      expect(AppThemes.fromWire('navy'), AppThemeId.blue);
      expect(AppThemes.fromServer('glass'), AppThemeId.night);
      expect(AppThemes.fromServer('navy'), AppThemeId.blue);
      expect(AppThemes.fromServer('light'), AppThemeId.day);
      expect(AppThemes.fromServer('blue'), AppThemeId.blue);
      expect(AppThemes.fromServer('green'), AppThemeId.green);
      expect(AppThemes.fromServer('system'), isNull);
    });

    test('never chosen: Day or Night by the phone', () {
      expect(AppThemes.autoFor(Brightness.light), AppThemeId.day);
      expect(AppThemes.autoFor(Brightness.dark), AppThemeId.night);
    });
  });

  group('tokens', () {
    test('every theme builds and carries its tokens', () {
      for (final id in AppThemeId.values) {
        final theme = AppTheme.of(id);
        expect(theme.extension<AppColorTokens>(), isNotNull);
        expect(theme.brightness, AppThemes.of(id).brightness);
      }
    });

    test('text reads on the page and on a card (WCAG AA 4.5:1)', () {
      for (final id in AppThemeId.values) {
        final c = AppThemes.of(id).tokens();
        final page = c.bg;
        final card = _over(c.surface, page);
        expect(_contrast(c.text, page), greaterThan(4.5), reason: '$id page');
        expect(_contrast(c.text, card), greaterThan(4.5), reason: '$id card');
        expect(
          _contrast(c.textSecondary, card),
          greaterThan(3),
          reason: '$id second text',
        );
      }
    });

    test('Blue and Green: the green status chip text reads on its tint', () {
      for (final id in [AppThemeId.blue, AppThemeId.green]) {
        final c = AppThemes.of(id).tokens();
        final chip = _over(c.successTint, c.bg);
        expect(_contrast(c.successText, chip), greaterThan(4.5), reason: '$id');
      }
    });

    test('the primary button reads (label on its fill)', () {
      for (final id in AppThemeId.values) {
        final c = AppThemes.of(id).tokens();
        expect(
          _contrast(c.onCtaBright, c.ctaBright),
          greaterThan(4.5),
          reason: '$id',
        );
        expect(
          _contrast(c.onAccent, c.accent),
          greaterThan(4.5),
          reason: '$id',
        );
      }
    });
  });

  group('saved theme', () {
    test('an older saved "dark" is Night; a choice is saved and restored',
        () async {
      SharedPreferences.setMockInitialValues({
        'design_system.theme_mode': 'dark',
      });
      final prefs = await SharedPreferences.getInstance();
      ProviderContainer make() {
        final c = ProviderContainer(
          overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
        );
        addTearDown(c.dispose);
        return c;
      }

      var c = make();
      expect(c.read(appThemeControllerProvider), AppThemeId.night);
      await c
          .read(appThemeControllerProvider.notifier)
          .select(AppThemeId.green);
      expect(prefs.getString('design_system.theme_mode'), 'green');
      // A cold start: the first read already has it (no flash).
      c = make();
      expect(c.read(appThemeControllerProvider), AppThemeId.green);
    });
  });

  group('removed Glass theme', () {
    test('a saved "glass" opens as Night and is saved again as "night"',
        () async {
      SharedPreferences.setMockInitialValues({
        'design_system.theme_mode': 'glass',
      });
      final prefs = await SharedPreferences.getInstance();
      final c = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
      addTearDown(c.dispose);
      expect(c.read(appThemeControllerProvider), AppThemeId.night);
      await Future<void>.delayed(Duration.zero);
      expect(prefs.getString('design_system.theme_mode'), 'night');
    });
  });

  group('picker sheet', () {
    testWidgets('lists the themes, marks the chosen, picks and closes',
        (tester) async {
      final h = await L10nHarness.create();
      final c = h.container(
        extra: [
          translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        ],
      );
      await c
          .read(appThemeControllerProvider.notifier)
          .select(AppThemeId.night);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            theme: AppTheme.of(AppThemeId.night),
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => ThemePickerSheet.show(context),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      for (final name in ['Day', 'Night', 'Blue', 'Green']) {
        expect(find.text(name), findsOneWidget);
      }
      expect(find.text('Theme'), findsOneWidget);
      await tester.tap(find.text('Blue'));
      await tester.pumpAndSettle();
      expect(c.read(appThemeControllerProvider), AppThemeId.blue);
      expect(find.text('Blue'), findsNothing, reason: 'the sheet closed');
    });
  });
}
