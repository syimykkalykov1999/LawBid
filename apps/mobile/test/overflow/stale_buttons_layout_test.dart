import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_stale_banner.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-21: in «Вы давно не заходили в этот кейс — он ещё
/// актуален?» «Да, ещё нужен» and «Уже не нужен» share the top row, and
/// «Жду предложений получше» sits alone on the full-width row below, in one
/// line. 360 dp, x1 and x1.1, five languages, four themes.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'ru': (const StaticTranslatorRu(), TextDirection.ltr),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'de': (ShippedTranslator('de'), TextDirection.ltr),
    'mr': (ShippedTranslator('mr'), TextDirection.ltr),
  };

  for (final theme in AppThemeId.values) {
    for (final scale in [1.0, 1.1]) {
      for (final MapEntry(key: code, value: (t, dir)) in locales.entries) {
        testWidgets('stale buttons, $code ${theme.name} x$scale', (
          tester,
        ) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            uxApp(
              Directionality(
                textDirection: dir,
                child: const Scaffold(
                  body: SingleChildScrollView(
                    child: CaseStaleBanner(
                      caseId: 'c1',
                      paused: false,
                      pending: true,
                    ),
                  ),
                ),
              ),
              theme: AppTheme.of(theme),
              size: narrowPhone,
              textScale: scale,
              disableAnimations: true,
              overrides: uxOverrides(
                translator: t,
                extra: [
                  l10nFormatsProvider.overrideWithValue(
                    L10nFormats(AppLanguage.fromCode(code)),
                  ),
                ],
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);

          Rect rect(String key) => tester.getRect(find.byKey(ValueKey(key)));
          final yes = rect('stale-yes');
          final no = rect('stale-no');
          final wait = rect('stale-wait');

          // Top row: «yes» and «not needed» side by side, same size.
          expect(yes.top, no.top);
          expect(yes.bottom, no.bottom);
          expect(yes.width, closeTo(no.width, 0.5));
          // «yes» comes first in reading order.
          if (dir == TextDirection.ltr) {
            expect(yes.left, lessThan(no.left));
          } else {
            expect(yes.left, greaterThan(no.left));
          }
          // Bottom row: «wait» under both, spanning the whole width.
          expect(wait.top, greaterThanOrEqualTo(yes.bottom));
          expect(
            wait.left,
            closeTo(yes.left < no.left ? yes.left : no.left, 0.5),
          );
          expect(
            wait.right,
            closeTo(yes.right > no.right ? yes.right : no.right, 0.5),
          );
          expect(wait.width, greaterThan(yes.width * 1.5));
          expect(wait.right, lessThanOrEqualTo(360));
          expect(wait.left, greaterThanOrEqualTo(0));

          // «wait» is one line.
          final text = find.descendant(
            of: find.byKey(const ValueKey('stale-wait')),
            matching: find.byType(RichText),
          );
          final paragraph = tester.renderObject<RenderParagraph>(text.first);
          final boxes = paragraph.getBoxesForSelection(
            TextSelection(
              baseOffset: 0,
              extentOffset: paragraph.text.toPlainText().length,
            ),
          );
          expect(boxes.map((b) => b.top.round()).toSet().length, 1);
        });
      }
    }
  }
}
