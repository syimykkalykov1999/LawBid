import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-07: a caption in the feed shows two lines; "more" opens
/// the post instead of stretching the feed.
void main() {
  final long = [
    'Vsem privet',
    for (var i = 0; i < 40; i++) 'line $i',
    '\n\n\n\n\n\n\n\n',
    'the end',
  ].join('\n');

  testWidgets('"more" opens the post, the caption stays two lines', (t) async {
    var opened = 0;
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: PostBodyText(
              body: long,
              collapsedLines: 2,
              onMore: () => opened++,
            ),
          ),
        ),
        theme: AppTheme.dark(),
        overrides: uxOverrides(translator: const StaticTranslatorRu()),
      ),
    );
    await t.pump();
    final height = t.getSize(find.byType(PostBodyText)).height;
    await t.tapOnText(find.textRange.ofSubstring('ещё'));
    await t.pump();
    expect(opened, 1);
    expect(t.getSize(find.byType(PostBodyText)).height, height);
    // A tap on the text itself opens the post too.
    await t.tap(find.textContaining('Vsem privet', findRichText: true));
    await t.pump();
    expect(opened, 2);
    expect(height, lessThan(120));
  });

  testWidgets('without onMore (inside the post) "more" expands', (t) async {
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: PostBodyText(body: long, collapsedLines: 2),
          ),
        ),
        theme: AppTheme.dark(),
        overrides: uxOverrides(translator: const StaticTranslatorRu()),
      ),
    );
    await t.pump();
    final before = t.getSize(find.byType(PostBodyText)).height;
    await t.tapOnText(find.textRange.ofSubstring('ещё'));
    await t.pump();
    expect(t.getSize(find.byType(PostBodyText)).height, greaterThan(before));
  });

  testWidgets('a caption of one emoji keeps the normal caption size',
      (t) async {
    Future<double> sizeOf(String body) async {
      await t.pumpWidget(
        uxApp(
          Scaffold(body: PostBodyText(body: body)),
          theme: AppTheme.dark(),
          overrides: uxOverrides(translator: const StaticTranslatorRu()),
        ),
      );
      await t.pump();
      final rich = t.widget<RichText>(
        find.descendant(
          of: find.byType(PostBodyText),
          matching: find.byType(RichText),
        ),
      );
      return rich.text.style!.fontSize!;
    }

    expect(await sizeOf('\u{1F601}'), await sizeOf('Privet'));
  });
}
