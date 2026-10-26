import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/app_theme.dart';
import 'package:lawbid/features/cases/tools/signature_pad.dart';

import '../../../helpers/ux_harness.dart';

const _png = [0x89, 0x50, 0x4E, 0x47];

void main() {
  testWidgets('a drawn signature exports a non-empty PNG', (tester) async {
    final c = SignatureController();
    addTearDown(c.dispose);
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: SignaturePad(
              controller: c,
              hint: 'Sign here',
              clearLabel: 'Clear',
              semanticLabel: 'Signature pad',
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(360, 640),
      ),
    );
    expect(find.text('Sign here'), findsOneWidget);
    expect(find.bySemanticsLabel('Signature pad'), findsOneWidget);
    expect(c.isEmpty, isTrue);
    expect(await tester.runAsync(c.toPng), isNull);

    final gesture =
        await tester.startGesture(tester.getCenter(find.byType(SignaturePad)));
    await gesture.moveBy(const Offset(40, 10));
    await gesture.moveBy(const Offset(30, -20));
    await gesture.up();
    await tester.pump();
    expect(c.isEmpty, isFalse);
    expect(find.text('Sign here'), findsNothing);
    expect(find.text('Clear'), findsOneWidget);

    final png = await tester.runAsync(c.toPng);
    expect(png, isNotNull);
    expect(png!.length, greaterThan(100));
    expect(png.sublist(0, 4), _png);
    final b64 = await tester.runAsync(c.toBase64);
    expect(base64Decode(b64!).length, png.length);
    // the server takes up to 150 KB of PNG
    expect(png.length, lessThan(150000));

    await tester.tap(find.text('Clear'));
    await tester.pump();
    expect(c.isEmpty, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a single tap leaves a dot', (tester) async {
    final c = SignatureController()..start(const Offset(10, 10));
    addTearDown(c.dispose);
    final png = await tester.runAsync(c.toPng);
    expect(png, isNotNull);
    expect(png!.sublist(0, 4), _png);
  });
}
