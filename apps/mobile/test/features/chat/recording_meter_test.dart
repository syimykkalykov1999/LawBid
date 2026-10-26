import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';

/// Owner 2026-10-20 (WhatsApp): the recording strip has its final look from
/// the first frame; bars never change width as levels arrive.
void main() {
  Future<CustomPaint> pump(WidgetTester t, List<double> levels) async {
    await t.pumpWidget(
      MaterialApp(
        theme: AppTheme.of(AppThemeId.values.first),
        home: Scaffold(
          body: Center(
            child: SizedBox(width: 300, child: RecordingMeter(levels: levels)),
          ),
        ),
      ),
    );
    return t.widget<CustomPaint>(
      find.descendant(
        of: find.byType(RecordingMeter),
        matching: find.byType(CustomPaint),
      ),
    );
  }

  final slots = RecordingMeterPainter.slotsFor(300);

  for (final n in [0, 1, 5, 40, 200]) {
    testWidgets('$n levels: always the same fixed slots and bar width', (
      t,
    ) async {
      final paint = await pump(t, List.filled(n, 0.5));
      expect(t.getSize(find.byType(RecordingMeter)).height, 24);
      final canvas = _CountCanvas();
      paint.painter!.paint(canvas, const Size(300, 24));
      // One line per slot, never more or fewer, all of one width.
      expect(canvas.lines, slots);
      expect(canvas.widths.toSet(), {kMeterBar});
    });
  }
}

class _CountCanvas implements Canvas {
  int lines = 0;
  final widths = <double>[];

  @override
  void drawLine(Offset p1, Offset p2, Paint paint) {
    lines++;
    widths.add(paint.strokeWidth);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {}
}
