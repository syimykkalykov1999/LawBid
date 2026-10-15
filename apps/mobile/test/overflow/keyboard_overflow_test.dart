import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-15: with the keyboard open (320 dp of it) nothing may
/// overflow — screens with an input, longest strings of every language,
/// 360 dp, font 1.0 / 1.3, left-to-right and right-to-left.
Future<void> main() async {
  await initializeDateFormatting();
  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [sharedPreferencesProvider.overrideWithValue(prefs)];
  });

  final screens = <String, Widget Function()>{
    'search': () => const SearchScreen(),
  };

  for (final MapEntry(key: name, value: build) in screens.entries) {
    for (final scale in [1.0, 1.3]) {
      for (final dir in TextDirection.values) {
        testWidgets('$name with the keyboard, x$scale $dir', (tester) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            uxApp(
              Builder(
                builder: (context) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    viewInsets: const EdgeInsets.only(bottom: 320),
                  ),
                  child: Directionality(textDirection: dir, child: build()),
                ),
              ),
              theme: AppTheme.of(AppThemeId.night),
              size: narrowPhone,
              textScale: scale,
              disableAnimations: true,
              overrides: uxOverrides(
                translator: LongestTranslator(),
                extra: base,
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
