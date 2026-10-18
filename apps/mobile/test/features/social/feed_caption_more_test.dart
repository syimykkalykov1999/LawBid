import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-18 (bug): a long title cut with «…» over a short or empty
/// text had no «ещё», so the full title could never be read. «ещё» shows
/// whenever the title OR the text is cut; a tap opens both.
void main() {
  final longTitle = List.filled(30, 'заголовок').join(' ');
  final longText = List.filled(60, 'word').join(' ');

  Future<void> pump(
    WidgetTester t, {
    required String title,
    required String text,
    VoidCallback? onMore,
  }) async {
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SizedBox(
            width: 320,
            child: SingleChildScrollView(
              child: FeedCaption(
                title: title,
                text: text,
                hashtags: const [],
                onOpen: () {},
                onMore: onMore,
              ),
            ),
          ),
        ),
        theme: AppTheme.dark(),
        overrides: uxOverrides(translator: const StaticTranslatorRu()),
      ),
    );
    await t.pump();
  }

  Finder more() => find.textContaining('ещё', findRichText: true);

  Future<void> tapMore(WidgetTester t) async {
    final rich = t.widget<RichText>(
      find
          .byWidgetPredicate(
            (w) => w is RichText && w.text.toPlainText().contains('ещё'),
          )
          .first,
    );
    var hit = false;
    void walk(InlineSpan s) {
      if (s is TextSpan) {
        if (s.text == 'ещё') {
          final r = s.recognizer;
          if (r is TapGestureRecognizer) {
            r.onTap?.call();
            hit = true;
          }
        }
        s.children?.forEach(walk);
      }
    }

    walk(rich.text);
    expect(hit, isTrue);
    await t.pump();
  }

  testWidgets('long title + short text: «ещё», tap shows the full title',
      (t) async {
    await pump(t, title: longTitle, text: 'Short text');
    expect(more(), findsOneWidget);
    expect(find.text(longTitle), findsNothing);
    await tapMore(t);
    expect(more(), findsNothing);
    expect(find.text(longTitle), findsOneWidget);
    expect(
      find.textContaining('Short text', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('long title + no text: «ещё» ends the title line', (t) async {
    await pump(t, title: longTitle, text: '');
    expect(more(), findsOneWidget);
    await tapMore(t);
    expect(more(), findsNothing);
    expect(find.text(longTitle), findsOneWidget);
  });

  testWidgets('long title, inPlaceOnly host: «ещё» calls onMore', (t) async {
    var called = 0;
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: SizedBox(
            width: 320,
            child: FeedCaption(
              title: longTitle,
              text: '',
              hashtags: const [],
              onOpen: () {},
              inPlaceOnly: true,
              onMore: () => called++,
            ),
          ),
        ),
        theme: AppTheme.dark(),
        overrides: uxOverrides(translator: const StaticTranslatorRu()),
      ),
    );
    await t.pump();
    await tapMore(t);
    expect(called, 1);
  });

  testWidgets('short title + long text keeps «ещё»', (t) async {
    await pump(
      t,
      title: 'Short title',
      text: List.filled(25, 'word').join(' '),
    );
    expect(more(), findsOneWidget);
    await tapMore(t);
    expect(more(), findsNothing);
    expect(find.text('Short title'), findsOneWidget);
  });

  testWidgets('a title of two lines is shown whole, no «…» (photo post)',
      (t) async {
    const title = 'Marriage green card, step by step: the evidence file';
    await pump(t, title: title, text: longText);
    final text = t.widget<Text>(find.text(title));
    expect(text.maxLines, 2);
    final box = t.renderObject<RenderParagraph>(
      find.descendant(of: find.text(title), matching: find.byType(RichText)),
    );
    expect(box.didExceedMaxLines, isFalse);
  });

  testWidgets('nothing cut: no «ещё»', (t) async {
    await pump(t, title: 'Short title', text: 'Short text');
    expect(more(), findsNothing);
    await pump(t, title: 'Short title', text: '');
    expect(more(), findsNothing);
  });

  testWidgets('exactly one «ещё» in every case', (t) async {
    final cases = [
      (longTitle, 'Short text'),
      (longTitle, ''),
      (longTitle, longText),
      ('Short title', longText),
    ];
    for (final (title, text) in cases) {
      await pump(t, title: title, text: text);
      expect(find.textContaining('ещё', findRichText: true), findsOneWidget);
    }
  });
}
