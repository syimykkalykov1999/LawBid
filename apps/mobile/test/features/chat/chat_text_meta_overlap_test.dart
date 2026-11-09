import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';

/// Audit 26.10 W4: the time at the end of a text bubble's last line must
/// never sit on the text. The text is drawn with the screen's default text
/// style under the bubble's own (Material's body style adds letter
/// spacing), so the measurement has to use the same merged style.
void main() {
  Future<void> pumpBubble(WidgetTester t, String text) async {
    await t.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) {
              final type = Theme.of(context).extension<AppTypographyTokens>()!;
              return Align(
                alignment: Alignment.topLeft,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 300),
                  child: ChatTextWithMeta(
                    spans: [TextSpan(text: text)],
                    style: type.body.copyWith(height: 1.35),
                    meta: const SizedBox(
                      key: Key('meta'),
                      width: 40,
                      height: 14,
                    ),
                    metaWidth: 40,
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  testWidgets('the time never overlaps or pushes out the last line', (t) async {
    for (var n = 1; n <= 40; n++) {
      final text = List.filled(n, 'ab').join(' ');
      await pumpBubble(t, text);
      final para = t.renderObject<RenderParagraph>(find.text(text));
      final box = t.renderObject<RenderBox>(find.byType(ChatTextWithMeta));
      // The text fits in the box the bubble reserved for it.
      final lines = para.getBoxesForSelection(
        TextSelection(baseOffset: 0, extentOffset: text.length),
      );
      final textBottom =
          lines.map((b) => b.bottom).reduce((a, b) => a > b ? a : b);
      final lastLine = lines.where((b) => b.bottom == textBottom);
      final lastRight =
          lastLine.map((b) => b.right).reduce((a, b) => a > b ? a : b);
      final paraOrigin = para.localToGlobal(Offset.zero);
      final meta = t.getRect(find.byKey(const Key('meta')));
      final boxRect = box.localToGlobal(Offset.zero) & box.size;
      expect(
        paraOrigin.dy + textBottom,
        lessThanOrEqualTo(boxRect.bottom + 0.5),
        reason: 'text overflows the bubble for n=$n',
      );
      final sameRow = paraOrigin.dy + textBottom > meta.top + 0.5;
      if (sameRow) {
        expect(
          paraOrigin.dx + lastRight,
          lessThanOrEqualTo(meta.left + 0.5),
          reason: 'time overlaps the last line for n=$n',
        );
      }
    }
  });
}
