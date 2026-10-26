import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

/// Owner 2026-10-15 (bug): a video post with no caption showed a lone «ещё»
/// under the icons. «ещё» is only for a caption that overflows two lines.
void main() {
  Future<void> pump(WidgetTester t, String line) async {
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SizedBox(
            width: 320,
            child: PostVideoCaption(
              post: fakePost('v1'),
              line: line,
              onMore: () {},
            ),
          ),
        ),
        theme: AppTheme.dark(),
        overrides: uxOverrides(translator: const StaticTranslatorRu()),
      ),
    );
    await t.pump();
  }

  testWidgets('an empty or blank caption draws nothing, no gap', (t) async {
    for (final line in ['', '   ', '\n \n']) {
      await pump(t, line);
      expect(find.textContaining('ещё', findRichText: true), findsNothing);
      expect(t.getSize(find.byType(PostVideoCaption)).height, 0);
    }
  });

  testWidgets('a short caption has no «ещё»', (t) async {
    await pump(t, 'Short caption');
    expect(find.textContaining('ещё', findRichText: true), findsNothing);
    expect(find.text('Short caption'), findsOneWidget);
  });

  testWidgets('a long caption ends its second line with «ещё»', (t) async {
    await pump(t, List.filled(60, 'word').join(' '));
    expect(find.textContaining('ещё', findRichText: true), findsOneWidget);
  });
}
