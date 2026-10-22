import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-22 (audit #12): the app shell follows the phone's font
/// size up to 1.3×; a message or a post's text follows it in full.
void main() {
  Future<(double, double)> scales(WidgetTester tester, double phone) async {
    late double shell;
    late double full;
    await tester.pumpWidget(
      MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(phone)),
        child: Builder(
          builder: (context) => DeviceTextScale.shell(
            context,
            child: Column(
              children: [
                Builder(
                  builder: (c) {
                    shell = MediaQuery.textScalerOf(c).scale(10) / 10;
                    return const SizedBox();
                  },
                ),
                FullTextScale(
                  child: Builder(
                    builder: (c) {
                      full = MediaQuery.textScalerOf(c).scale(10) / 10;
                      return const SizedBox();
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return (shell, full);
  }

  testWidgets('the shell stops at 1.3x, reading text goes past it',
      (tester) async {
    final (shell, full) = await scales(tester, 2);
    expect(shell, closeTo(1.3, 0.001));
    expect(full, closeTo(2, 0.001));
  });

  testWidgets('below the cap both follow the phone', (tester) async {
    final (shell, full) = await scales(tester, 1.2);
    expect(shell, closeTo(1.2, 0.001));
    expect(full, closeTo(1.2, 0.001));
  });

  testWidgets('without the shell above, FullTextScale changes nothing',
      (tester) async {
    late double seen;
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.1)),
        child: FullTextScale(
          child: Builder(
            builder: (c) {
              seen = MediaQuery.textScalerOf(c).scale(10) / 10;
              return const SizedBox();
            },
          ),
        ),
      ),
    );
    expect(seen, closeTo(1.1, 0.001));
  });
}
