import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/shared/presentation/qr_code_view.dart';

void main() {
  testWidgets('draws at the asked size, in RTL too, with a logo', (t) async {
    for (final dir in TextDirection.values) {
      await t.pumpWidget(
        Directionality(
          textDirection: dir,
          child: const Center(
            child: QrCodeView(
              data: 'https://lawbid.dev/u/jane_doe',
              size: 240,
              dotColor: Colors.black,
              plateColor: Colors.white,
              logo: SizedBox(width: 40, height: 40),
              semanticLabel: 'QR',
            ),
          ),
        ),
      );
      expect(t.getSize(find.byType(QrCodeView)), const Size(240, 240));
      expect(tester(t), isNull);
    }
  });
}

Object? tester(WidgetTester t) => t.takeException();
