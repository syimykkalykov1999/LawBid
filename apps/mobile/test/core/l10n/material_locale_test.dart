import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/material_locale.dart';

/// Owner 2026-10-20: the system date / time dialogs spoke English in every
/// language (no Flutter delegates). Every shipped language now loads, with a
/// nearest-language fallback where Flutter has no texts.
const _shipped = 'en ru es fr de it pt nl pl uk tr el cs sk hu ro bg hr sr sl '
    'da sv nb fi ca zh ja ko vi th id ms tl hi bn ur ta te mr gu kn ml pa ar '
    'he fa ky kk uz ht hy am so ne km sq az ka tg tk mn be lt lv et mk bs sw '
    'af zu yo ig ha ps ku my lo si eu gl is ga cy mt zh-tw';

void main() {
  test('every shipped language loads Material texts', () async {
    final codes = _shipped.split(' ');
    expect(codes.length, 85);
    for (final c in codes) {
      final l = await appLocalizationsDelegates.first
          .load(flutterLocaleForCode(c)) as MaterialLocalizations;
      expect(l.okButtonLabel, isNotEmpty, reason: c);
      expect(l.cancelButtonLabel, isNotEmpty, reason: c);
    }
  });

  test('a language Flutter lacks falls back to the nearest one', () {
    expect(flutterSupports(const Locale('tg')), isFalse);
    expect(fallbackLocaleFor(const Locale('tg')), const Locale('ru'));
    expect(fallbackLocaleFor(const Locale('yo')), const Locale('en'));
  });

  test('Traditional Chinese maps to zh-Hant-TW', () {
    final l = flutterLocaleForCode('zh-tw');
    expect(l.languageCode, 'zh');
    expect(l.countryCode, 'TW');
  });

  for (final code in ['ru', 'ar', 'ne']) {
    testWidgets('the date picker speaks $code', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: flutterLocaleForCode(code),
          localizationsDelegates: appLocalizationsDelegates,
          localeResolutionCallback: keepRequestedLocale,
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => showDatePicker(
                context: context,
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
                initialDate: DateTime(2026, 10, 20),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Cancel'), findsNothing);
      expect(find.text('Select date'), findsNothing);
      expect(find.text('OK'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
